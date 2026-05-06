import "./globals.css";
import { Toaster } from "sonner";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import TanstackProvider from "@/components/providers/TanstackProvider";
import SessionProvider from "@/components/providers/SessionProvider";
import { Analytics } from "@vercel/analytics/next";

// Geist (display + body) and Geist Mono — Vercel/shadcn's reference fonts.
// Both --font-display and --font-body bind to Geist for tight visual unity.
const geistSans = Geist({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const geistBody = Geist({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

// Playfair Display — editorial serif, used by customer-facing salon /
// boutique templates (BeautyFeel and similar). Available globally so
// any business-facing site can opt in via `font-[var(--font-serif)]`.
const playfairDisplay = Playfair_Display({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

import { constructMetadata } from "@/lib/metadata";

export const metadata = constructMetadata();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistBody.variable} ${geistMono.variable} ${playfairDisplay.variable} antialiased`}
      >
        <SessionProvider>
          <TanstackProvider>
            {children}
            <Toaster />
            <Analytics />
          </TanstackProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
