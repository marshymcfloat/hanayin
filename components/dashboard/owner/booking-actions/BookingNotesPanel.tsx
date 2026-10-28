"use client";

/**
 * BookingNotesPanel — inline section inside BookingDetailsDialog that
 * lists the booking's notes (newest first) and provides a form to add
 * a new one.
 *
 * Permissions:
 *   - Listing notes: any signed-in tenant user. Enforced server-side
 *     by listBookingNotesAction.
 *   - Adding INTERNAL: any signed-in tenant user.
 *   - Adding CUSTOMER_VISIBLE: requires BOOKING_MODIFY (surfaced via
 *     the canAddService viewer flag, which is what BOOKING_MODIFY
 *     powers in deriveBookingViewerContext).
 *
 * The panel intentionally remounts on every booking change via a
 * key prop in the parent so internal state is fresh per-booking.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquarePlus, ShieldCheck, Eye } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { showActionErrorToast } from "@/components/feedback/permission-toasts";
import { addBookingNoteAction } from "@/features/bookings/actions/booking-modify";
import {
  listBookingNotesAction,
  type BookingNoteEntry,
} from "@/features/bookings/actions/booking-notes-list";

const MAX_BODY_LENGTH = 2000;

export type BookingNotesPanelProps = {
  bookingId: number;
  /**
   * Whether the viewer can add CUSTOMER_VISIBLE notes (requires
   * BOOKING_MODIFY). When false the visibility toggle is hidden and
   * all notes default to INTERNAL.
   */
canAddCustomerVisible: boolean;
  onChanged?: () => void;
};

export function BookingNotesPanel({
  bookingId,
canAddCustomerVisible,
  onChanged,
}: BookingNotesPanelProps) {
  const router = useRouter();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; notes: BookingNoteEntry[] }
    | { kind: "error"; message: string }
  >({ kind: "loading" });
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<
    "INTERNAL" | "CUSTOMER_VISIBLE"
  >("INTERNAL");
  const [submitting, setSubmitting] = useState(false);

  // Fetch notes on mount and after each successful add.
  const refresh = async () => {
    setState({ kind: "loading" });
    try {
      const res = await listBookingNotesAction(bookingId);
      if (!res.success) {
        setState({ kind: "error", message: res.error });
        return;
      }
      setState({ kind: "ready", notes: res.notes });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setState({ kind: "error", message: msg });
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const trimmed = body.trim();
  const canSubmit =
    trimmed.length > 0 && trimmed.length <= MAX_BODY_LENGTH && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const result = await addBookingNoteAction({
        bookingId,
        body: trimmed,
        visibility,
      });
      if (!result.success) {
        showActionErrorToast(result.error, { action: "add this note" });
        return;
      }
      toast.success("Note added");
      setBody("");
      setVisibility("INTERNAL");
      await refresh();
      if (onChanged) onChanged();
      else router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      showActionErrorToast(msg, { action: "add this note" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Existing notes */}
      <div className="space-y-2">
        {state.kind === "loading" && (
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading notes…
          </p>
        )}
        {state.kind === "error" && (
          <p className="text-xs text-destructive">
            Couldn&apos;t load notes: {state.message}
          </p>
        )}
        {state.kind === "ready" && state.notes.length === 0 && (
          <p className="text-xs text-muted-foreground">No notes yet.</p>
        )}
        {state.kind === "ready" && state.notes.length > 0 && (
          <ol className="-mx-2 divide-y divide-border">
            {state.notes.map((note) => (
              <li key={note.id} className="px-2 py-3 text-sm space-y-1">
                <p className="text-foreground whitespace-pre-wrap">{note.body}</p>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    {note.visibility === "CUSTOMER_VISIBLE" ? (
                      <>
                        <Eye className="h-3 w-3" />
                        Customer-visible
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-3 w-3" />
                        Internal
                      </>
                    )}
                  </span>
                  <span>·</span>
                  <span>{note.createdBy?.name ?? "—"}</span>
                  <span>·</span>
                  <time dateTime={note.createdAt} title={note.createdAt}>
                    {formatRelative(note.createdAt)}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Add-note form */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <Label htmlFor="note-body" className="sr-only">
          Add a note
        </Label>
        <textarea
          id="note-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add an internal note about this booking…"
          maxLength={MAX_BODY_LENGTH}
          rows={2}
          disabled={submitting}
          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
        />
        <div className="flex items-center justify-between gap-2">
          {canAddCustomerVisible ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={visibility === "CUSTOMER_VISIBLE"}
                onChange={(e) =>
                  setVisibility(
                    e.target.checked ? "CUSTOMER_VISIBLE" : "INTERNAL",
                  )
                }
                disabled={submitting}
                className="h-3.5 w-3.5 rounded border-input accent-primary"
              />
              Visible to the customer
            </label>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Notes you add are visible only to your team.
            </p>
          )}
          <Button
            type="submit"
            size="sm"
            className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={!canSubmit}
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <MessageSquarePlus className="h-3.5 w-3.5 mr-2" />
                Add note
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "just now";
  if (diff < hour) {
    const m = Math.floor(diff / minute);
    return `${m} min${m === 1 ? "" : "s"} ago`;
  }
  if (diff < day) {
    const h = Math.floor(diff / hour);
    return `${h} hr${h === 1 ? "" : "s"} ago`;
  }
  if (diff < 30 * day) {
    const d = Math.floor(diff / day);
    return `${d} day${d === 1 ? "" : "s"} ago`;
  }
  return new Date(iso).toLocaleDateString();
}
