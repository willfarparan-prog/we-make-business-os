import { AuthView } from "@neondatabase/auth-ui";
import { authViewPaths } from "@neondatabase/auth-ui/server";
import styles from "./page.module.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.values(authViewPaths).map((path) => ({ path }));
}

export default async function AuthPage({ params }: { params: Promise<{ path: string }> }) {
  const { path } = await params;

  return (
    <main className={styles.shell}>
      <section className={styles.brandPanel}>
        <p className={styles.wordmark}>We<span>+</span>Make</p>
        <div className={styles.message}>
          <p className="wm-eyebrow">Studio dashboard</p>
          <h1>Objects with<br />a point of view.</h1>
          <span>Catalog, orders, production and the newsletter, in one place.</span>
        </div>
        <footer>Objects for considered living.</footer>
      </section>
      <section className={styles.authPanel}>
        <div className={styles.notice}>
          <strong>Owner access</strong>
          <small>Sign in with the studio owner&apos;s email. It must be verified before the dashboard opens.</small>
        </div>
        <AuthView path={path} />
      </section>
    </main>
  );
}
