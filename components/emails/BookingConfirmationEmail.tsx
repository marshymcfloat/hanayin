import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Link,
  Row,
  Column,
} from "@react-email/components";
import * as React from "react";

interface BookingConfirmationEmailProps {
  customerName: string;
  businessName: string;
  serviceName: string;
  date: string;
  time: string;
  location?: string;
  grandTotal?: string;
  amountPaid: string;
  remainingBalance: string;
  paymentStatusLabel?: string;
  manageUrl?: string;
  services: { name: string; price: number; quantity: number }[];
}

export const BookingConfirmationEmail = ({
  customerName,
  businessName,
  serviceName,
  date,
  time,
  location,
  grandTotal,
  amountPaid,
  remainingBalance,
  paymentStatusLabel,
  manageUrl,
  services,
}: BookingConfirmationEmailProps) => {
  const remainingBalanceValue = Number(remainingBalance);

  return (
    <Html>
      <Head />
      <Preview>{paymentStatusLabel || "Booking Confirmed"} at {businessName}</Preview>
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
                Your booking has been successfully confirmed. We&apos;re looking
                forward to seeing you!
              </Text>
              {paymentStatusLabel ? (
                <Text style={metaText}>Payment Status: <strong>{paymentStatusLabel}</strong></Text>
              ) : null}
              <Text style={metaText}>
                Primary service: <strong>{serviceName}</strong>
                {location ? (
                  <>
                    {" "}
                    &middot; Location: <strong>{location}</strong>
                  </>
                ) : null}
              </Text>

              <Section style={highlightCard}>
                <Text style={highlightLabel}>SCHEDULED TIME</Text>
                <Heading style={highlightTime}>{time}</Heading>
                <Text style={highlightDate}>{date}</Text>
              </Section>

              <Section style={servicesSection}>
                <Text style={servicesHeader}>SERVICES BOOKED</Text>
                {services.map((service, index) => (
                  <Row key={index} style={serviceRow}>
                    <Column style={{ width: "24px", verticalAlign: "middle" }}>
                      <div style={serviceIcon} />
                    </Column>
                    <Column style={{ verticalAlign: "middle" }}>
                      <Text style={serviceNameText}>
                        {service.quantity > 1 ? `${service.quantity}x ` : ""}
                        {service.name}
                      </Text>
                    </Column>
                    <Column align="right" style={{ verticalAlign: "middle" }}>
                      <Text style={servicePrice}>PHP {service.price.toFixed(2)}</Text>
                    </Column>
                  </Row>
                ))}

                <Row
                  style={{
                    ...serviceRow,
                    borderBottom: "none",
                    marginTop: "12px",
                    borderTop: "1px dashed #e5e7eb",
                  }}
                >
                  <Column colSpan={2}>
                    <Text style={{ ...serviceNameText, fontSize: "16px" }}>
                      Amount Paid
                    </Text>
                  </Column>
                  <Column align="right">
                    <Text
                      style={{
                        ...servicePrice,
                        fontSize: "18px",
                        color: "#10b981",
                        fontWeight: "700",
                      }}
                    >
                      PHP {amountPaid}
                    </Text>
                  </Column>
                </Row>

                {grandTotal ? (
                  <Row style={{ ...serviceRow, borderBottom: "none" }}>
                    <Column colSpan={2}>
                      <Text style={serviceNameText}>Grand Total</Text>
                    </Column>
                    <Column align="right">
                      <Text style={servicePrice}>PHP {grandTotal}</Text>
                    </Column>
                  </Row>
                ) : null}

                {remainingBalanceValue > 0 ? (
                  <Row style={{ ...serviceRow, borderBottom: "none" }}>
                    <Column colSpan={2}>
                      <Text style={{ ...serviceNameText, color: "#92400e" }}>
                        Balance Due
                      </Text>
                    </Column>
                    <Column align="right">
                      <Text style={{ ...servicePrice, color: "#92400e", fontWeight: "700" }}>
                        PHP {remainingBalance}
                      </Text>
                    </Column>
                  </Row>
                ) : null}
              </Section>

              {manageUrl && (
                <Section style={{ textAlign: "center", marginTop: "32px" }}>
                  <Link href={manageUrl} style={button}>
                    Manage Your Booking
                  </Link>
                  <Text style={{ ...metaText, marginTop: "12px", marginBottom: "0" }}>
                    Cancel or reschedule up to 6 hours before your appointment.
                  </Text>
                </Section>
              )}
            </Section>

            <Section style={footer}>
              <Text style={footerText}>
                Need to make changes? Contact {businessName} directly.
              </Text>
              <Text style={footerText}>
                &copy; {new Date().getFullYear()} {businessName} &middot;
                Powered by{" "}
                <Link
                  href="https://serviceflow.store"
                  target="_blank"
                  style={brandLink}
                >
                  ServiceFlow
                </Link>
              </Text>
            </Section>
          </div>
        </Container>
      </Body>
    </Html>
  );
};

