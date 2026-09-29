/** Whole dollars when the cents are zero ($118), otherwise two places ($11.50). */
export function formatCents(cents: number, options: { always?: boolean } = {}) {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const rest = abs % 100;
  const whole = dollars.toLocaleString("en-US");
  const text = rest === 0 && !options.always ? `$${whole}` : `$${whole}.${String(rest).padStart(2, "0")}`;
  return negative ? `−${text}` : text;
}

/** Parses "118", "$118.50" or "1,200" into cents; null for anything else. */
export function parseDollars(input: FormDataEntryValue | string | null | undefined): number | null {
  if (typeof input !== "string") return null;
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/** Cents as an editable dollar string for form fields. */
export function centsToInput(cents: number) {
  return (cents / 100).toFixed(2).replace(/\.00$/, "");
}
