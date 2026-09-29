/** Runs once when the server starts. Opens the local sandbox database when testing with WM_LOCAL_DB. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV === "production" || !process.env.WM_LOCAL_DB) return;
  const [{ PGlite }, { drizzle }, schema, { setSandboxDatabase }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    import("./db/schema"),
    import("./db"),
  ]);
  setSandboxDatabase(drizzle({ client: new PGlite(process.env.WM_LOCAL_DB), schema }));
  console.log(`[wm] Using the local sandbox database at ${process.env.WM_LOCAL_DB} (live data is untouched)`);
}
