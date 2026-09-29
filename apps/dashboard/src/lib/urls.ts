/** The storefront's public URL (product images and Stripe return pages live there). */
export function siteUrl() {
  return (process.env.WM_SITE_URL || "https://we-make.vercel.app").replace(/\/$/, "");
}

/** This dashboard's own public URL. */
export function dashboardUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return (configured || "http://localhost:3100").replace(/\/$/, "");
}

/** Product images are stored site-relative (/products/…); Stripe and the dashboard need them absolute. */
export function absoluteImage(image: string) {
  if (!image) return "";
  if (/^https?:\/\//.test(image)) return image;
  return `${siteUrl()}${image.startsWith("/") ? "" : "/"}${image}`;
}
