import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { advanceOrderAction, cancelPendingOrderAction, restockAction, saveEditionNoteAction, saveOrderNotesAction } from "@/app/actions/orders";
import { Flash, OwnerPage, PageHead, StatusBadge } from "@/components/page";
import { orderItems, orders, payments, stockMovements } from "@/db/schema";
import { isUuid } from "@/lib/forms";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

const NEXT_LABEL: Record<string, string> = { paid: "Mark packed", packed: "Mark shipped", shipped: "Mark delivered" };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return (
    <OwnerPage active="orders">
      {async ({ db }) => {
        const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
        if (!order) notFound();
        const [items, ledger, restocked] = await Promise.all([
          db.select().from(orderItems).where(eq(orderItems.orderId, id)),
          db.select().from(payments).where(eq(payments.orderId, id)),
          db.select({ productId: stockMovements.productId }).from(stockMovements).where(and(eq(stockMovements.reason, "refund_restock"), eq(stockMovements.refId, id))),
        ]);
        const address = order.shippingAddress;
        const cost = items.reduce((sum, item) => sum + item.unitCostCents * item.quantity, 0);
        const goods = items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);

        return (
          <>
            <Flash searchParams={searchParams} />
            <PageHead eyebrow={`Order · ${order.livemode ? "live" : "test mode"}`} title={`WM-${order.number}`}>
              <StatusBadge status={order.status} />
              <Link className="wm-button" data-variant="ghost" href="/orders">All orders</Link>
            </PageHead>

            <div className="wm-grid-2">
              <div className="wm-stack">
                <section className="wm-card wm-card-flush">
                  <header><h2 className="wm-display">Pieces</h2></header>
                  <div className="wm-table-wrap">
                    <table className="wm-table">
                      <thead><tr><th>Piece</th><th className="num">Qty</th><th>From</th><th className="num">Price</th><th>Edition no.</th></tr></thead>
                      <tbody>
                        {items.map((item) => {
                          const toMake = item.quantity - item.reservedQty;
                          return (
                            <tr key={item.id}>
                              <td><Link href={`/products/${item.productId}`}>{item.name}</Link></td>
                              <td className="num">{item.quantity}</td>
                              <td className="wm-small">{item.reservedQty ? `${item.reservedQty} from shelf` : ""}{item.reservedQty && toMake ? " · " : ""}{toMake ? <span className="wm-badge" data-tone="warn">{toMake} to make</span> : null}</td>
                              <td className="num">{formatCents(item.unitPriceCents * item.quantity)}</td>
                              <td>
                                <form action={saveEditionNoteAction} className="wm-row">
                                  <input type="hidden" name="id" value={order.id} /><input type="hidden" name="itemId" value={item.id} />
                                  <input className="wm-input" name="editionNote" defaultValue={item.editionNote ?? ""} placeholder="e.g. 12/50" style={{ width: 110 }} />
                                  <button className="wm-button" data-variant="ghost" data-size="sm" type="submit">Save</button>
                                </form>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>

                {NEXT_LABEL[order.status] ? (
                  <form action={advanceOrderAction} className="wm-card wm-form">
                    <header><h2 className="wm-display">Next step</h2></header>
                    <input type="hidden" name="id" value={order.id} />
                    {order.status === "packed" ? (
                      <div className="wm-fields">
                        <label className="wm-field">Carrier<select name="carrier" defaultValue="USPS"><option>USPS</option><option>UPS</option><option>FedEx</option><option>Other</option></select></label>
                        <label className="wm-field">Tracking number<input name="trackingNumber" required /></label>
                      </div>
                    ) : null}
                    <div><button className="wm-button" type="submit">{NEXT_LABEL[order.status]}</button></div>
                  </form>
                ) : null}

                {order.status === "pending" ? (
                  <form action={cancelPendingOrderAction} className="wm-card">
                    <input type="hidden" name="id" value={order.id} />
                    <p className="wm-muted" style={{ marginTop: 0 }}>This shopper is at Stripe checkout (or walked away). Unfinished checkouts close by themselves about 40 minutes after they start.</p>
                    <button className="wm-button" data-variant="danger" type="submit">Close this checkout now</button>
                  </form>
                ) : null}

                {order.status === "refunded" ? (
                  <section className="wm-card">
                    <header><h2 className="wm-display">Returned pieces</h2></header>
                    <p className="wm-muted" style={{ marginTop: 0 }}>Put pieces back on the shelf only if they came back in sellable condition.</p>
                    <ul className="wm-list">
                      {items.map((item) => (
                        <li key={item.id}>
                          <span>{item.name}</span>
                          {restocked.some((row) => row.productId === item.productId) ? <span className="wm-badge" data-tone="good">Restocked</span> : (
                            <form action={restockAction} className="wm-row">
                              <input type="hidden" name="id" value={order.id} /><input type="hidden" name="productId" value={item.productId} />
                              <input className="wm-input" name="quantity" defaultValue={item.quantity} inputMode="numeric" style={{ width: 70 }} />
                              <button className="wm-button" data-variant="ghost" data-size="sm" type="submit">Restock</button>
                            </form>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <form action={saveOrderNotesAction} className="wm-card wm-form">
                  <header><h2 className="wm-display">Notes</h2></header>
                  <input type="hidden" name="id" value={order.id} />
                  <label className="wm-field"><span className="wm-muted wm-small">Private, for the studio</span><textarea name="notes" defaultValue={order.notes ?? ""} /></label>
                  <div><button className="wm-button" data-variant="ghost" type="submit">Save notes</button></div>
                </form>
              </div>

              <div className="wm-stack">
                <section className="wm-card">
                  <header><h2 className="wm-display">Customer</h2></header>
                  <dl className="wm-kv">
                    <dt>Name</dt><dd>{order.name ?? "—"}</dd>
                    <dt>Email</dt><dd>{order.email ? <a href={`mailto:${order.email}`}>{order.email}</a> : "—"}</dd>
                    {order.contactId ? <><dt>History</dt><dd><Link href={`/customers/${order.contactId}`}>Customer page →</Link></dd></> : null}
                  </dl>
                  {address ? (
                    <address style={{ fontStyle: "normal", marginTop: 14, lineHeight: 1.6 }}>
                      <p className="wm-eyebrow">Ship to</p>
                      {address.name}<br />{address.line1}{address.line2 ? <><br />{address.line2}</> : null}<br />{address.city}, {address.state} {address.postalCode}<br />{address.country}
                    </address>
                  ) : null}
                  {order.trackingNumber ? <p style={{ marginBottom: 0 }}><span className="wm-eyebrow">Tracking</span><br />{order.carrier} {order.trackingNumber}</p> : null}
                </section>

                <section className="wm-card">
                  <header><h2 className="wm-display">Money</h2></header>
                  <dl className="wm-kv">
                    <dt>Pieces</dt><dd className="wm-mono">{formatCents(order.subtotalCents, { always: true })}</dd>
                    <dt>Shipping</dt><dd className="wm-mono">{order.shippingCents ? formatCents(order.shippingCents, { always: true }) : "Complimentary"}</dd>
                    {order.taxCents ? <><dt>Tax</dt><dd className="wm-mono">{formatCents(order.taxCents, { always: true })}</dd></> : null}
                    <dt><strong>Total</strong></dt><dd className="wm-mono"><strong>{formatCents(order.totalCents, { always: true })}</strong></dd>
                    <dt>Cost of goods</dt><dd className="wm-mono">{cost ? `${formatCents(cost, { always: true })} · ${goods ? Math.round(((goods - cost) / goods) * 100) : 0}% margin` : "—"}</dd>
                  </dl>
                  {ledger.length ? (
                    <ul className="wm-list" style={{ marginTop: 12 }}>
                      {ledger.map((row) => <li key={row.id}><span>{row.kind === "refund" ? "Refund" : "Payment"}<br /><span className="wm-muted wm-small">{row.occurredAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span></span><span className="wm-mono">{formatCents(row.amountCents, { always: true })}</span></li>)}
                    </ul>
                  ) : null}
                  {order.paymentIntentId ? <p className="wm-small" style={{ marginBottom: 0 }}><a href={`https://dashboard.stripe.com/${order.livemode ? "" : "test/"}payments/${order.paymentIntentId}`} target="_blank" rel="noreferrer">Open in Stripe →</a> (refunds happen there)</p> : null}
                </section>

                <section className="wm-card">
                  <header><h2 className="wm-display">Timeline</h2></header>
                  <dl className="wm-kv wm-small">
                    <dt>Checkout started</dt><dd>{order.createdAt.toLocaleString("en-US")}</dd>
                    {order.paidAt ? <><dt>Paid</dt><dd>{order.paidAt.toLocaleString("en-US")}</dd></> : null}
                    {order.packedAt ? <><dt>Packed</dt><dd>{order.packedAt.toLocaleString("en-US")}</dd></> : null}
                    {order.shippedAt ? <><dt>Shipped</dt><dd>{order.shippedAt.toLocaleString("en-US")}</dd></> : null}
                    {order.deliveredAt ? <><dt>Delivered</dt><dd>{order.deliveredAt.toLocaleString("en-US")}</dd></> : null}
                  </dl>
                </section>
              </div>
            </div>
          </>
        );
      }}
    </OwnerPage>
  );
}
