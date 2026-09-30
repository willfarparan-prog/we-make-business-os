/** Who gets in, and that nothing from the gym dashboard this was modelled on came along. */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { isVerifiedOwner } from "@/lib/auth/policy";
import { allowedOrigin } from "@/lib/site-origins";

test("only the owner's verified address opens the dashboard", () => {
  assert.equal(isVerifiedOwner("Owner@Example.com", true, "owner@example.com"), true);
  assert.equal(isVerifiedOwner("owner@example.com", false, "owner@example.com"), false, "an unverified sign-up under the owner's email");
  assert.equal(isVerifiedOwner("owner@example.com", undefined, "owner@example.com"), false);
  assert.equal(isVerifiedOwner("someone@example.com", true, "owner@example.com"), false);
  assert.equal(isVerifiedOwner("owner@example.com", true, undefined), false, "no owner configured means nobody");
});

test("the sign-in return page runs the auth middleware, and public endpoints don't", () => {
  // Google sign-in lands on /auth/continue with a one-time verifier that only
  // the middleware exchanges for the session cookie (dashboard/proxy.ts).
  const proxy = readFileSync("proxy.ts", "utf8");
  const matcher = proxy.slice(proxy.indexOf("matcher"));
  assert.match(matcher, /"\/auth\/continue"/);
  for (const open of ["/api/catalog", "/api/checkout", "/api/newsletter", "/api/webhooks", "/api/health", "/api/unsubscribe"]) {
    assert.equal(matcher.includes(`"${open}`), false, `${open} must stay public`);
  }
});

test("only the storefront's origins may call from a browser", () => {
  assert.equal(allowedOrigin("https://we-make.vercel.app"), "https://we-make.vercel.app");
  assert.equal(allowedOrigin("https://evil.example"), null);
  assert.equal(allowedOrigin(null), null);
});

function files(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const full = path.join(directory, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

test("no gym leftovers: names, env prefixes, project ids or the old Shopify store", () => {
  const banned = /diamond|\bDEA_|\bdea[_.:]|\bgym\b|prj_68RS|prj_VFA|myshopify/i;
  for (const file of [...files("src"), ...files("drizzle"), ...files("seeds"), "proxy.ts", "next.config.ts", "vercel.json"]) {
    const text = readFileSync(file, "utf8");
    const hit = text.match(banned);
    assert.equal(hit, null, `${file} mentions "${hit?.[0]}"`);
  }
});
