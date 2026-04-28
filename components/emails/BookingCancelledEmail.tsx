import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

interface BookingCancelledEmailProps {
  customerName: string;
  businessName: string;
  reason?: string | null;
}

export const BookingCancelledEmail = ({
  customerName,
  businessName,
  reason,
}: BookingCancelledEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>Booking cancelled – {businessName}</Preview>
      <Body style={main}>
        <Container style={wrapper}>
          <div style={mainTable}>
            <Section style={header}>
              <Heading style={headerTitle}>{businessName}</Heading>
            </Section>

            <Section style={content}>
              <Text style={greeting}>
                Hello, <strong>{customerName}</strong>
              </Text>
              <Text style={textBody}>
                Your booking with <strong>{businessName}</strong> has been cancelled.
              </Text>

              {reason ? (
                <Section style={reasonBox}>
                  <Text style={reasonLabel}>CANCELLATION REASON</Text>
                  <Text style={reasonText}>{reason}</Text>
                </Section>
              ) : null}

              <Text style={textBody}>
                If you&apos;d like to rebook, please contact {businessName} directly.
                We hope to see you soon!
              </Text>
            </Section>

            <Section style={footer}>
              <Text style={footerText}>Need help? Contact {businessName} directly.</Text>
              <Text style={footerText}>
                &copy; {new Date().getFullYear()} {businessName} &middot; Powered by ServiceFlow
              </Text>
            </Section>
          </div>
        </Container>
      </Body>
    </Html>
  );
};

export default BookingCancelledEmail;

const main: React.CSSProperties = {
  margin: 0,
  padding: 0,
  backgroundColor: "#ffffff",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  WebkitFontSmoothing: "antialiased",
  color: "#1f2937",
};
const wrapper: React.CSSProperties = { width: "100%", paddingBottom: "60px" };
const mainTable: React.CSSProperties = {
  margin: "40px auto 0",
  maxWidth: "600px",
  backgroundColor: "#ffffff",
  borderRadius: "16px",
  overflow: "hidden",
  border: "1px solid #f3f4f6",
};
const header: React.CSSProperties = { backgroundColor: "#111827", padding: "40px 40px" };
const headerTitle: React.CSSProperties = {
  margin: 0,
  color: "#ffffff",
  fontSize: "26px",
  fontWeight: 800,
  letterSpacing: "-0.025em",
  textAlign: "center" as const,
};
const content: React.CSSProperties = { padding: "40px 40px" };
const greeting: React.CSSProperties = {
  fontSize: "20px",
  color: "#111827",
  marginBottom: "24px",
  fontWeight: 600,
};
const textBody: React.CSSProperties = { color: "#4b5563", fontSize: "16px", marginBottom: "24px" };
const reasonBox: React.CSSProperties = {
  backgroundColor: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: "12px",
  padding: "20px 24px",
  marginBottom: "24px",
};
const reasonLabel: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  textTransform: "uppercase" as const,
  letterSpacing: "1.5px",
  color: "#dc2626",
  marginBottom: "8px",
};
const reasonText: React.CSSProperties = { color: "#111827", fontSize: "15px", margin: 0 };
const footer: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  padding: "32px",
  textAlign: "center" as const,
  borderTop: "1px solid #e5e7eb",
};
const footerText: React.CSSProperties = { fontSize: "13px", color: "#9ca3af", margin: "8px 0" };
