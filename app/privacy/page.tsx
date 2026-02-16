import { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import LandingHeader from "@/components/landing/LandingHeader";
import LandingFooter from "@/components/landing/LandingFooter";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy | ServiceFlow",
  description:
    "Learn how ServiceFlow collects, uses, and protects your personal information.",
  alternates: {
    canonical: "/privacy",
  },
  openGraph: {
    title: "Privacy Policy | ServiceFlow",
    description:
      "Learn how ServiceFlow collects, uses, and protects your personal information.",
    url: "/privacy",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Privacy Policy | ServiceFlow",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Privacy Policy | ServiceFlow",
    description:
      "Learn how ServiceFlow collects, uses, and protects your personal information.",
    images: ["/og-image.png"],
  },
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-background font-sans flex flex-col">
      <LandingHeader />

      <div className="flex-1 relative pt-32 pb-20">
        {/* Background Gradients */}
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-size-[24px_24px]" />
        <div
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage: `radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.1) 0%, transparent 50%)`,
          }}
        />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <Badge
              variant="outline"
              className="rounded-full px-4 py-1.5 border-green-200 bg-green-50/50 text-green-700 gap-2 hover:bg-green-100 transition-colors cursor-default backdrop-blur-sm mx-auto mb-6"
            >
              <Sparkles className="size-3.5" />
              Legal
            </Badge>
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">
              Privacy Policy
            </h1>
            <p className="text-slate-500">Last updated: February 3, 2026</p>
          </div>

          <article className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 p-8 md:p-12 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
            <div className="prose prose-slate max-w-none prose-headings:font-semibold prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-4 prose-p:text-slate-600 prose-li:text-slate-600">
              <p>
                At ServiceFlow, we take your privacy seriously. This Privacy
                Policy explains how we collect, use, disclose, and safeguard
                your information when you use our booking management platform.
                Please read this policy carefully.
              </p>

              <h2>1. Information We Collect</h2>

              <h3 className="text-lg font-medium mt-6 mb-3">
                Personal Information
              </h3>
              <p>We may collect personal information that you provide to us:</p>
              <ul>
                <li>
                  <strong>Account Information:</strong> Name, email address,
                  phone number, password
                </li>
                <li>
                  <strong>Business Information:</strong> Business name, address,
                  contact details, service offerings
                </li>
                <li>
                  <strong>Payment Information:</strong> Billing address, payment
                  records, and manual payment references submitted during
                  onboarding and billing support
                </li>
                <li>
                  <strong>Referral Program Data:</strong> Referral codes,
                  referral lead details, and referral attribution status
                </li>
                <li>
                  <strong>Customer Data:</strong> Information about your
                  customers that you input into the system
                </li>
              </ul>

              <h3 className="text-lg font-medium mt-6 mb-3">
                Automatically Collected Information
              </h3>
              <p>
                When you access our Service, we automatically collect certain
                information:
              </p>
              <ul>
                <li>
                  <strong>Device Information:</strong> Browser type, operating
                  system, device identifiers
                </li>
                <li>
                  <strong>Usage Data:</strong> Pages visited, features used,
                  time spent on the platform
                </li>
                <li>
                  <strong>Log Data:</strong> IP address, access times, referring
                  URLs
                </li>
                <li>
                  <strong>Cookies:</strong> Session cookies, preference cookies,
                  analytics cookies
                </li>
              </ul>

              <h2>2. How We Use Your Information</h2>
              <p>We use the information we collect to:</p>
              <ul>
                <li>Provide, maintain, and improve our Service</li>
                <li>Process bookings and transactions</li>
                <li>Send booking confirmations and reminders</li>
                <li>
                  Administer onboarding applications, trial periods, billing
                  reminders, manual payment reconciliation, and referral rewards
                </li>
                <li>
                  Communicate with you about updates, support, and marketing
                </li>
                <li>Analyze usage patterns to enhance user experience</li>
                <li>Detect and prevent fraud or security threats</li>
                <li>Comply with legal obligations</li>
              </ul>

              <h2>3. Information Sharing and Disclosure</h2>
              <p>
                We may share your information in the following circumstances:
              </p>
              <ul>
                <li>
                  <strong>With Service Providers:</strong> Third-party vendors
                  who help us operate our platform (hosting, communication,
                  email services)
                </li>
                <li>
                  <strong>Business Transfers:</strong> In connection with a
                  merger, acquisition, or sale of assets
                </li>
                <li>
                  <strong>Legal Requirements:</strong> When required by law or
                  to protect our rights and safety
                </li>
                <li>
                  <strong>With Your Consent:</strong> When you explicitly agree
                  to share information
                </li>
              </ul>
              <p>
                We do not sell your personal information to third parties for
                marketing purposes.
              </p>

              <h2>4. Data Security</h2>
              <p>
                We implement appropriate technical and organizational measures
                to protect your information:
              </p>
              <ul>
                <li>Encryption of data in transit and at rest</li>
                <li>Secure authentication mechanisms</li>
                <li>Regular security assessments and updates</li>
                <li>Access controls and employee training</li>
                <li>Incident response procedures</li>
              </ul>
              <p>
                However, no method of transmission over the Internet is 100%
                secure. We cannot guarantee absolute security of your data.
              </p>

              <h2>5. Data Retention</h2>
              <p>
                We retain your information for as long as necessary to provide
                our Service and fulfill the purposes outlined in this policy.
                When you delete your account:
              </p>
              <ul>
                <li>
                  We will delete or anonymize your personal information within
                  30 days
                </li>
                <li>
                  Some information may be retained for legal or legitimate
                  business purposes
                </li>
                <li>Backup copies may persist for up to 90 days</li>
              </ul>

              <h2>6. Your Rights and Choices</h2>
              <p>Depending on your jurisdiction, you may have the right to:</p>
              <ul>
                <li>
                  <strong>Access:</strong> Request a copy of your personal
                  information
                </li>
                <li>
                  <strong>Correction:</strong> Update or correct inaccurate
                  information
                </li>
                <li>
                  <strong>Deletion:</strong> Request deletion of your personal
                  information
                </li>
                <li>
                  <strong>Portability:</strong> Receive your data in a
                  structured, machine-readable format
                </li>
                <li>
                  <strong>Opt-out:</strong> Unsubscribe from marketing
                  communications
                </li>
                <li>
                  <strong>Restriction:</strong> Limit how we process your data
                </li>
              </ul>
              <p>
                To exercise these rights, please contact us at{" "}
                <a
                  href="mailto:canoydaniel06@gmail.com"
                  className="text-green-600 hover:text-green-700"
                >
                  canoydaniel06@gmail.com
                </a>
                .
              </p>

              <h2>7. Cookies and Tracking Technologies</h2>
              <p>We use cookies and similar technologies to:</p>
              <ul>
                <li>Keep you logged in to your account</li>
                <li>Remember your preferences and settings</li>
                <li>Analyze how you use our Service</li>
                <li>Improve performance and user experience</li>
              </ul>
              <p>
                You can control cookies through your browser settings. Disabling
                certain cookies may affect the functionality of our Service.
              </p>

              <h2>8. Third-Party Services</h2>
              <p>Our Service may integrate with third-party services:</p>
              <ul>
                <li>
                  <strong>Billing Partners:</strong> Payment channels and
                  banking partners used for manual billing collection
                </li>
                <li>
                  <strong>Email Services:</strong> Resend for transactional
                  emails
                </li>
                <li>
                  <strong>Analytics:</strong> To understand usage patterns
                </li>
                <li>
                  <strong>Authentication:</strong> Google OAuth for sign-in
                </li>
              </ul>
              <p>
                These third parties have their own privacy policies governing
                their use of your information.
              </p>

              <h2>9. Children&apos;s Privacy</h2>
              <p>
                Our Service is not intended for individuals under the age of 18.
                We do not knowingly collect personal information from children.
                If we become aware that we have collected data from a child, we
                will take steps to delete it promptly.
              </p>

              <h2>10. International Data Transfers</h2>
              <p>
                Your information may be transferred to and processed in
                countries other than your own. We ensure appropriate safeguards
                are in place to protect your information in accordance with this
                Privacy Policy.
              </p>

              <h2>11. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. We will
                notify you of any material changes by:
              </p>
              <ul>
                <li>Posting the new policy on this page</li>
                <li>Sending an email notification</li>
                <li>Displaying a notice in our Service</li>
              </ul>
              <p>
                We encourage you to review this policy periodically for any
                updates.
              </p>

              <h2>12. Contact Us</h2>
              <p>
                If you have questions or concerns about this Privacy Policy or
                our data practices, please contact us:
              </p>
              <ul>
                <li>
                  Email:{" "}
                  <a
                    href="mailto:canoydaniel06@gmail.com"
                    className="text-green-600 hover:text-green-700"
                  >
                    canoydaniel06@gmail.com
                  </a>
                </li>
                <li>
                  Website:{" "}
                  <a
                    href="https://www.serviceflow.store"
                    className="text-green-600 hover:text-green-700"
                  >
                    www.serviceflow.store
                  </a>
                </li>
              </ul>
            </div>
          </article>

          <div className="mt-8 text-center text-sm text-slate-500">
            <p>
              See also:{" "}
              <Link
                href="/terms"
                className="text-green-600 hover:text-green-700 underline"
              >
                Terms of Service
              </Link>
            </p>
          </div>
        </div>
      </div>

      <Suspense fallback={null}>
        <LandingFooter />
      </Suspense>
    </main>
  );
}
