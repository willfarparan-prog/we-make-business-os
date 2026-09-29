import type { Metadata } from 'next';
import { Cormorant_Garamond, Manrope } from 'next/font/google';
import './globals.css';

const sans = Manrope({
  variable: '--font-sans-custom',
  subsets: ['latin'],
});

const serif = Cormorant_Garamond({
  variable: '--font-serif-custom',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://we-make.vercel.app'),
  title: 'We+Make — Objects for Considered Living',
  description:
    'Sculptural decor shaped by digital craft and finished by hand in wood composite, resin, glass, mosaic, and metal.',
  openGraph: {
    title: 'We+Make — Objects for Considered Living',
    description:
      'Sculptural decor shaped by digital craft and finished by hand.',
    images: [
      'https://we-make.vercel.app/products/we-make-material-edition/arcadia-tall-planter.png',
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'We+Make — Objects for Considered Living',
    description:
      'Sculptural decor shaped by digital craft and finished by hand.',
    images: [
      'https://we-make.vercel.app/products/we-make-material-edition/arcadia-tall-planter.png',
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${serif.variable}`}>{children}</body>
    </html>
  );
}
