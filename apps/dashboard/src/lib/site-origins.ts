/*
 * Which websites may call the dashboard's public endpoints from a browser.
 *
 * The storefront normally calls through its own server routes, so this is a
 * second layer. Extra origins (a new domain) go in WM_SITE_ORIGINS, comma separated.
 */

const DEFAULT_ORIGINS = [
  "https://we-make.vercel.app",
  "https://lumaform-beta.vercel.app",
  "http://localhost:3200",
];

export function allowedOrigin(origin: string | null) {
  if (!origin) return null;
  const configured = (process.env.WM_SITE_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  return [...DEFAULT_ORIGINS, ...configured].includes(origin) ? origin : null;
}

export function corsHeaders(origin: string | null, methods = "GET, POST, OPTIONS"): Record<string, string> {
  const allowed = allowedOrigin(origin);
  const base: Record<string, string> = { Vary: "Origin" };
  return allowed
    ? { ...base, "Access-Control-Allow-Origin": allowed, "Access-Control-Allow-Methods": methods, "Access-Control-Allow-Headers": "Content-Type" }
    : base;
}
