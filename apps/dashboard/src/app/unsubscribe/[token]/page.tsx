import { unsubscribeAction } from "@/app/actions/public";

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params;
  const { done } = await searchParams;
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <section className="wm-card" style={{ width: "min(100%, 480px)", textAlign: "center", padding: 40 }}>
        <p className="wm-display" style={{ fontSize: 30, fontWeight: 600 }}>We<span style={{ color: "var(--gold)" }}>+</span>Make</p>
        {done ? (
          <>
            <h1 className="wm-display" style={{ margin: "18px 0 10px", fontSize: 30 }}>You&apos;re unsubscribed.</h1>
            <p className="wm-muted">You won&apos;t receive Notes from the Studio any more. Thank you for reading.</p>
          </>
        ) : (
          <>
            <h1 className="wm-display" style={{ margin: "18px 0 10px", fontSize: 30 }}>Unsubscribe from Notes from the Studio?</h1>
            <p className="wm-muted" style={{ marginBottom: 24 }}>You&apos;ll stop receiving the newsletter. Order emails aren&apos;t affected.</p>
            <form action={unsubscribeAction}>
              <input type="hidden" name="token" value={token} />
              <button className="wm-button" type="submit">Unsubscribe</button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
