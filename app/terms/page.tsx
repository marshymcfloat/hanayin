import Link from "next/link";
import { Suspense } from "react";
import LandingHeader from "@/components/landing/LandingHeader";
import LandingFooter from "@/components/landing/LandingFooter";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { constructMetadata } from "@/lib/metadata";

export const metadata = constructMetadata({
  title: "Terms of Service",
  description:
    "Read the terms and conditions for using ServiceFlow booking management platform.",
  canonical: "/terms",
  keywords: [
    "serviceflow terms of service",
    "booking platform terms and conditions",
    "salon software legal terms",
  ],
});

export default function TermsOfServicePage() {
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
              Terms of Service
            </h1>
            <p className="text-slate-500">Last updated: February 3, 2026</p>
          </div>

          <article className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 p-8 md:p-12 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
            <div className="prose prose-slate max-w-none prose-headings:font-semibold prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-4 prose-p:text-slate-600 prose-li:text-slate-600">
              <p>
                Welcome to ServiceFlow. These Terms of Service
                (&quot;Terms&quot;) govern your access to and use of our booking
                management platform, including our website, applications, and
                services (collectively, the &quot;Service&quot;). By accessing
                or using ServiceFlow, you agree to be bound by these Terms.
              </p>

              <h2>1. Acceptance of Terms</h2>
              <p>
                By creating an account or using our Service, you acknowledge
                that you have read, understood, and agree to be bound by these
                Terms and our Privacy Policy. If you do not agree to these
                Terms, you may not use the Service.
              </p>

              <h2>2. Description of Service</h2>
              <p>
                ServiceFlow is a cloud-based booking and service management
                platform that allows businesses to:
              </p>
              <ul>
                <li>Manage service offerings and pricing</li>
                <li>Accept and manage customer bookings</li>
                <li>Track employee schedules and attendance</li>
                <li>Process payments and generate reports</li>
                <li>Communicate with customers via automated notifications</li>
              </ul>

              <h2>3. User Accounts</h2>
              <p>
                To use ServiceFlow, you must create an account. You are
                responsible for:
              </p>
              <ul>
                <li>
                  Providing accurate and complete information during
                  registration
                </li>
                <li>Maintaining the security of your account credentials</li>
                <li>All activities that occur under your account</li>
                <li>
                  Notifying us immediately of any unauthorized use of your
                  account
                </li>
              </ul>
              <p>
                You must be at least 18 years old to create an account and use
                our Service.
              </p>

              <h2>4. Business Owner Responsibilities</h2>
              <p>As a business owner using ServiceFlow, you agree to:</p>
              <ul>
                <li>
                  Provide accurate information about your business and services
                </li>
                <li>Honor bookings made through the platform</li>
                <li>
                  Maintain appropriate licenses and permits for your business
                </li>
                <li>
                  Comply with all applicable laws and regulations in your
                  jurisdiction
                </li>
                <li>
                  Handle customer data in accordance with applicable privacy
                  laws
                </li>
                <li>Respond to customer inquiries in a timely manner</li>
              </ul>

              <h2>5. Customer Booking Terms</h2>
              <p>When making a booking through ServiceFlow:</p>
              <ul>
                <li>You agree to provide accurate contact information</li>
                <li>
                  You understand that bookings are subject to the
                  business&apos;s cancellation policy
                </li>
                <li>
                  You acknowledge that service prices and availability may
                  change
                </li>
                <li>You agree to arrive on time for scheduled appointments</li>
              </ul>

              <h2>6. Payment Terms</h2>
              <p>
                ServiceFlow currently uses an admin-reviewed onboarding and
                manual billing process. By using our service, you agree to:
              </p>
              <ul>
                <li>Pay all fees associated with your approved plan</li>
                <li>
                  Understand that free demo months, credits, and referral
                  rewards are promotional and may have qualification conditions
                </li>
                <li>
                  Provide accurate billing details and settle invoices through
                  the payment channels coordinated by our team
                </li>
                <li>
                  Accept that self-serve online checkout may be unavailable
                  during manual billing rollout
                </li>
                <li>
                  Accept that unpaid accounts may enter grace period and then
                  read-only suspension until payment is confirmed
                </li>
                <li>
                  Understand that refunds are subject to our refund policy
                </li>
              </ul>

              <h2>7. Prohibited Uses</h2>
              <p>You agree not to use the Service to:</p>
              <ul>
                <li>Violate any applicable laws or regulations</li>
                <li>Infringe on the intellectual property rights of others</li>
                <li>Transmit harmful code, viruses, or malicious software</li>
                <li>
                  Attempt to gain unauthorized access to our systems or networks
                </li>
                <li>
                  Engage in fraudulent activities or misrepresent your identity
                </li>
                <li>Harass, abuse, or harm other users or businesses</li>
                <li>Use the Service for any illegal or unauthorized purpose</li>
              </ul>

              <h2>8. Intellectual Property</h2>
              <p>
                ServiceFlow and its original content, features, and
                functionality are owned by ServiceFlow and are protected by
                international copyright, trademark, and other intellectual
                property laws. You may not reproduce, distribute, modify, or
                create derivative works without our express written consent.
              </p>

              <h2>9. Data and Privacy</h2>
              <p>
                Your use of the Service is also governed by our Privacy Policy.
                You acknowledge that:
              </p>
              <ul>
                <li>
                  We collect and process data as described in our Privacy Policy
                </li>
                <li>
                  You are responsible for obtaining necessary consents from your
                  customers
                </li>
                <li>
                  We implement reasonable security measures to protect your data
                </li>
              </ul>

              <h2>10. Service Availability</h2>
              <p>
                We strive to maintain high availability of our Service, but we
                do not guarantee uninterrupted access. We may:
              </p>
              <ul>
                <li>Perform scheduled maintenance with reasonable notice</li>
                <li>Experience occasional downtime due to technical issues</li>
                <li>Modify or discontinue features with appropriate notice</li>
              </ul>

              <h2>11. Limitation of Liability</h2>
              <p>
                To the maximum extent permitted by law, ServiceFlow shall not be
                liable for any indirect, incidental, special, consequential, or
                punitive damages, including but not limited to loss of profits,
                data, or business opportunities, arising from your use of the
                Service.
              </p>

              <h2>12. Disclaimer of Warranties</h2>
              <p>
                The Service is provided &quot;as is&quot; and &quot;as
                available&quot; without any warranties of any kind, either
                express or implied, including but not limited to implied
                warranties of merchantability, fitness for a particular purpose,
                or non-infringement.
              </p>

              <h2>13. Indemnification</h2>
              <p>
                You agree to indemnify and hold harmless ServiceFlow, its
                affiliates, officers, directors, employees, and agents from any
                claims, damages, losses, or expenses arising from your use of
                the Service or violation of these Terms.
              </p>

              <h2>14. Termination</h2>
              <p>
                We may terminate or suspend your account at any time for
                violations of these Terms. You may cancel your account at any
                time through your account settings. Upon termination:
              </p>
              <ul>
                <li>Your access to the Service will be revoked</li>
                <li>
                  We may retain certain data as required by law or for
                  legitimate business purposes
                </li>
                <li>You remain responsible for any outstanding fees</li>
              </ul>

              <h2>15. Changes to Terms</h2>
              <p>
                We reserve the right to modify these Terms at any time. We will
                notify you of material changes via email or through the Service.
                Your continued use of the Service after such modifications
                constitutes acceptance of the updated Terms.
              </p>

              <h2>16. Governing Law</h2>
              <p>
                These Terms shall be governed by and construed in accordance
                with the laws of the Philippines, without regard to its conflict
                of law provisions.
              </p>

              <h2>17. Contact Information</h2>
              <p>
                If you have any questions about these Terms, please contact us
                at:
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
                href="/privacy"
                className="text-green-600 hover:text-green-700 underline"
              >
                Privacy Policy
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
