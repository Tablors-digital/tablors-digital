import type { Metadata } from "next";

import { Hero } from "@/components/marketing/hero";
import { ProductStory } from "@/components/marketing/product-story";
import { ConnectedSystem } from "@/components/marketing/connected-system";
import { OpenDevice } from "@/components/marketing/open-device";
import { Specifications } from "@/components/marketing/specifications";
import { Features } from "@/components/marketing/features";
import { BusinessTypes } from "@/components/marketing/business-types";
import { Pricing } from "@/components/marketing/pricing";
import { DemoSection } from "@/components/marketing/demo-section";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://www.tablors.com";

export const metadata: Metadata = {
  title: {
    absolute: "Table Ordering System for Restaurants, Hotels & Hospitals | Tablor's",
  },
  description:
    "A countertop ordering device for every table. Guests choose their items, and the order goes straight to the kitchen. Book a free demo.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Table Ordering System for Restaurants, Hotels & Hospitals | Tablor's",
    description:
      "A small ordering device on every table. Orders go straight to the kitchen, and you can see every table and bill in one place.",
    url: "/",
    siteName: "Tablor's",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Table Ordering System for Restaurants, Hotels & Hospitals | Tablor's",
    description:
      "A small ordering device on every table. Orders go straight to the kitchen, and you can see every table and bill in one place.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "Tablor's",
      url: siteUrl,
      email: "tablor.digital@gmail.com",
      telephone: "+91-8500075183",
      contactPoint: {
        "@type": "ContactPoint",
        telephone: "+91-8500075183",
        email: "tablor.digital@gmail.com",
        contactType: "sales",
        availableLanguage: ["English", "Hindi", "Telugu"],
      },
    },
    {
      "@type": "SoftwareApplication",
      name: "Tablor's Smart Table Ordering System",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web, Android, iOS",
      description:
        "Countertop table ordering device and kitchen management system for restaurants, hotels, cafes, and hospitals.",
      provider: {
        "@id": `${siteUrl}/#organization`,
      },
      offers: {
        "@type": "Offer",
        priceCurrency: "INR",
        availability: "https://schema.org/InStock",
      },
    },
  ],
};

export default function MarketingHome() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Hero />

      <BusinessTypes />

      <OpenDevice />

      <ProductStory />

      <ConnectedSystem />

      <Features />

      <Specifications />

      <Pricing />

      <DemoSection />
    </>
  );
}