export default BookingConfirmationEmail;

const main = {
  backgroundColor: "#ffffff",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
  padding: "0",
  margin: "0",
};

const wrapper = {
  width: "100%",
  maxWidth: "600px",
  margin: "0 auto",
  paddingBottom: "40px",
};

const mainTable = {
  backgroundColor: "#ffffff",
  borderRadius: "16px",
  overflow: "hidden",
  boxShadow:
    "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
  border: "1px solid #f3f4f6",
  marginTop: "40px",
};

const header = {
  backgroundColor: "#111827",
  padding: "40px 40px",
  textAlign: "center" as const,
};

const headerTitle = {
  margin: "0",
  color: "#ffffff",
  fontSize: "26px",
  fontWeight: "800",
  letterSpacing: "-0.025em",
};

const content = {
  padding: "40px",
};

const greeting = {
  fontSize: "20px",
  color: "#111827",
  marginBottom: "24px",
  fontWeight: "600",
  lineHeight: "1.4",
};

const textBody = {
  color: "#4b5563",
  fontSize: "16px",
  marginBottom: "12px",
  lineHeight: "1.6",
};

const metaText = {
  color: "#6b7280",
  fontSize: "13px",
  marginBottom: "24px",
  marginTop: "0",
};

const highlightCard = {
  backgroundColor: "#ecfdf5",
  border: "1px solid #d1fae5",
  borderRadius: "16px",
  padding: "32px 24px",
  textAlign: "center" as const,
  marginBottom: "32px",
};

const highlightLabel = {
  fontSize: "13px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.1em",
  color: "#059669",
  fontWeight: "700",
  marginBottom: "12px",
  marginTop: "0",
};

const highlightTime = {
  fontSize: "42px",
  fontWeight: "800",
  color: "#111827",
  lineHeight: "1",
  letterSpacing: "-0.05em",
  margin: "0",
};

const highlightDate = {
  fontSize: "18px",
  fontWeight: "600",
  color: "#059669",
  marginTop: "12px",
  marginBottom: "0",
};

const servicesSection = {
  marginTop: "0",
  borderTop: "1px dashed #e5e7eb",
  paddingTop: "24px",
};

const servicesHeader = {
  fontSize: "14px",
  fontWeight: "700",
  color: "#374151",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  marginBottom: "16px",
};

const serviceRow = {
  padding: "8px 0",
  borderBottom: "1px solid #f3f4f6",
};

const serviceIcon = {
  width: "8px",
  height: "8px",
  backgroundColor: "#10b981",
  borderRadius: "50%",
  boxShadow: "0 0 0 2px #d1fae5",
};

const serviceNameText = {
  fontWeight: "600",
  color: "#111827",
  fontSize: "16px",
  margin: "0",
  paddingLeft: "12px",
};

const servicePrice = {
  color: "#374151",
  fontSize: "15px",
  fontWeight: "500",
  margin: "0",
};

const footer = {
  backgroundColor: "#f9fafb",
  padding: "32px",
  textAlign: "center" as const,
  borderTop: "1px solid #e5e7eb",
};

const footerText = {
  fontSize: "13px",
  color: "#9ca3af",
  margin: "8px 0",
  lineHeight: "1.5",
};

const brandLink = {
  color: "#10b981",
  textDecoration: "none",
  fontWeight: "700",
};

const button = {
  backgroundColor: "#10b981",
  borderRadius: "8px",
  color: "#fff",
  fontSize: "16px",
  fontWeight: "600",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "14px 32px",
  boxShadow:
    "0 4px 6px -1px rgba(16, 185, 129, 0.4), 0 2px 4px -1px rgba(16, 185, 129, 0.2)",
};
