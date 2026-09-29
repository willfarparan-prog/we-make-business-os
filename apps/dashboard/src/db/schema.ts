import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/*
 * The whole We+Make database. Money is always integer cents; material
 * quantities and per-unit costs are numerics (a gram of resin costs a fraction
 * of a cent). Every table here is mirrored by drizzle/*.sql, which is what
 * production actually runs — scripts/tests/migration.test.ts keeps them equal.
 */

const createdAt = timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const newToken = () => randomBytes(24).toString("base64url");

/* ─────────────────────────── Customers ─────────────────────────── */

/** Everyone we know by email: newsletter subscribers and people who bought. Emails are stored lowercased. */
export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    /** subscriber (newsletter only) or customer (has paid for an order). */
    type: text("type").notNull().default("subscriber"),
    source: text("source"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    notes: text("notes"),
    stripeCustomerId: text("stripe_customer_id"),
    unsubscribeToken: text("unsubscribe_token").notNull().$defaultFn(newToken),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("contacts_email_idx").on(table.email),
    uniqueIndex("contacts_unsubscribe_token_idx").on(table.unsubscribeToken),
  ],
);

/** Marketing consent history. The latest row per contact and channel wins. A purchase is not consent. */
export const consentRecords = pgTable(
  "consent_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().default("email"),
    granted: boolean("granted").notNull(),
    source: text("source").notNull(),
    ip: text("ip"),
    createdAt,
  },
  (table) => [index("consent_records_contact_idx").on(table.contactId, table.createdAt)],
);

/** A customer's timeline: subscribed, ordered, shipped, unsubscribed. */
export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata").$type<Record<string, string | number | boolean | null>>().default({}).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("activities_contact_idx").on(table.contactId, table.occurredAt)],
);

/* ─────────────────────────── Catalog & stock ─────────────────────────── */

export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    handle: text("handle").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    material: text("material").notNull().default(""),
    note: text("note").notNull().default(""),
    priceCents: integer("price_cents").notNull(),
    status: text("status").notNull().default("draft"),
    /** A site-relative path (/products/…) or an absolute https URL. */
    image: text("image").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    /** Sold when out of stock and made for the order; the site shows the lead time. */
    madeToOrder: boolean("made_to_order").notNull().default(true),
    leadTime: text("lead_time").notNull().default("Made to order in 2–3 weeks."),
    editionSize: integer("edition_size"),
    printHours: numeric("print_hours", { precision: 8, scale: 2 }).notNull().default("0"),
    laborMinutes: integer("labor_minutes").notNull().default(0),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("products_handle_idx").on(table.handle),
    check("products_price_check", sql`${table.priceCents} >= 0`),
  ],
);

/** Finished pieces on the shelf. `reserved` is held by unpaid checkouts. */
export const productStock = pgTable(
  "product_stock",
  {
    productId: uuid("product_id").primaryKey().references(() => products.id, { onDelete: "cascade" }),
    onHand: integer("on_hand").notNull().default(0),
    reserved: integer("reserved").notNull().default(0),
    lowThreshold: integer("low_threshold").notNull().default(2),
    updatedAt,
  },
  (table) => [
    check("product_stock_on_hand_check", sql`${table.onHand} >= 0`),
    check("product_stock_reserved_check", sql`${table.reserved} >= 0 and ${table.reserved} <= ${table.onHand}`),
  ],
);

/** Every change to finished stock, with why. Unique per (reason, ref, product) so a replay changes nothing. */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    refId: text("ref_id"),
    actor: text("actor"),
    note: text("note"),
    createdAt,
  },
  (table) => [
    uniqueIndex("stock_movements_ref_idx").on(table.reason, table.refId, table.productId),
    index("stock_movements_product_idx").on(table.productId, table.createdAt),
  ],
);

/* ─────────────────────────── Orders & money ─────────────────────────── */

