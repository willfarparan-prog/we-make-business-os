import { saveSettingsAction } from "@/app/actions/settings";
import { Flash, OwnerPage, PageHead } from "@/components/page";
import { centsToInput } from "@/lib/money";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <OwnerPage active="settings">
      {async ({ db }) => {
        const settings = await getSettings(db);
        return (
          <>
            <Flash searchParams={searchParams} />
            <PageHead eyebrow="Studio" title="Settings" />
            <form action={saveSettingsAction} className="wm-stack" style={{ maxWidth: 820 }}>
              <section className="wm-card wm-form">
                <header><h2 className="wm-display">Store</h2></header>
                <label className="wm-check"><input type="checkbox" name="checkoutEnabled" defaultChecked={settings.checkoutEnabled} /><span><strong>Checkout open</strong><br /><span className="wm-muted wm-small">Untick to pause buying on the site (during a holiday or a stock count). The catalog still shows.</span></span></label>
                <div className="wm-fields">
                  <label className="wm-field">Flat shipping (USD)<input name="shippingFlatRate" inputMode="decimal" defaultValue={centsToInput(settings.shippingFlatRateCents)} /></label>
                  <label className="wm-field">Free shipping from (USD)<input name="shippingFreeOver" inputMode="decimal" defaultValue={centsToInput(settings.shippingFreeOverCents)} /><small>The site&apos;s banner says $250.</small></label>
                </div>
              </section>
              <section className="wm-card wm-form">
                <header><h2 className="wm-display">Costing</h2></header>
                <div className="wm-fields">
                  <label className="wm-field">Finishing labor, per hour (USD)<input name="laborRate" inputMode="decimal" defaultValue={centsToInput(settings.laborRateCents)} /></label>
                  <label className="wm-field">Machine time, per print hour (USD)<input name="machineRate" inputMode="decimal" defaultValue={centsToInput(settings.machineRateCents)} /><small>Power, nozzles, wear.</small></label>
                </div>
              </section>
              <section className="wm-card wm-form">
                <header><h2 className="wm-display">Email</h2></header>
                <label className="wm-field">Mode
                  <select name="emailMode" defaultValue={settings.emailMode}>
                    <option value="off">Off: nothing sends</option>
                    <option value="test">Test: previews to me only</option>
                    <option value="live">Live: approved issues go to subscribers</option>
                  </select>
                </label>
                <label className="wm-field">Studio mailing address<input name="footerAddress" defaultValue={settings.footerAddress} placeholder="We+Make · street, city, state ZIP" /><small>Required by law in every marketing email before Live can be turned on.</small></label>
              </section>
              <div><button className="wm-button" type="submit">Save settings</button></div>
            </form>
          </>
        );
      }}
    </OwnerPage>
  );
}
