import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local sandbox database for `next dev` and tests only (see scripts/local-db.ts); never bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
  outputFileTracingRoot: path.join(__dirname, "../../"),
  images: { remotePatterns: [{ protocol: "https", hostname: "we-make.vercel.app" }] },
};

export default nextConfig;
