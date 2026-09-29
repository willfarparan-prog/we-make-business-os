-- The six launch products, as the storefront listed them (src/lib/seed-products.ts).
-- Run once on a new database after drizzle/*.sql. Safe to run again: existing handles are left alone.
INSERT INTO products (handle, name, category, material, price_cents, note, image, sort_order, status) VALUES
  ('arcadia-tall-planter', 'Arcadia Tall Planter', 'Planters', 'Wood composite · Resin', 11800, 'An architectural planter framed in warm lattice, turquoise resin, and brass-tone inlay.', '/products/we-make-material-edition/arcadia-tall-planter.png', 1, 'active'),
  ('tidal-mosaic-catchall', 'Tidal Mosaic Catchall', 'Table objects', 'Resin mosaic · Wood composite', 9600, 'A hand-set turquoise mosaic field held by an ivory frame and fine brass edge.', '/products/we-make-material-edition/tidal-mosaic-catchall.png', 2, 'active'),
  ('aurelia-dry-stem-vase', 'Aurelia Dry-Stem Vase', 'Vases', 'Wood composite · Resin', 8800, 'A twisting lattice vase crowned with a jewel-like turquoise resin collar.', '/products/we-make-material-edition/aurelia-dry-stem-vase.png', 3, 'active'),
  ('axis-desk-caddy', 'Axis Desk Caddy', 'Desk objects', 'Wood composite · Resin', 7600, 'A low architectural organizer with dedicated wells and brass-tone dividers.', '/products/we-make-material-edition/axis-desk-caddy.png', 4, 'active'),
  ('solstice-countertop-vessel', 'Solstice Countertop Vessel', 'Kitchen decor', 'Wood composite · Resin', 8200, 'A weighted countertop vessel finished with turquoise resin and a brass horizon.', '/products/we-make-material-edition/solstice-countertop-vessel.png', 5, 'active'),
  ('strata-gallery-tray', 'Strata Gallery Tray', 'Table objects', 'Resin mosaic · Wood composite', 13800, 'A long-format gallery tray with translucent mosaic and warm lattice handles.', '/products/we-make-material-edition/strata-gallery-tray.png', 6, 'active')
ON CONFLICT (handle) DO NOTHING;

INSERT INTO product_stock (product_id) SELECT id FROM products ON CONFLICT (product_id) DO NOTHING;
