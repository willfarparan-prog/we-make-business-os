import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";

// Local preview (next dev + WM_DEV_PREVIEW=1) skips sign-in; see src/lib/auth/owner.ts.
const devPreview = process.env.NODE_ENV === "development" && process.env.WM_DEV_PREVIEW === "1";

export default devPreview ? () => NextResponse.next() : auth.middleware({ loginUrl: "/auth/sign-in" });

/*
 * Owner pages only. The storefront's endpoints (/api/catalog, /api/checkout,
 * /api/newsletter), provider webhooks, unsubscribe links and /api/health must
 * stay reachable without a session, so they are deliberately not listed.
 * Every page and action still re-checks with requireOwner().
 *
 * /auth/continue must be listed: Google sign-in returns there with a one-time
 * verifier, and only this middleware exchanges it for the session cookie.
 */
export const config = {
  matcher: [
    "/",
    "/auth/continue",
    "/products/:path*",
    "/orders/:path*",
    "/customers/:path*",
    "/production/:path*",
    "/materials/:path*",
    "/printers/:path*",
    "/newsletter/:path*",
    "/operations/:path*",
    "/settings/:path*",
    "/connections/:path*",
    "/api/assistant/:path*",
  ],
};
