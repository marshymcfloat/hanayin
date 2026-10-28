export type OfferStatus = "Active" | "Upcoming" | "Ended";
export type OfferPostStatus = "Draft" | "Ready to publish" | "Published" | "Needs attention";

export type PreviewSaleEvent = {
  id: string;
  title: string;
  description: string;
  start: string;
  end: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  services: string[];
  packages: string[];
  slotLimit: number | null;
  bookings: number;
  terms: string;
  posts: { title: string; status: OfferPostStatus; channels: string[]; detail: string }[];
};

export const saleEventsReferenceDate = "2026-09-06T12:00:00+08:00";

export const previewSaleEvents: PreviewSaleEvent[] = [
  {
    id: "september-glow", title: "September Glow", description: "A fresh start for skin, with a little more room to unwind.",
    start: "2026-09-01T09:00:00+08:00", end: "2026-09-12T19:00:00+08:00", discountType: "percentage", discountValue: 15,
    services: ["Glass Skin Facial", "Brightening Facial"], packages: [], slotLimit: 24, bookings: 14,
    terms: "15% off the listed facial services during the offer period. Limited to 24 non-cancelled bookings.",
    posts: [{ title: "Your September skin reset", status: "Published", channels: ["Facebook", "Instagram"], detail: "Published Sep 1, 2026 at 9:00 AM" }],
  },
  {
    id: "weekday-hair", title: "Weekday Hair Refresh", description: "A polished finish, from a fresh cut to a color refresh.",
    start: "2026-09-03T09:00:00+08:00", end: "2026-09-10T19:00:00+08:00", discountType: "fixed", discountValue: 250,
    services: ["Cut & Style", "Blowout", "Root Color Refresh"], packages: [], slotLimit: null, bookings: 9,
    terms: "PHP 250 off eligible hair services during the offer period. No promotional booking cap; appointments remain subject to availability.", posts: [],
  },
  {
    id: "weekend-reset", title: "Weekend Reset", description: "The weekend essentials, brought together in one visit.",
    start: "2026-09-05T09:00:00+08:00", end: "2026-09-06T19:00:00+08:00", discountType: "percentage", discountValue: 10,
    services: [], packages: ["Weekend Ready", "Monthly Reset"], slotLimit: 12, bookings: 12,
    terms: "10% off the listed packages. All 12 promotional booking slots have been claimed.",
    posts: [{ title: "Make time for your weekend reset", status: "Needs attention", channels: ["Facebook", "Instagram"], detail: "Facebook published. Instagram delivery failed; review the channel before retrying." }],
  },
  {
    id: "payday-treat", title: "Payday Treat", description: "Make your next payday a moment for yourself.",
    start: "2026-09-14T09:00:00+08:00", end: "2026-09-16T19:00:00+08:00", discountType: "percentage", discountValue: 12,
    services: ["Glass Skin Facial", "Classic Manicure"], packages: ["Monthly Reset"], slotLimit: 20, bookings: 0,
    terms: "12% off the listed services and package from September 14 to 16. Limited to 20 non-cancelled bookings.",
    posts: [{ title: "A little payday self-care", status: "Draft", channels: ["Facebook", "Instagram"], detail: "Caption and creative are awaiting review." }],
  },
  {
    id: "bridal-beauty", title: "Bridal Beauty Days", description: "Thoughtful preparation for the moments that matter.",
    start: "2026-09-18T09:00:00+08:00", end: "2026-09-25T19:00:00+08:00", discountType: "fixed", discountValue: 500,
    services: ["Signature Balayage", "Keratin Smoothing", "Glass Skin Facial", "Brow Shape & Tint"], packages: ["Bridal Glow", "Quiet Luxury"], slotLimit: 16, bookings: 0,
    terms: "PHP 500 off eligible services and packages during the offer period. Limited to 16 non-cancelled bookings.",
    posts: [{ title: "Your bridal beauty appointments", status: "Ready to publish", channels: ["Facebook", "Instagram"], detail: "Content approved and ready for publishing." }],
  },
  {
    id: "august-skin", title: "August Skin Edit", description: "A considered collection of our most-loved facial treatments.",
    start: "2026-08-18T09:00:00+08:00", end: "2026-08-31T19:00:00+08:00", discountType: "percentage", discountValue: 15,
    services: ["Glass Skin Facial", "Brightening Facial"], packages: [], slotLimit: 30, bookings: 23,
    terms: "15% off eligible facial services. This offer ended on August 31, 2026.",
    posts: [{ title: "The August skin edit is here", status: "Published", channels: ["Facebook"], detail: "Published Aug 18, 2026 at 10:00 AM" }],
  },
];

export function getPreviewOfferStatus(offer: PreviewSaleEvent): OfferStatus {
  const reference = Date.parse(saleEventsReferenceDate);
  if (reference > Date.parse(offer.end)) return "Ended";
  if (reference < Date.parse(offer.start)) return "Upcoming";
  return "Active";
}

export const previewOfferSummary = {
  active: previewSaleEvents.filter((offer) => getPreviewOfferStatus(offer) === "Active").length,
  upcoming: previewSaleEvents.filter((offer) => getPreviewOfferStatus(offer) === "Upcoming").length,
  bookings: previewSaleEvents.reduce((total, offer) => total + offer.bookings, 0),
  attention: previewSaleEvents.flatMap((offer) => offer.posts).filter((post) => post.status === "Needs attention").length,
};

export const suggestedSaleEvent: PreviewSaleEvent = {
  id: "afternoon-refresh", title: "Afternoon Refresh", description: "An afternoon reset with our signature facial and finishing services.",
  start: "2026-09-08T14:00:00+08:00", end: "2026-09-08T17:00:00+08:00", discountType: "percentage", discountValue: 15,
  services: ["Glass Skin Facial", "Cut & Style"], packages: [], slotLimit: 8, bookings: 0,
  terms: "15% off the selected services on September 8, from 2:00 PM to 5:00 PM. Limited to 8 bookings.", posts: [],
};
