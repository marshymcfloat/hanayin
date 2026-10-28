export type BookingNoteEntry = {
  id: string;
  body: string;
  visibility: "INTERNAL" | "CUSTOMER_VISIBLE";
  createdAt: string;
  createdBy: { id: string; name: string } | null;
};

export type BookingNotesResult =
  | { success: true; notes: BookingNoteEntry[] }
  | { success: false; error: string };
