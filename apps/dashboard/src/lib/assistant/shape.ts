/*
 * Shapes shared between the assistant's route and its chat panel. Kept free of
 * `server-only` so the client component and the tests can import them.
 */

export type AssistantContext = { kind: "product"; id: string } | { kind: "newsletter"; id: string };

export type ProductFields = { name: string; material: string; note: string };
export type NewsletterFields = { subject: string; preheader: string; bodyMd: string };

export type ProductSuggestion = { kind: "product"; name: string | null; material: string | null; note: string | null; rationale: string };
export type NewsletterSuggestion = { kind: "newsletter"; subject: string | null; preheader: string | null; bodyMd: string | null; rationale: string };
export type Suggestion = ProductSuggestion | NewsletterSuggestion;

/** A field the assistant left out keeps its current value, so a one-line tweak never blanks the rest. */
export function mergeProduct(current: ProductFields, suggestion: ProductSuggestion): ProductFields {
  return { name: suggestion.name ?? current.name, material: suggestion.material ?? current.material, note: suggestion.note ?? current.note };
}

export function mergeNewsletter(current: NewsletterFields, suggestion: NewsletterSuggestion): NewsletterFields {
  return { subject: suggestion.subject ?? current.subject, preheader: suggestion.preheader ?? current.preheader, bodyMd: suggestion.bodyMd ?? current.bodyMd };
}

/** Which fields a suggestion actually changes, for the review card. */
export function changes(current: ProductFields | NewsletterFields, suggestion: Suggestion): Array<{ field: string; label: string; value: string }> {
  const labels: Record<string, string> = { name: "Name", material: "Material line", note: "Description", subject: "Subject", preheader: "Preview text", bodyMd: "Body" };
  return Object.keys(labels)
    .filter((field) => field in current)
    .map((field) => ({ field, label: labels[field], value: (suggestion as Record<string, unknown>)[field] }))
    .filter((entry): entry is { field: string; label: string; value: string } => typeof entry.value === "string" && entry.value !== (current as Record<string, string>)[entry.field]);
}
