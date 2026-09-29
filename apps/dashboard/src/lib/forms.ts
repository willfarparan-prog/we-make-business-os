import { redirect } from "next/navigation";

/** Trimmed text from a form, capped; empty becomes "". */
export function text(form: FormData, key: string, max = 500) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** A whole number from a form, or null when blank or not a number. */
export function int(form: FormData, key: string) {
  const raw = text(form, key, 20);
  if (!/^-?\d+$/.test(raw)) return null;
  return Number.parseInt(raw, 10);
}

/** A decimal as the string Postgres numeric columns take, or null when blank or not a number. */
export function decimal(form: FormData, key: string) {
  const raw = text(form, key, 30).replace(/,/g, "");
  return /^-?\d+(\.\d+)?$/.test(raw) ? raw : null;
}

export function checked(form: FormData, key: string) {
  return form.get(key) === "on" || form.get(key) === "true";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function id(form: FormData, key = "id") {
  const value = text(form, key, 40);
  return UUID.test(value) ? value : null;
}
export const isUuid = (value: string) => UUID.test(value);

/** Back to a page with a message for the Flash banner. */
export function back(path: string, message: { notice?: string; error?: string }): never {
  const params = new URLSearchParams();
  if (message.notice) params.set("notice", message.notice);
  if (message.error) params.set("error", message.error);
  redirect(`${path}${path.includes("?") ? "&" : "?"}${params.toString()}`);
}
