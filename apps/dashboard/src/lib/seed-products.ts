/**
 * The six pieces on the storefront when the dashboard took over its catalog,
 * exactly as the site listed them. Used to seed a new database (production
 * and the local sandbox) and mirrored by the site's offline fallback.
 */
export const LAUNCH_PRODUCTS = [
  { handle: "arcadia-tall-planter", name: "Arcadia Tall Planter", category: "Planters", material: "Wood composite · Resin", priceCents: 11800, note: "An architectural planter framed in warm lattice, turquoise resin, and brass-tone inlay." },
  { handle: "tidal-mosaic-catchall", name: "Tidal Mosaic Catchall", category: "Table objects", material: "Resin mosaic · Wood composite", priceCents: 9600, note: "A hand-set turquoise mosaic field held by an ivory frame and fine brass edge." },
  { handle: "aurelia-dry-stem-vase", name: "Aurelia Dry-Stem Vase", category: "Vases", material: "Wood composite · Resin", priceCents: 8800, note: "A twisting lattice vase crowned with a jewel-like turquoise resin collar." },
  { handle: "axis-desk-caddy", name: "Axis Desk Caddy", category: "Desk objects", material: "Wood composite · Resin", priceCents: 7600, note: "A low architectural organizer with dedicated wells and brass-tone dividers." },
  { handle: "solstice-countertop-vessel", name: "Solstice Countertop Vessel", category: "Kitchen decor", material: "Wood composite · Resin", priceCents: 8200, note: "A weighted countertop vessel finished with turquoise resin and a brass horizon." },
  { handle: "strata-gallery-tray", name: "Strata Gallery Tray", category: "Table objects", material: "Resin mosaic · Wood composite", priceCents: 13800, note: "A long-format gallery tray with translucent mosaic and warm lattice handles." },
].map((product, index) => ({ ...product, image: `/products/we-make-material-edition/${product.handle}.png`, sortOrder: index + 1, status: "active" as const }));
