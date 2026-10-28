export type PreviewKpi = {
  id: "revenue" | "expenses" | "income" | "completion" | "average";
  label: string;
  value: number;
  format: "currency" | "percent";
  change: string;
};

export type PreviewFinancialPoint = {
  month: string;
  revenue: number;
  expenses: number;
  cashflow: number;
};

export type PreviewRankedItem = {
  name: string;
  detail: string;
  value: number;
  share: number;
};

export type PreviewBooking = {
  id: number;
  time: string;
  customer: string;
  service: string;
  staff: string;
  status: "Confirmed" | "In service" | "Pending";
  phone: string;
  duration: string;
  total: number;
  deposit: number;
};

export type PreviewStaff = {
  name: string;
  role: string;
  bookings: number;
  revenue: number;
  utilization: number;
};

export type PreviewQueueItem = {
  id: number;
  service: string;
  customer: string;
  time: string;
  price: number;
  status: "pending" | "in-progress";
};

export const previewFinancials: PreviewFinancialPoint[] = [
  { month: "Sep", revenue: 168400, expenses: 72400, cashflow: 96000 },
  { month: "Oct", revenue: 181900, expenses: 76600, cashflow: 105300 },
  { month: "Nov", revenue: 176200, expenses: 75100, cashflow: 101100 },
  { month: "Dec", revenue: 224800, expenses: 89300, cashflow: 135500 },
  { month: "Jan", revenue: 192600, expenses: 82100, cashflow: 110500 },
  { month: "Feb", revenue: 205300, expenses: 84700, cashflow: 120600 },
  { month: "Mar", revenue: 218900, expenses: 87400, cashflow: 131500 },
  { month: "Apr", revenue: 211700, expenses: 86100, cashflow: 125600 },
  { month: "May", revenue: 237400, expenses: 91800, cashflow: 145600 },
  { month: "Jun", revenue: 229800, expenses: 90200, cashflow: 139600 },
  { month: "Jul", revenue: 246900, expenses: 95400, cashflow: 151500 },
  { month: "Aug", revenue: 258600, expenses: 98100, cashflow: 160500 },
];

export const previewKpis: PreviewKpi[] = [
  { id: "revenue", label: "Monthly revenue", value: 258600, format: "currency", change: "+4.7% from July" },
  { id: "expenses", label: "Operating expenses", value: 98100, format: "currency", change: "37.9% of revenue" },
  { id: "income", label: "Net income", value: 160500, format: "currency", change: "+5.9% from July" },
  { id: "completion", label: "Booking completion", value: 94, format: "percent", change: "318 of 338 bookings" },
  { id: "average", label: "Average booking", value: 765, format: "currency", change: "+₱42 from July" },
];

export const previewExpenses: PreviewRankedItem[] = [
  { name: "Team payroll", detail: "Salaries and commissions", value: 52200, share: 53 },
  { name: "Products & supplies", detail: "Color, care, and consumables", value: 21600, share: 22 },
  { name: "Rent & utilities", detail: "Studio overhead", value: 15700, share: 16 },
  { name: "Marketing", detail: "Promotions and content", value: 8600, share: 9 },
];

export const previewServices: PreviewRankedItem[] = [
  { name: "Hair Color & Treatment", detail: "86 appointments", value: 89750, share: 35 },
  { name: "Signature Haircut", detail: "104 appointments", value: 62400, share: 24 },
  { name: "Nail Care Package", detail: "72 appointments", value: 43200, share: 17 },
];

export const previewCustomers: PreviewRankedItem[] = [
  { name: "Mikaela Santos", detail: "7 visits · avg ₱2,180", value: 15260, share: 100 },
  { name: "Patricia Lim", detail: "6 visits · avg ₱2,025", value: 12150, share: 80 },
  { name: "Angela Reyes", detail: "8 visits · avg ₱1,390", value: 11120, share: 73 },
];

export const previewBookings: PreviewBooking[] = [
  { id: 248, time: "10:30 AM", customer: "Bianca Cruz", service: "Hair Color & Treatment", staff: "Camille", status: "In service", phone: "0917 624 8103", duration: "2 hr 30 min", total: 2450, deposit: 700 },
  { id: 249, time: "11:15 AM", customer: "Nicole Garcia", service: "Signature Haircut", staff: "Jessa", status: "Confirmed", phone: "0928 315 7046", duration: "1 hr", total: 850, deposit: 250 },
  { id: 250, time: "1:00 PM", customer: "Trisha Mendoza", service: "Nail Care Package", staff: "Mae", status: "Confirmed", phone: "0916 842 5390", duration: "1 hr 30 min", total: 1200, deposit: 350 },
  { id: 251, time: "2:30 PM", customer: "Sophia Ramos", service: "Keratin Treatment", staff: "Camille", status: "Pending", phone: "0995 271 4682", duration: "3 hr", total: 3200, deposit: 900 },
];

export const previewStaff: PreviewStaff[] = [
  { name: "Camille Dela Cruz", role: "Senior stylist", bookings: 76, revenue: 68400, utilization: 91 },
  { name: "Jessa Villanueva", role: "Hair stylist", bookings: 69, revenue: 53750, utilization: 86 },
  { name: "Mae Fernandez", role: "Nail technician", bookings: 63, revenue: 42100, utilization: 82 },
];

export const previewQueue: PreviewQueueItem[] = [
  { id: 701, service: "BB Glow with Cheek Blush", customer: "Mae Dela Cruz", time: "1:00 PM", price: 2300, status: "pending" },
  { id: 702, service: "Volume Lash Set", customer: "Trisha Bautista", time: "4:00 PM", price: 1500, status: "pending" },
  { id: 703, service: "90-Minute Hot Stone Massage", customer: "Angelica Reyes", time: "11:00 AM", price: 999, status: "pending" },
  { id: 704, service: "Microneedling", customer: "Janelle Cruz", time: "2:00 PM", price: 3500, status: "pending" },
  { id: 705, service: "Lightning Facial", customer: "Camille Tan", time: "10:30 AM", price: 1200, status: "pending" },
  { id: 706, service: "Soft Gel Nail Extensions", customer: "Daniel Canoy", time: "10:00 AM", price: 699, status: "pending" },
  { id: 707, service: "Cat Eye Gel", customer: "Daniel Canoy", time: "10:00 AM", price: 1499, status: "pending" },
  { id: 708, service: "Manicure Gel", customer: "Amara Flores", time: "6:00 PM", price: 280, status: "pending" },
  { id: 709, service: "Signature Haircut", customer: "Nicole Garcia", time: "11:15 AM", price: 850, status: "in-progress" },
  { id: 710, service: "Hair Color & Treatment", customer: "Bianca Cruz", time: "10:30 AM", price: 2450, status: "in-progress" },
];

export const previewTotals = previewFinancials.reduce(
  (totals, point) => ({
    revenue: totals.revenue + point.revenue,
    expenses: totals.expenses + point.expenses,
    cashflow: totals.cashflow + point.cashflow,
  }),
  { revenue: 0, expenses: 0, cashflow: 0 },
);
