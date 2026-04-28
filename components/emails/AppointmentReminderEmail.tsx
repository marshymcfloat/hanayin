import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Row,
  Column,
} from "@react-email/components";
import * as React from "react";

interface AppointmentReminderEmailProps {
  customerName: string;
  businessName: string;
  scheduledTime: string;
  scheduledDate: string;
  services: string[];
}

export const AppointmentReminderEmail = ({
  customerName,
  businessName,
  scheduledTime,
  scheduledDate,
  services,
}: AppointmentReminderEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>Reminder: Your appointment at {businessName} today at {scheduledTime}</Preview>
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
                This is a friendly reminder that your appointment is coming up soon.
                We&apos;re getting everything ready for you!
              </Text>

              <Section style={highlightCard}>
                <Text style={highlightLabel}>SCHEDULED TIME</Text>
                <Heading style={highlightTime}>{scheduledTime}</Heading>
                <Text style={highlightDate}>{scheduledDate}</Text>
              </Section>

              {services.length > 0 && (
                <Section style={servicesSection}>
                  <Text style={servicesHeader}>SERVICES BOOKED</Text>
                  {services.map((name, i) => (
                    <Row key={i} style={serviceRow}>
                      <Column style={{ width: "24px", verticalAlign: "middle" }}>
                        <div style={serviceIcon} />
                      </Column>
                      <Column style={{ verticalAlign: "middle" }}>
                        <Text style={serviceNameText}>{name}</Text>
                      </Column>
                    </Row>
                  ))}
                </Section>
              )}
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

export default AppointmentReminderEmail;

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
const textBody: React.CSSProperties = { color: "#4b5563", fontSize: "16px", marginBottom: "32px" };
const highlightCard: React.CSSProperties = {
  backgroundColor: "#ecfdf5",
  border: "1px solid #d1fae5",
  borderRadius: "16px",
  padding: "32px 24px",
  textAlign: "center" as const,
  marginBottom: "32px",
};
const highlightLabel: React.CSSProperties = {
  fontSize: "13px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.1em",
  color: "#059669",
  fontWeight: 700,
  marginBottom: "12px",
};
const highlightTime: React.CSSProperties = {
  fontSize: "42px",
  fontWeight: 800,
  color: "#111827",
  lineHeight: "1",
  letterSpacing: "-0.05em",
  margin: 0,
};
const highlightDate: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 600,
  color: "#059669",
  marginTop: "12px",
};
const servicesSection: React.CSSProperties = {
  borderTop: "1px dashed #e5e7eb",
  paddingTop: "24px",
};
const servicesHeader: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 700,
  color: "#374151",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  marginBottom: "16px",
};
const serviceRow: React.CSSProperties = { padding: "10px 0", borderBottom: "1px solid #f3f4f6" };
const serviceIcon: React.CSSProperties = {
  display: "inline-block",
  width: "8px",
  height: "8px",
  backgroundColor: "#10b981",
  borderRadius: "50%",
};
const serviceNameText: React.CSSProperties = { fontWeight: 600, color: "#111827", fontSize: "15px", margin: 0 };
const footer: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  padding: "32px",
  textAlign: "center" as const,
  borderTop: "1px solid #e5e7eb",
};
const footerText: React.CSSProperties = { fontSize: "13px", color: "#9ca3af", margin: "8px 0" };
