export type CustomerVisit = { id: number; date: string; service: string; staff: string; amount: number };
export type WorkspaceCustomer = { id: string; name: string; phone: string; email: string | null; joined: string; visits: CustomerVisit[] };

export const workspaceCustomers: WorkspaceCustomer[] = [
  { id: "bianca", name: "Bianca Cruz", phone: "0917 624 8103", email: "bianca.cruz@example.com", joined: "Jun 12, 2026", visits: [{ id: 1241, date: "Sep 2, 2026", service: "Hair Color & Treatment", staff: "Camille Dela Cruz", amount: 2450 }, { id: 1180, date: "Aug 6, 2026", service: "Signature Haircut", staff: "Jessa Villanueva", amount: 850 }, { id: 1103, date: "Jun 12, 2026", service: "Keratin Treatment", staff: "Camille Dela Cruz", amount: 3200 }] },
  { id: "nicole", name: "Nicole Garcia", phone: "0928 315 7046", email: "nicole.garcia@example.com", joined: "Jul 8, 2026", visits: [{ id: 1230, date: "Sep 8, 2026", service: "Signature Haircut", staff: "Jessa Villanueva", amount: 850 }, { id: 1145, date: "Jul 8, 2026", service: "Hair Color & Treatment", staff: "Camille Dela Cruz", amount: 2450 }] },
  { id: "trisha", name: "Trisha Mendoza", phone: "0916 842 5390", email: "trisha.mendoza@example.com", joined: "Aug 1, 2026", visits: [{ id: 1202, date: "Sep 1, 2026", service: "Nail Care Package", staff: "Mae Fernandez", amount: 1200 }, { id: 1152, date: "Aug 1, 2026", service: "Soft Gel Extensions", staff: "Mae Fernandez", amount: 950 }] },
  { id: "sophia", name: "Sophia Ramos", phone: "0995 271 4682", email: "sophia.ramos@example.com", joined: "Sep 10, 2026", visits: [] },
  { id: "amara", name: "Amara Flores", phone: "0918 230 6715", email: "amara.flores@example.com", joined: "May 24, 2026", visits: [{ id: 1252, date: "Sep 16, 2026", service: "Glass Skin Facial", staff: "Alyssa Tan", amount: 1800 }, { id: 1161, date: "Aug 12, 2026", service: "Lightning Facial", staff: "Alyssa Tan", amount: 1200 }] },
  { id: "janelle", name: "Janelle Cruz", phone: "0920 814 3992", email: null, joined: "Sep 14, 2026", visits: [] },
];

export type WorkspaceBooking = { id: number; customerId: string; date: string; time: string; duration: string; service: string; staff: string; status: "On hold" | "Accepted" | "Completed" | "Cancelled"; total: number; paid: number; method: string; note: string };
export const workspaceBookings: WorkspaceBooking[] = [
  { id: 1248, customerId: "bianca", date: "Sep 16, 2026", time: "10:30 AM", duration: "2 hr 30 min", service: "Hair Color & Treatment", staff: "Camille Dela Cruz", status: "Accepted", total: 2450, paid: 700, method: "GCash", note: "Customer requested a warm brunette finish." },
  { id: 1249, customerId: "nicole", date: "Sep 16, 2026", time: "11:15 AM", duration: "1 hr", service: "Signature Haircut", staff: "Jessa Villanueva", status: "Accepted", total: 850, paid: 250, method: "GCash", note: "Maintain length; trim and shape only." },
  { id: 1250, customerId: "trisha", date: "Sep 16, 2026", time: "1:00 PM", duration: "1 hr 30 min", service: "Nail Care Package", staff: "Mae Fernandez", status: "Accepted", total: 1200, paid: 350, method: "GCash", note: "Natural pink gel finish." },
  { id: 1251, customerId: "sophia", date: "Sep 16, 2026", time: "2:30 PM", duration: "3 hr", service: "Keratin Treatment", staff: "Camille Dela Cruz", status: "On hold", total: 3200, paid: 0, method: "GCash", note: "Slot reserved while payment is awaiting verification." },
  { id: 1252, customerId: "amara", date: "Sep 16, 2026", time: "9:00 AM", duration: "1 hr", service: "Glass Skin Facial", staff: "Alyssa Tan", status: "Completed", total: 1800, paid: 1800, method: "Cash", note: "Aftercare instructions provided at checkout." },
  { id: 1253, customerId: "janelle", date: "Sep 16, 2026", time: "4:00 PM", duration: "1 hr", service: "Microneedling", staff: "Alyssa Tan", status: "Cancelled", total: 3500, paid: 0, method: "Cash", note: "Customer cancelled before payment; no balance due." },
];

export type WorkspaceNotification = { id: string; type: "Booking confirmed" | "Booking cancelled" | "Payment receipt" | "Appointment reminder" | "Service follow-up" | "Payslip"; subject: string; recipient: string; time: string; sms: boolean | null; email: boolean | null; failure: string | null };
export const workspaceNotifications: WorkspaceNotification[] = [
  { id: "n1", type: "Booking confirmed", subject: "Your appointment is confirmed", recipient: "Bianca Cruz", time: "10:12 AM", sms: true, email: true, failure: null },
  { id: "n2", type: "Payment receipt", subject: "Payment received · Booking #1249", recipient: "Nicole Garcia", time: "10:04 AM", sms: true, email: true, failure: null },
  { id: "n3", type: "Appointment reminder", subject: "See you today at 1:00 PM", recipient: "Trisha Mendoza", time: "9:00 AM", sms: false, email: true, failure: "SMS could not be delivered. Email was delivered successfully." },
  { id: "n4", type: "Booking cancelled", subject: "Your appointment has been cancelled", recipient: "Janelle Cruz", time: "8:46 AM", sms: false, email: null, failure: "SMS delivery failed. No email address is available for this customer." },
  { id: "n5", type: "Service follow-up", subject: "Your hair care follow-up", recipient: "Bianca Cruz", time: "8:15 AM", sms: true, email: null, failure: null },
  { id: "n6", type: "Payslip", subject: "Your September payslip is ready", recipient: "Mika Santos", time: "8:00 AM", sms: null, email: true, failure: null },
];
