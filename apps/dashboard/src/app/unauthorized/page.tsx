import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <section className="wm-card" style={{ width: "min(100%, 520px)", textAlign: "center", padding: 40 }}>
        <p className="wm-eyebrow">We+Make studio</p>
        <h1 className="wm-display" style={{ margin: "10px 0 14px" }}>Owner access only</h1>
        <p className="wm-muted" style={{ marginBottom: 26 }}>
          This dashboard only opens for the studio owner, signed in with Google (which confirms the email address). If that&apos;s you, sign out and choose Sign in with Google.
        </p>
        <Link className="wm-button" href="/auth/sign-out">Sign out</Link>
      </section>
    </main>
  );
}
