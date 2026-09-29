"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Sparkles } from "lucide-react";
import { applyNewsletterDraftAction } from "@/app/actions/newsletter";
import { applyProductCopyAction } from "@/app/actions/products";
import { changes, mergeNewsletter, mergeProduct, type AssistantContext, type NewsletterFields, type ProductFields, type Suggestion } from "@/lib/assistant/shape";
import styles from "./assistant.module.css";

/*
 * The studio assistant, on a product or a newsletter. It answers in the
 * We+Make voice; when asked to change copy, it hands back a card showing
 * exactly what would change. Nothing changes until the owner presses Apply.
 */

type Card = Suggestion & { outcome?: { ok: boolean; message: string } };
type Entry = { id: number; role: "user" | "assistant"; text: string; cards: Card[]; error?: boolean };

const STARTERS: Record<AssistantContext["kind"], string[]> = {
  product: ["Tighten the description.", "Suggest three alternative names.", "Is the material line clear?"],
  newsletter: ["Draft this issue around the current collection.", "Give me five subject lines.", "Make the body shorter and warmer."],
};

export function Assistant({ context, current, configured }: { context: AssistantContext; current: ProductFields | NewsletterFields; configured: boolean }) {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const nextId = useRef(1);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [entries]);

  if (!configured) {
    return (
      <section className={`wm-card ${styles.panel}`}>
        <div className={styles.head}><h2 className="wm-display">Studio assistant</h2><Sparkles size={18} /></div>
        <p className={styles.off}>Off until an Anthropic API key is added (ANTHROPIC_API_KEY). Once it is, Claude can draft copy here in the We+Make voice for you to review and apply.</p>
      </section>
    );
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || streaming) return;
    setInput("");
    const user: Entry = { id: nextId.current++, role: "user", text: question, cards: [] };
    const replyId = nextId.current++;
    const history = [...entries, user];
    setEntries([...history, { id: replyId, role: "assistant", text: "", cards: [] }]);
    setStreaming(true);
    const patch = (update: (entry: Entry) => Entry) => setEntries((all) => all.map((entry) => (entry.id === replyId ? update(entry) : entry)));

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ context, messages: history.map((entry) => ({ role: entry.role, text: entry.text })) }),
      });
      if (!response.ok || !response.body) {
        const detail = await response.json().catch(() => ({}));
        patch((entry) => ({ ...entry, text: detail.error ?? "The assistant couldn't answer just now.", error: true }));
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const raw = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!raw) continue;
          let event: { type: string; text?: string; message?: string; suggestion?: Suggestion };
          try {
            event = JSON.parse(raw);
          } catch {
            continue;
          }
          if (event.type === "text" && event.text) patch((entry) => ({ ...entry, text: entry.text + event.text }));
          else if (event.type === "suggestion" && event.suggestion) {
            const suggestion = event.suggestion;
            patch((entry) => ({ ...entry, cards: [...entry.cards, suggestion] }));
          } else if (event.type === "error") patch((entry) => ({ ...entry, text: entry.text || event.message || "Something went wrong.", error: !entry.text }));
        }
      }
    } catch {
      patch((entry) => ({ ...entry, text: entry.text || "The connection dropped. Try again.", error: !entry.text }));
    } finally {
      setStreaming(false);
    }
  }

  return (
    <section className={`wm-card ${styles.panel}`}>
      <div className={styles.head}><h2 className="wm-display">Studio assistant</h2><Sparkles size={18} /></div>
      <div className={styles.log} ref={log} aria-live="polite">
        {entries.length === 0 ? (
          <div className={styles.starters}>
            {STARTERS[context.kind].map((starter) => <button key={starter} type="button" onClick={() => send(starter)}>{starter}</button>)}
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className={entry.role === "user" ? styles.user : styles.assistant}>
              {entry.text || streaming ? <div className={`${styles.bubble} ${entry.error ? styles.error : ""}`}>{entry.text || <span className={styles.typing}>Thinking…</span>}</div> : null}
              {entry.cards.map((card, index) => (
                <SuggestionCard
                  key={index}
                  card={card}
                  context={context}
                  current={current}
                  onDone={(outcome) => {
                    setEntries((all) => all.map((other) => (other.id === entry.id ? { ...other, cards: other.cards.map((c, i) => (i === index ? { ...c, outcome } : c)) } : other)));
                    if (outcome.ok) router.refresh();
                  }}
                />
              ))}
            </div>
          ))
        )}
      </div>
      <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); send(input); }}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(input); } }}
          placeholder={context.kind === "product" ? "Ask about this piece's copy…" : "Ask for a draft, subject lines, edits…"}
          aria-label="Message the studio assistant"
          disabled={streaming}
        />
        <button className="wm-button" type="submit" disabled={streaming || !input.trim()} aria-label="Send"><ArrowUp size={16} /></button>
      </form>
    </section>
  );
}

function SuggestionCard({ card, context, current, onDone }: { card: Card; context: AssistantContext; current: ProductFields | NewsletterFields; onDone: (outcome: { ok: boolean; message: string }) => void }) {
  const [pending, start] = useTransition();
  const list = changes(current, card);
  const apply = () =>
    start(async () => {
      const result = card.kind === "product"
        ? await applyProductCopyAction(context.id, mergeProduct(current as ProductFields, card))
        : await applyNewsletterDraftAction(context.id, mergeNewsletter(current as NewsletterFields, card));
      onDone(result);
    });

  return (
    <div className={styles.card}>
      {card.rationale ? <p className="wm-muted">{card.rationale}</p> : null}
      {list.length === 0 ? <p className="wm-muted">No change from what&apos;s there now.</p> : list.map((change) => (
        <div key={change.field} className={styles.change}><span>{change.label}</span><div>{change.value}</div></div>
      ))}
      {card.outcome ? (
        <p className={card.outcome.ok ? styles.applied : styles.failed}>{card.outcome.message}</p>
      ) : list.length ? (
        <div><button className="wm-button" data-size="sm" type="button" onClick={apply} disabled={pending}>{pending ? "Applying…" : "Apply"}</button></div>
      ) : null}
    </div>
  );
}
