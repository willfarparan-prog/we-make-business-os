import { MATERIAL_KINDS, type materials } from "@/db/schema";

type Material = typeof materials.$inferSelect;

export function MaterialFields({ material }: { material?: Material }) {
  return (
    <>
      <div className="wm-fields">
        <label className="wm-field">Name<input name="name" required defaultValue={material?.name} placeholder="Epoxy casting resin" /></label>
        <label className="wm-field">SKU<input name="sku" defaultValue={material?.sku ?? ""} placeholder="optional" /></label>
        <label className="wm-field">Kind<select name="kind" defaultValue={material?.kind ?? "filament"}>{MATERIAL_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select></label>
        <label className="wm-field">Unit<input name="unit" defaultValue={material?.unit ?? "g"} placeholder="g, ml, sheet, pc" /></label>
      </div>
      <div className="wm-fields">
        <label className="wm-field">Cost per unit (cents)<input name="costPerUnitCents" inputMode="decimal" defaultValue={material?.costPerUnitCents ?? ""} placeholder="3.2" /><small>A $32 kg spool is 3.2¢ per g.</small></label>
        <label className="wm-field">Reorder at<input name="reorderPoint" inputMode="decimal" defaultValue={material?.reorderPoint ?? ""} placeholder="1000" /></label>
        <label className="wm-field">Reorder amount<input name="reorderQty" inputMode="decimal" defaultValue={material?.reorderQty ?? ""} placeholder="3000" /></label>
        <label className="wm-field">Supplier<input name="supplier" defaultValue={material?.supplier ?? ""} /></label>
      </div>
      <label className="wm-field">Notes<textarea name="notes" defaultValue={material?.notes ?? ""} style={{ minHeight: 70 }} /></label>
    </>
  );
}
