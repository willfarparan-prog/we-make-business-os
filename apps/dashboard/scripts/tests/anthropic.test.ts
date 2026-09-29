/**
 * The studio assistant's wire parsing and suggestion merging.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeAnthropicSSE, type StreamEvent } from "@/lib/anthropic";
import { changes, mergeNewsletter, mergeProduct } from "@/lib/assistant/shape";

/** Feeds SSE text to the parser in the given chunk boundaries and collects events. */
async function parse(chunks: string[]): Promise<StreamEvent[]> {
  async function* source() {
    for (const chunk of chunks) yield chunk;
  }
  const out: StreamEvent[] = [];
  for await (const event of decodeAnthropicSSE(source())) out.push(event);
  return out;
}

const sse = (type: string, payload: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...payload })}\n\n`;

test("text deltas stream through in order", async () => {
  const events = await parse([
    sse("message_start", { message: {} }),
    sse("content_block_start", { index: 0, content_block: { type: "text" } }),
    sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Hello" } }),
    sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: ", studio" } }),
    sse("content_block_stop", { index: 0 }),
    sse("message_delta", { delta: { stop_reason: "end_turn" } }),
    sse("message_stop", {}),
  ]);
  assert.deepEqual(events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text), ["Hello", ", studio"]);
  assert.ok(events.some((e) => e.type === "done" && e.stopReason === "end_turn"));
});

test("a tool call's arguments are gathered across fragments and parsed whole", async () => {
  const events = await parse([
    sse("content_block_start", { index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "propose_newsletter_draft" } }),
    sse("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: '{"subject":"New fo' } }),
    sse("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: 'rms","preheader":"Edition' } }),
    sse("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: ' 02"}' } }),
    sse("content_block_stop", { index: 0 }),
  ]);
  const tool = events.find((e) => e.type === "tool_use");
  assert.ok(tool && tool.type === "tool_use");
  assert.equal(tool.name, "propose_newsletter_draft");
  assert.deepEqual(tool.input, { subject: "New forms", preheader: "Edition 02" });
});

test("an SSE event split across two network chunks still parses", async () => {
  // The boundary falls in the middle of the data line and again mid-JSON.
  const whole = sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: "streamed" } });
  const cut = Math.floor(whole.length / 2);
  const events = await parse([whole.slice(0, cut), whole.slice(cut)]);
  assert.deepEqual(events, [{ type: "text", text: "streamed" }]);
});

test("a tool call with unparseable JSON is dropped, not half-applied", async () => {
  const events = await parse([
    sse("content_block_start", { index: 0, content_block: { type: "tool_use", id: "t", name: "propose_newsletter_draft" } }),
    sse("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: '{"subject": "oops' } }),
    sse("content_block_stop", { index: 0 }),
  ]);
  assert.equal(events.filter((e) => e.type === "tool_use").length, 0);
});

test("interleaved text and a tool call both come through, text before the tool", async () => {
  const events = await parse([
    sse("content_block_start", { index: 0, content_block: { type: "text" } }),
    sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Here's a tighter subject." } }),
    sse("content_block_stop", { index: 0 }),
    sse("content_block_start", { index: 1, content_block: { type: "tool_use", id: "t2", name: "propose_newsletter_draft" } }),
    sse("content_block_delta", { index: 1, delta: { type: "input_json_delta", partial_json: '{"subject":"k","rationale":"tighter"}' } }),
    sse("content_block_stop", { index: 1 }),
  ]);
  const kinds = events.map((e) => e.type);
  assert.ok(kinds.indexOf("text") < kinds.indexOf("tool_use"), "text arrives before the tool call");
  const tool = events.find((e) => e.type === "tool_use");
  assert.deepEqual(tool && tool.type === "tool_use" ? tool.input : null, { subject: "k", rationale: "tighter" });
});

test("a mid-stream error surfaces as an error event", async () => {
  const events = await parse([sse("error", { error: { message: "overloaded" } })]);
  assert.deepEqual(events, [{ type: "error", message: "overloaded" }]);
});

// --- Applying a suggestion -------------------------------------------------

test("a one-field product tweak keeps the rest of the copy", () => {
  const current = { name: "Arcadia Tall Planter", material: "Wood composite · Resin", note: "An architectural planter." };
  const merged = mergeProduct(current, { kind: "product", name: null, material: null, note: "A taller lattice planter.", rationale: "" });
  assert.deepEqual(merged, { ...current, note: "A taller lattice planter." });
});

test("only fields that really change are shown for review", () => {
  const current = { subject: "New forms", preheader: "Edition 02", bodyMd: "Hello" };
  const suggestion = { kind: "newsletter" as const, subject: "New forms", preheader: "Edition 02 is here", bodyMd: null, rationale: "" };
  assert.deepEqual(changes(current, suggestion).map((change) => change.field), ["preheader"]);
  assert.deepEqual(mergeNewsletter(current, suggestion), { ...current, preheader: "Edition 02 is here" });
});
