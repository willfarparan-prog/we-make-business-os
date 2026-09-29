import type { Metadata } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const sans = Manrope({ variable: "--font-sans", subsets: ["latin"] });
const serif = Cormorant_Garamond({ variable: "--font-serif", subsets: ["latin"], weight: ["400", "500", "600"], style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: { default: "We+Make Studio", template: "%s · We+Make Studio" },
  description: "The We+Make business dashboard: catalog, orders, production, materials and newsletter.",
  icons: [{ rel: "icon", url: "/favicon.svg" }],
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // The auth UI's theme provider sets color-scheme on <html> after hydration.
    <html lang="en" className={`${sans.variable} ${serif.variable}`} suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
