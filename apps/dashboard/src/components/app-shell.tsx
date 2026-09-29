"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Boxes,
  Cable,
  Factory,
  LayoutDashboard,
  Mail,
  Menu,
  Package,
  Printer,
  ScrollText,
  SlidersHorizontal,
  Spool,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { NAV, type NavId } from "@/lib/navigation";
import styles from "./shell.module.css";

const ICONS: Record<NavId, LucideIcon> = {
  overview: LayoutDashboard,
  orders: Package,
  products: Boxes,
  production: Factory,
  materials: Spool,
  printers: Printer,
  customers: Users,
  newsletter: Mail,
  operations: ScrollText,
  settings: SlidersHorizontal,
  connections: Cable,
};

/** Page chrome: the dark rail on the left, the page on the ivory canvas. */
export function AppShell({ active, owner, badges = {}, children }: { active: NavId; owner: string; badges?: Partial<Record<NavId, number>>; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await authClient.signOut().catch(() => undefined);
    router.replace("/auth/sign-in");
    router.refresh();
  }

  return (
    <div className={styles.shell}>
      <aside className={`${styles.rail} ${open ? styles.railOpen : ""}`} aria-label="Primary navigation">
        <div className={styles.brand}>
          <Link href="/" className={styles.wordmark} onClick={() => setOpen(false)}>
            We<span>+</span>Make
            <small className={styles.studio}>Studio dashboard</small>
          </Link>
          <button className={styles.close} onClick={() => setOpen(false)} aria-label="Close navigation"><X size={20} /></button>
        </div>
        <nav className={styles.nav}>
          {NAV.map((item) => {
            const Icon = ICONS[item.id];
            const badge = badges[item.id];
            return (
              <Link key={item.id} href={item.href} aria-current={active === item.id ? "page" : undefined} onClick={() => setOpen(false)}>
                <Icon size={17} strokeWidth={1.8} />
                <span>{item.label}</span>
                {badge ? <small>{badge}</small> : null}
              </Link>
            );
          })}
        </nav>
        <div className={styles.account}>
          <span>Signed in as</span>
          <strong>{owner}</strong>
          <button type="button" onClick={signOut} disabled={signingOut}>{signingOut ? "Signing out…" : "Sign out"}</button>
        </div>
      </aside>
      {open ? <button className={styles.scrim} onClick={() => setOpen(false)} aria-label="Close navigation" /> : null}
      <div className={styles.main}>
        <header className={styles.topbar}>
          <button className={styles.menu} onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <strong>{NAV.find((item) => item.id === active)?.label}</strong>
        </header>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