export const ORDER_STATUSES = ["pending", "paid", "packed", "shipped", "delivered", "expired", "cancelled", "refunded"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** A checkout. While `pending`, its items' reserved_qty is held against stock. */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number").notNull().generatedAlwaysAsIdentity({ name: "orders_number_seq", startWith: 1001 }),
    status: text("status").notNull().default("pending"),
    source: text("source").notNull().default("website"),
    checkoutSessionId: text("checkout_session_id"),
    paymentIntentId: text("payment_intent_id"),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    email: text("email"),
    name: text("name"),
    shippingAddress: jsonb("shipping_address").$type<Record<string, string | null>>(),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    shippingCents: integer("shipping_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    carrier: text("carrier"),
    trackingNumber: text("tracking_number"),
    notes: text("notes"),
    livemode: boolean("livemode").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    packedAt: timestamp("packed_at", { withTimezone: true }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    stockCommittedAt: timestamp("stock_committed_at", { withTimezone: true }),
    stockReleasedAt: timestamp("stock_released_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("orders_number_idx").on(table.number),
    uniqueIndex("orders_checkout_session_idx").on(table.checkoutSessionId),
    index("orders_status_idx").on(table.status, table.createdAt),
    index("orders_contact_idx").on(table.contactId),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => products.id),
    handle: text("handle").notNull(),
    name: text("name").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    quantity: integer("quantity").notNull(),
    /** Pieces taken from the shelf; the rest (quantity − reserved_qty) are made for this order. */
    reservedQty: integer("reserved_qty").notNull().default(0),
    /** Cost of goods per piece when ordered, so margins don't move when costs change later. */
    unitCostCents: integer("unit_cost_cents").notNull().default(0),
    editionNote: text("edition_note"),
  },
  (table) => [
    uniqueIndex("order_items_order_product_idx").on(table.orderId, table.productId),
    check("order_items_quantity_check", sql`${table.quantity} > 0 and ${table.reservedQty} >= 0 and ${table.reservedQty} <= ${table.quantity}`),
  ],
);

/** The money ledger: payments positive, refunds negative. `stripe_ref` (cs_… or re_…) makes webhook replays harmless. */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    stripeRef: text("stripe_ref").notNull(),
    paymentIntentId: text("payment_intent_id"),
    description: text("description"),
    livemode: boolean("livemode").notNull().default(false),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("payments_stripe_ref_idx").on(table.stripeRef),
    index("payments_time_idx").on(table.occurredAt),
  ],
);

/** Every provider webhook, stored raw first so a handler bug can be replayed. */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    processed: boolean("processed").notNull().default(false),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("webhook_events_provider_event_idx").on(table.provider, table.providerEventId)],
);

/* ─────────────────────────── Production ─────────────────────────── */

export const PRINTER_STATUSES = ["idle", "printing", "maintenance", "offline"] as const;

export const printers = pgTable("printers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  model: text("model").notNull().default(""),
  status: text("status").notNull().default("idle"),
  totalPrintHours: numeric("total_print_hours", { precision: 10, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdAt,
  updatedAt,
});

export const maintenanceLogs = pgTable(
  "maintenance_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    printerId: uuid("printer_id").notNull().references(() => printers.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    performedAt: timestamp("performed_at", { withTimezone: true }).defaultNow().notNull(),
    hoursAt: numeric("hours_at", { precision: 10, scale: 2 }),
    costCents: integer("cost_cents").notNull().default(0),
    nextDueHours: numeric("next_due_hours", { precision: 10, scale: 2 }),
    notes: text("notes"),
    createdAt,
  },
  (table) => [index("maintenance_logs_printer_idx").on(table.printerId, table.performedAt)],
);

export const BATCH_STATUSES = ["planned", "printing", "casting", "finishing", "qc", "completed", "cancelled"] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];
export const BATCH_STEPS = ["print", "cast", "sand", "inlay", "qc", "pack"] as const;

