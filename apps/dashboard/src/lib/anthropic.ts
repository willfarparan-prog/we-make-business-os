import "server-only";

/*
 * A small streaming client for the Anthropic Messages API.
 *
 * Hand-rolled with fetch rather than pulling in the SDK: one dependency-free
 * module, one place that knows the wire format. It speaks just enough of the
 * API for the studio assistant (streaming text and tool calls) and no more.
 *
 * The key is read from the environment and never sent to the browser: every
 * call to Claude happens here on the server.
 */

/** Overridable so a test or a proxy can stand in for the real endpoint. */
const API_BASE = process.env.WM_ANTHROPIC_BASE_URL?.replace(/\/$/, "") || "https://api.anthropic.com";
const API_URL = `${API_BASE}/v1/messages`;
const API_VERSION = "2023-06-01";

/** Sonnet by default — fast and strong at copy. Bump to opus for the hard asks. */
export const DEFAULT_MODEL = "claude-sonnet-5";

export type AnthropicSetup = { configured: boolean; model: string };

/** Whether the assistant can run, and which model it uses. No secret leaves this. */
export function anthropicSetup(): AnthropicSetup {
  return {
    configured: Boolean(process.env.ANTHROPIC_API_KEY),
    model: process.env.WM_ASSISTANT_MODEL?.trim() || DEFAULT_MODEL,
  };
}

export type TextBlock = { type: "text"; text: string };
export type ToolResultBlock = { type: "tool_result"; tool_use_id: string; content: string };
export type MessageContent = string | Array<TextBlock | ToolResultBlock>;
export type Message = { role: "user" | "assistant"; content: MessageContent };

export type Tool = {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
};

/** What the caller consumes: text as it arrives, then any tool calls, then the reason we stopped. */
export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "done"; stopReason: string | null }
  | { type: "error"; message: string };

type StreamOptions = {
  system: string | Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }>;
  messages: Message[];
  tools?: Tool[];
  model?: string;
  maxTokens?: number;
  signal?: AbortSignal;
};

/**
 * Streams a completion, yielding text as it lands and tool calls once each is
 * whole. A tool call's arguments arrive as a run of JSON fragments, so they're
 * gathered per content block and parsed when the block closes.
 */
export async function* streamMessages(options: StreamOptions): AsyncGenerator<StreamEvent> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    yield { type: "error", message: "The assistant isn't connected yet — no Anthropic API key is set." };
    return;
  }

  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      signal: options.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify({
        model: options.model || anthropicSetup().model,
        max_tokens: options.maxTokens ?? 3072,
        stream: true,
        system: options.system,
        tools: options.tools,
        messages: options.messages,
      }),
    });
  } catch (error) {
    yield { type: "error", message: error instanceof Error ? error.message : "Couldn't reach Claude." };
    return;
  }

  if (!response.ok || !response.body) {
    // The error body is JSON; surface its message without leaking the request.
    const detail = await response.text().catch(() => "");
    let message = `Claude returned ${response.status}.`;
    try {
      const parsed = JSON.parse(detail);
      if (parsed?.error?.message) message = parsed.error.message;
    } catch {
      // Non-JSON error body — the status line is enough.
    }
    yield { type: "error", message };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  async function* chunks(): AsyncGenerator<string> {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield decoder.decode(value, { stream: true });
      }
    } finally {
      reader.releaseLock();
    }
  }

  try {
    yield* decodeAnthropicSSE(chunks());
  } catch (error) {
    if ((error as Error)?.name !== "AbortError") {
      yield { type: "error", message: error instanceof Error ? error.message : "The stream ended unexpectedly." };
    }
  }
}

/**
 * Turns Anthropic's SSE bytes into stream events.
 *
 * Pulled out from the fetch so it can be tested without a network: text lands
 * as it arrives, and a tool call's arguments — which stream in as a run of JSON
 * fragments — are gathered per content-block index and parsed only once the
 * block closes. A tool call whose JSON never parses is dropped, never
 * half-applied.
 */
export async function* decodeAnthropicSSE(source: AsyncIterable<string>): AsyncGenerator<StreamEvent> {
  let buffer = "";
  const toolBlocks = new Map<number, { id: string; name: string; json: string }>();

  for await (const piece of source) {
    buffer += piece;
    // SSE events are separated by a blank line.
    let split;
    while ((split = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      const dataLine = rawEvent.split("\n").find((line) => line.startsWith("data:"));
      if (!dataLine) continue;
      const data = dataLine.slice(5).trim();
      if (!data || data === "[DONE]") continue;

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }

      const kind = event.type;
      if (kind === "content_block_start") {
        const block = event.content_block as { type: string; id?: string; name?: string } | undefined;
        if (block?.type === "tool_use") {
          toolBlocks.set(event.index as number, { id: block.id ?? "", name: block.name ?? "", json: "" });
        }
      } else if (kind === "content_block_delta") {
        const delta = event.delta as { type: string; text?: string; partial_json?: string };
        if (delta.type === "text_delta" && delta.text) {
          yield { type: "text", text: delta.text };
        } else if (delta.type === "input_json_delta") {
          const tool = toolBlocks.get(event.index as number);
          if (tool) tool.json += delta.partial_json ?? "";
        }
      } else if (kind === "content_block_stop") {
        const tool = toolBlocks.get(event.index as number);
        if (tool) {
          toolBlocks.delete(event.index as number);
          let input: unknown = {};
          try {
            input = tool.json ? JSON.parse(tool.json) : {};
          } catch {
            continue;
          }
          yield { type: "tool_use", id: tool.id, name: tool.name, input };
        }
      } else if (kind === "message_delta") {
        const delta = event.delta as { stop_reason?: string | null } | undefined;
        if (delta && "stop_reason" in delta) {
          yield { type: "done", stopReason: delta.stop_reason ?? null };
        }
      } else if (kind === "error") {
        const err = event.error as { message?: string } | undefined;
        yield { type: "error", message: err?.message ?? "Claude reported an error mid-stream." };
      }
    }
  }
}
