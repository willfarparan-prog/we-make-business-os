import "server-only";

/*
 * The one door to Resend. A plain fetch, like the Anthropic client: one module
 * that knows the wire format and nothing else. Whether anything may be sent at
 * all is decided by the caller from the email mode (off / test / live).
 */

const RESEND_URL = "https://api.resend.com/emails";

export function emailSetup() {
  return {
    configured: Boolean(process.env.RESEND_API_KEY),
    from: process.env.RESEND_FROM_EMAIL || "We+Make <onboarding@resend.dev>",
    replyTo: process.env.WM_REPLY_TO || "hello@wemake.studio",
  };
}

export type OutgoingEmail = { to: string; subject: string; html: string; text: string; headers?: Record<string, string> };
export type SendResult = { ok: true; id: string | null } | { ok: false; error: string };

let override: ((email: OutgoingEmail) => Promise<SendResult>) | null = null;

/** Tests capture outgoing mail instead of calling Resend. */
export function setEmailSenderForTests(sender: typeof override) {
  override = sender;
}

export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  if (override) return override(email);
  const setup = emailSetup();
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "Resend isn't connected (no RESEND_API_KEY)." };
  try {
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: setup.from, reply_to: setup.replyTo, to: [email.to], subject: email.subject, html: email.html, text: email.text, headers: email.headers }),
    });
    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
    return response.ok ? { ok: true, id: body.id ?? null } : { ok: false, error: body.message ?? `Resend returned ${response.status}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't reach Resend." };
  }
}
