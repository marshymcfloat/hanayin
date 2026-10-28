import type { Metadata } from "next";
import { redesignBodyFont } from "@/components/landing/hanaylo/fonts";
import MobiloLanding from "@/components/landing/hanaylo/MobiloLanding";

const description =
  "Bookings, staff, and commissions. In order. HANAYIN connects the day's service work with the people doing it and the pay they earn.";

export const metadata: Metadata = {
  title: { absolute: "HANAYIN — Your business, in order" },
  description,
  applicationName: "HANAYIN",
  authors: [{ name: "HANAYIN" }],
  creator: "HANAYIN",
  publisher: "HANAYIN",
  keywords: ["service team management", "staff commissions", "appointment management"],
  robots: { index: false, follow: false },
  alternates: { canonical: "/redesign" },
  icons: { icon: "/hanaylo/mark.svg", apple: "/hanaylo/mark.svg" },
  openGraph: {
    title: "HANAYIN — Your business, in order",
    description,
    siteName: "HANAYIN",
    url: "/redesign",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "HANAYIN — Your business, in order",
    description,
  },
};

export default function RedesignPage() {
  return <MobiloLanding fontClassName={redesignBodyFont.variable} />;
}
