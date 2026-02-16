import { describe, expect, it } from "vitest";
import { render } from "@react-email/render";
import BookingConfirmationEmail from "./BookingConfirmationEmail";

const baseProps = {
  customerName: "Jane",
  businessName: "Glow Studio",
  serviceName: "Signature Facial",
  date: "February 15, 2026",
  time: "2:00 PM",
  amountPaid: "500.00",
  remainingBalance: "500.00",
  grandTotal: "1000.00",
  paymentStatusLabel: "Partially Paid",
  services: [{ name: "Signature Facial", price: 1000, quantity: 1 }],
};

describe("BookingConfirmationEmail", () => {
  it("renders amount paid and remaining balance for partial payments", async () => {
    const html = await render(BookingConfirmationEmail(baseProps));

    expect(html).toContain("Amount Paid");
    expect(html).toContain("Balance Due");
    expect(html).toContain("500.00");
    expect(html).toContain("Partially Paid");
  });

  it("hides balance row for fully paid bookings", async () => {
    const html = await render(
      BookingConfirmationEmail({
        ...baseProps,
        amountPaid: "1000.00",
        remainingBalance: "0.00",
        paymentStatusLabel: "Paid in Full",
      }),
    );

    expect(html).toContain("Amount Paid");
    expect(html).toContain("Paid in Full");
    expect(html).not.toContain("Balance Due");
  });
});