/** One small-batch run of a product. Completing it adds good pieces to stock exactly once (stock_posted_at). */
export const productionBatches = pgTable(
  "production_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    productId: uuid("product_id").notNull().references(() => products.id),
    plannedQty: integer("planned_qty").notNull(),
    goodQty: integer("good_qty").notNull().default(0),
    rejectQty: integer("reject_qty").notNull().default(0),
    status: text("status").notNull().default("planned"),
    printerId: uuid("printer_id").references(() => printers.id, { onDelete: "set null" }),
    editionStart: integer("edition_start"),
    editionEnd: integer("edition_end"),
    notes: text("notes"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    stockPostedAt: timestamp("stock_posted_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("production_batches_code_idx").on(table.code),
    index("production_batches_status_idx").on(table.status),
    check("production_batches_qty_check", sql`${table.plannedQty} > 0 and ${table.goodQty} >= 0 and ${table.rejectQty} >= 0`),
  ],
);

export const batchSteps = pgTable(
  "batch_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id").notNull().references(() => productionBatches.id, { onDelete: "cascade" }),
    step: text("step").notNull(),
    done: boolean("done").notNull().default(false),
    minutes: integer("minutes"),
    notes: text("notes"),
    doneAt: timestamp("done_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("batch_steps_batch_step_idx").on(table.batchId, table.step)],
);

/* ─────────────────────────── Materials ─────────────────────────── */

export const MATERIAL_KINDS = ["filament", "resin", "pigment", "sheet", "metal", "hardware", "packaging", "abrasive", "other"] as const;

export const materials = pgTable(
  "materials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sku: text("sku"),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("other"),
    /** g, ml, sheet, pc … — quantities and costs below are per this unit. */
    unit: text("unit").notNull().default("g"),
    onHand: numeric("on_hand", { precision: 14, scale: 3 }).notNull().default("0"),
    reorderPoint: numeric("reorder_point", { precision: 14, scale: 3 }).notNull().default("0"),
    reorderQty: numeric("reorder_qty", { precision: 14, scale: 3 }).notNull().default("0"),
    costPerUnitCents: numeric("cost_per_unit_cents", { precision: 14, scale: 4 }).notNull().default("0"),
    supplier: text("supplier"),
    notes: text("notes"),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex("materials_sku_idx").on(table.sku)],
);

export const materialMovements = pgTable(
  "material_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    materialId: uuid("material_id").notNull().references(() => materials.id, { onDelete: "cascade" }),
    delta: numeric("delta", { precision: 14, scale: 3 }).notNull(),
    reason: text("reason").notNull(),
    refId: text("ref_id"),
    actor: text("actor"),
    note: text("note"),
    createdAt,
  },
  (table) => [
    uniqueIndex("material_movements_ref_idx").on(table.reason, table.refId, table.materialId),
    index("material_movements_material_idx").on(table.materialId, table.createdAt),
  ],
);

/** The bill of materials: how much of each material one finished piece uses, before waste. */
export const productMaterials = pgTable(
  "product_materials",
  {
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    materialId: uuid("material_id").notNull().references(() => materials.id, { onDelete: "cascade" }),
    qtyPerPiece: numeric("qty_per_piece", { precision: 14, scale: 3 }).notNull(),
    wasteFactor: numeric("waste_factor", { precision: 6, scale: 3 }).notNull().default("1.1"),
  },
  (table) => [primaryKey({ columns: [table.productId, table.materialId] })],
);

/* ─────────────────────────── Newsletter ─────────────────────────── */

export const CAMPAIGN_STATUSES = ["draft", "approved", "sent"] as const;

export const newsletterCampaigns = pgTable("newsletter_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  subject: text("subject").notNull(),
  preheader: text("preheader").notNull().default(""),
  bodyMd: text("body_md").notNull().default(""),
  status: text("status").notNull().default("draft"),
  audienceTag: text("audience_tag").notNull().default("newsletter"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  sentCount: integer("sent_count").notNull().default(0),
  createdAt,
  updatedAt,
});

/** One row per email handed to Resend. A broadcast reaches each contact at most once. */
export const emailSends = pgTable(
  "email_sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id").references(() => newsletterCampaigns.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    toEmail: text("to_email").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    providerId: text("provider_id"),
    error: text("error"),
    createdAt,
  },
  (table) => [
    uniqueIndex("email_sends_broadcast_idx").on(table.campaignId, table.contactId).where(sql`${table.kind} = 'broadcast'`),
    index("email_sends_time_idx").on(table.createdAt),
  ],
);

/* ─────────────────────────── Operations ─────────────────────────── */

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt,
});

/**
 * A durable record of consequential dashboard changes. Metadata is limited to
 * identifiers and state transitions; never message bodies, credentials, or provider payloads.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata").$type<Record<string, string | number | boolean | null>>().default({}).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_events_time_idx").on(table.occurredAt),
    index("audit_events_entity_time_idx").on(table.entityType, table.entityId, table.occurredAt),
  ],
);
