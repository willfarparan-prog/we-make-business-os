import "server-only";
import { inArray, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { appSettings } from "@/db/schema";

export type EmailMode = "off" | "test" | "live";

export type Settings = {
  checkoutEnabled: boolean;
  shippingFlatRateCents: number;
  shippingFreeOverCents: number;
  laborRateCents: number;
  machineRateCents: number;
  emailMode: EmailMode;
  footerAddress: string;
};

export const DEFAULT_SETTINGS: Settings = {
  checkoutEnabled: true,
  shippingFlatRateCents: 1200,
  shippingFreeOverCents: 25000,
  /** Hand finishing, per hour. */
  laborRateCents: 2500,
  /** Printer time (power, wear, nozzles), per print hour. */
  machineRateCents: 150,
  emailMode: "off",
  footerAddress: "",
};

const KEYS = Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>;

function coerce<K extends keyof Settings>(key: K, value: unknown): Settings[K] | undefined {
  const fallback = DEFAULT_SETTINGS[key];
  if (typeof fallback === "boolean") return typeof value === "boolean" ? (value as Settings[K]) : undefined;
  if (typeof fallback === "number") return typeof value === "number" && Number.isFinite(value) && value >= 0 ? (value as Settings[K]) : undefined;
  if (key === "emailMode") return value === "off" || value === "test" || value === "live" ? (value as Settings[K]) : undefined;
  return typeof value === "string" ? (value as Settings[K]) : undefined;
}

export async function getSettings(db: Database | null): Promise<Settings> {
  if (!db) return { ...DEFAULT_SETTINGS };
  const rows = await db.select().from(appSettings).where(inArray(appSettings.key, KEYS));
  const settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    const key = row.key as keyof Settings;
    const value = coerce(key, row.value);
    if (value !== undefined) (settings as Record<string, unknown>)[key] = value;
  }
  return settings;
}

export async function saveSettings(db: Database, changes: Partial<Settings>) {
  for (const key of Object.keys(changes) as Array<keyof Settings>) {
    const value = coerce(key, changes[key]);
    if (value === undefined) continue;
    await db
      .insert(appSettings)
      .values({ key, value })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: sql`now()` } });
  }
}

/** Shipping for a subtotal: free at or above the threshold, otherwise the flat rate. */
export function shippingFor(subtotalCents: number, settings: Pick<Settings, "shippingFlatRateCents" | "shippingFreeOverCents">) {
  return subtotalCents >= settings.shippingFreeOverCents ? 0 : settings.shippingFlatRateCents;
}
