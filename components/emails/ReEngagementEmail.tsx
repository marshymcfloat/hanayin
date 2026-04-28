import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
  Row,
  Column,
} from "@react-email/components";
import * as React from "react";

interface ReEngagementEmailProps {
  customerName: string;
  businessName: string;
  bookingLink: string;
}

export const ReEngagementEmail = ({
  customerName,
  businessName,
  bookingLink,
}: ReEngagementEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>We Miss You at {businessName}!</Preview>
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
                This is a friendly reminder that we haven&apos;t seen you in a while.
                We are getting everything ready for your return!
              </Text>

              <Link href={bookingLink} style={{ textDecoration: "none", display: "block" }}>
                <Section style={highlightCard}>
                  <Text style={highlightLabel}>BOOKING STATUS</Text>
                  <Heading style={highlightMainText}>Time to Return?</Heading>
                  <Text style={highlightSubText}>Book your next appointment today</Text>
                </Section>
              </Link>

              <Section style={previousSection}>
                <Text style={sectionLabel}>RECOMMENDED</Text>
                <Row style={actionRow}>
                  <Column style={{ width: "20px", verticalAlign: "middle" }}>
                    <div style={dot} />
                  </Column>
                  <Column style={{ verticalAlign: "middle" }}>
                    <Link href={bookingLink} style={actionText}>Book Appointment</Link>
                  </Column>
                </Row>
              </Section>
            </Section>

            <Section style={footer}>
              <Text style={footerText}>Need to make changes? Contact {businessName} directly.</Text>
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

export default ReEngagementEmail;

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
const greeting: React.CSSProperties = { fontSize: "20px", color: "#111827", marginBottom: "24px", fontWeight: 600 };
const textBody: React.CSSProperties = { color: "#4b5563", fontSize: "15px", lineHeight: "1.6", marginBottom: "30px" };
const highlightCard: React.CSSProperties = {
  backgroundColor: "#ecfdf5",
  borderRadius: "12px",
  padding: "28px 20px",
  textAlign: "center" as const,
  marginBottom: "32px",
  border: "1px solid #d1fae5",
};
const highlightLabel: React.CSSProperties = {
  color: "#059669",
  fontSize: "11px",
  letterSpacing: "1.5px",
  fontWeight: 700,
  textTransform: "uppercase" as const,
  marginBottom: "10px",
};
const highlightMainText: React.CSSProperties = {
  color: "#111827",
  fontSize: "28px",
  fontWeight: 800,
  margin: 0,
  letterSpacing: "-0.5px",
  lineHeight: "1.2",
};
const highlightSubText: React.CSSProperties = { color: "#059669", fontSize: "14px", fontWeight: 600, marginTop: "5px" };
const previousSection: React.CSSProperties = { borderTop: "1px dashed #e5e7eb", paddingTop: "20px" };
const sectionLabel: React.CSSProperties = {
  color: "#6b7280",
  fontSize: "11px",
  letterSpacing: "1px",
  fontWeight: 700,
  textTransform: "uppercase" as const,
  marginBottom: "12px",
};
const actionRow: React.CSSProperties = { paddingBottom: "4px" };
const dot: React.CSSProperties = {
  display: "inline-block",
  width: "8px",
  height: "8px",
  backgroundColor: "#10b981",
  borderRadius: "50%",
};
const actionText: React.CSSProperties = {
  color: "#111827",
  fontSize: "14px",
  fontWeight: 600,
  textDecoration: "none",
};
const footer: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  padding: "32px",
  textAlign: "center" as const,
  borderTop: "1px solid #e5e7eb",
};
const footerText: React.CSSProperties = { fontSize: "13px", color: "#9ca3af", margin: "8px 0" };
