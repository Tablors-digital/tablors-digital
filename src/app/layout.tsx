import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://www.tablors.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Tablor's — Table Ordering System for Restaurants, Hotels & Hospitals",
    template: "%s | Tablor's",
  },
  description:
    "Tablor's is a smart table ordering system. Guests choose their items on a countertop device, and orders go straight to the kitchen.",
  applicationName: "Tablor's",
  keywords: [
    "table ordering system",
    "restaurant ordering device",
    "smart table ordering",
    "digital menu ordering",
    "hotel room service ordering",
    "hospital meal ordering system",
    "Tablor's",
  ],
  authors: [{ name: "Tablor's", url: siteUrl }],
  creator: "Tablor's",
  publisher: "Tablor's",
  openGraph: {
    siteName: "Tablor's",
    type: "website",
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tablor's — Table Ordering System for Restaurants, Hotels & Hospitals",
    description:
      "Guests choose their items on a countertop ordering device, and orders go straight to the kitchen.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}