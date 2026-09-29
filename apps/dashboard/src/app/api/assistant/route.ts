import { asc, eq, ne } from "drizzle-orm";
import { getDatabase } from "@/db";
import { newsletterCampaigns, products } from "@/db/schema";
import { anthropicSetup, streamMessages, type Message } from "@/lib/anthropic";
import { NEWSLETTER_TOOL, PRODUCT_TOOL, newsletterPrompt, productPrompt } from "@/lib/assistant/prompt";
import { getOwner } from "@/lib/auth/owner";
import { getSettings } from "@/lib/settings";

/*
 * The studio assistant's endpoint. Owner-only, because it spends the Anthropic
 * key. It streams newline-delimited JSON: text as Claude writes it, then any
 * proposed change as a "suggestion" the panel shows as a card to apply.
 */

export const maxDuration = 60;

const MAX_MESSAGES = 40;
const MAX_CHARS = 12_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Incoming = { context?: { kind?: string; id?: string }; messages?: Array<{ role?: string; text?: unknown }> };

const str = (value: unknown) => (typeof value === "string" ? value : null);

export async function POST(request: Request) {
  if (!(await getOwner())) return Response.json({ error: "Only the owner can use the assistant." }, { status: 403 });
  if (!anthropicSetup().configured) return Response.json({ error: "The assistant isn't connected. Add an ANTHROPIC_API_KEY to turn it on." }, { status: 503 });
  const db = getDatabase();
  if (!db) return Response.json({ error: "The database isn't connected." }, { status: 503 });

  const payload = (await request.json().catch(() => null)) as Incoming | null;
  const kind = payload?.context?.kind;
  const id = payload?.context?.id ?? "";
  if ((kind !== "product" && kind !== "newsletter") || !UUID.test(id)) return Response.json({ error: "Unknown context." }, { status: 400 });

  const messages: Message[] = (Array.isArray(payload?.messages) ? payload.messages : [])
    .filter((message): message is { role: "user" | "assistant"; text: string } => (message.role === "user" || message.role === "assistant") && typeof message.text === "string" && message.text.trim().length > 0)
    .slice(-MAX_MESSAGES)
    .map((message) => ({ role: message.role, content: message.text.slice(0, MAX_CHARS) }));
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") return Response.json({ error: "Send at least one message, ending with yours." }, { status: 400 });

  let system: string;
  let tool;
  if (kind === "product") {
    const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!product) return Response.json({ error: "That product no longer exists." }, { status: 404 });
    const others = await db.select({ name: products.name, material: products.material, note: products.note }).from(products).where(ne(products.id, id)).orderBy(asc(products.sortOrder)).limit(30);
    system = productPrompt(product, others);
    tool = PRODUCT_TOOL;
  } else {
    const [campaign] = await db.select().from(newsletterCampaigns).where(eq(newsletterCampaigns.id, id)).limit(1);
    if (!campaign) return Response.json({ error: "That newsletter no longer exists." }, { status: 404 });
    const collection = await db.select().from(products).where(eq(products.status, "active")).orderBy(asc(products.sortOrder)).limit(30);
    system = newsletterPrompt(campaign, collection, { freeOverCents: (await getSettings(db)).shippingFreeOverCents });
    tool = NEWSLETTER_TOOL;
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (object: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(object)}\n`));
      try {
        for await (const event of streamMessages({ system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], messages, tools: [tool], signal: request.signal })) {
          if (event.type === "text") send({ type: "text", text: event.text });
          else if (event.type === "error") send({ type: "error", message: event.message });
          else if (event.type === "tool_use" && event.name === tool.name) {
            const input = (event.input ?? {}) as Record<string, unknown>;
            send(
              kind === "product"
                ? { type: "suggestion", suggestion: { kind, name: str(input.name), material: str(input.material), note: str(input.note), rationale: str(input.rationale) ?? "" } }
                : { type: "suggestion", suggestion: { kind, subject: str(input.subject), preheader: str(input.preheader), bodyMd: str(input.bodyMd), rationale: str(input.rationale) ?? "" } },
            );
          }
        }
        send({ type: "done" });
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : "The assistant stopped unexpectedly." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
