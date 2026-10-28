"use client";

/**
 * Staff-facing "Suggest a post" dialog. Submits a SocialPostRequest
 * via the new submitSocialPostRequestAction. Owners + reviewers see
 * the same dialog (it's symmetric), but in practice the UI surfaces it
 * to anyone with SOCIAL_POST_REQUEST_CREATE.
 *
 * On a successful submission the action returns an optional
 * duplicateWarning when a similar request already exists in the last
 * 14 days. We surface that as a non-blocking toast so the requester
 * can decide whether to open the existing one.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showActionErrorToast } from "@/components/feedback/permission-toasts";
import { submitSocialPostRequestAction } from "@/features/social/actions/social-post-requests";
import { useOptionalViewer } from "@/lib/auth/viewer-context";
import staffTheme from "@/components/dashboard/employee/StaffWorkspaceTheme.module.css";

const TOPIC_MAX = 140;
const BRIEF_MAX = 600;

const CATEGORY_OPTIONS = [
  {
    value: "SERVICE_SHOWCASE",
    label: "Service Showcase",
    description: "Highlight a treatment or service",
  },
  {
    value: "BEHIND_THE_SCENES",
    label: "Behind the Scenes",
    description: "Show the team and process",
  },
  {
    value: "TIPS_EDUCATION",
    label: "Tips & Education",
    description: "Share beauty or wellness tips",
  },
  {
    value: "SEASONAL_GREETING",
    label: "Seasonal Greeting",
    description: "Holiday or seasonal note",
  },
  {
    value: "TEAM_SPOTLIGHT",
    label: "Team Spotlight",
    description: "Celebrate a team member",
  },
  { value: "GENERAL", label: "General", description: "Keep the page active" },
] as const;

const TONE_OPTIONS = [
  { value: "AUTO", label: "Owner picks (recommended)" },
  { value: "FRIENDLY_TAGLISH", label: "Friendly Taglish" },
  { value: "PREMIUM_LUXURY", label: "Premium / luxury" },
  { value: "WITTY_PLAYFUL", label: "Witty / playful" },
  { value: "WARM_NURTURING", label: "Warm / nurturing" },
  { value: "DIRECT_URGENT", label: "Direct / urgent" },
] as const;

export type SuggestPostDialogProps = {
  businessSlug: string;
  trigger?: React.ReactNode;
  onSubmitted?: (requestId: string) => void;
};

export function SuggestPostDialog({
  businessSlug,
  trigger,
  onSubmitted,
}: SuggestPostDialogProps) {
  const router = useRouter();
  const staffDialogTheme = useOptionalViewer()?.actorType === "EMPLOYEE" ? staffTheme.workspace : "";
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [brief, setBrief] = useState("");
  const [category, setCategory] = useState<
    (typeof CATEGORY_OPTIONS)[number]["value"]
  >("GENERAL");
  const [desiredTone, setDesiredTone] = useState<string>("AUTO");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset form on open.
  useEffect(() => {
    if (!open) return;
    setTopic("");
    setBrief("");
    setCategory("GENERAL");
    setDesiredTone("AUTO");
    setAttachmentUrl("");
    setDueDate("");
  }, [open]);

  const trimmedTopic = topic.trim();
  const canSubmit = trimmedTopic.length > 0 && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const result = await submitSocialPostRequestAction({
        businessSlug,
        topic: trimmedTopic,
        brief: brief.trim() || undefined,
        category,
        desiredTone,
        attachmentUrl: attachmentUrl.trim() || undefined,
        dueDate: dueDate ? new Date(dueDate) : undefined,
      });

      if (!result.success) {
        showActionErrorToast(result.error, { action: "submit this request" });
        return;
      }

      if (result.duplicateWarning) {
        toast(
          `A similar request already exists ("${result.duplicateWarning.existingTopic}"). Yours has been queued anyway.`,
          { duration: 6000 },
        );
      } else {
        toast.success("Request submitted — your owner will review it shortly.");
      }
      setOpen(false);
      onSubmitted?.(result.requestId);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      showActionErrorToast(msg, { action: "submit this request" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" className="min-h-11 rounded-xl">
            <MessageSquarePlus className="h-4 w-4 mr-2" />
            Suggest a post
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className={`${staffDialogTheme} rounded-2xl max-w-lg max-h-[90vh] overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle>Suggest a post</DialogTitle>
          <DialogDescription>
            Describe what you&apos;d like to post. Your owner reviews each
            request, edits the AI draft if needed, and publishes it. You&apos;ll
            get a notification when it goes live.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="suggest-topic">Topic / title</Label>
            <Input
              id="suggest-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={`e.g. "Mother's Day greeting" or "Tip about skin tags"`}
              maxLength={TOPIC_MAX}
              required
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground">
              {trimmedTopic.length}/{TOPIC_MAX}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="suggest-category">Post type</Label>
            <Select
              value={category}
              onValueChange={(v) =>
                setCategory(v as (typeof CATEGORY_OPTIONS)[number]["value"])
              }
            >
              <SelectTrigger id="suggest-category" className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={`${staffDialogTheme} rounded-xl`}>
                {CATEGORY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="font-medium">{opt.label}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      — {opt.description}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="suggest-brief">Brief (optional)</Label>
            <textarea
              id="suggest-brief"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="What do you want it to say? Any angle or detail to highlight?"
              maxLength={BRIEF_MAX}
              rows={3}
              disabled={submitting}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 disabled:opacity-60"
            />
            <p className="text-xs text-muted-foreground">
              {brief.trim().length}/{BRIEF_MAX}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="suggest-tone">Desired tone (optional)</Label>
            <Select value={desiredTone} onValueChange={setDesiredTone}>
              <SelectTrigger id="suggest-tone" className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={`${staffDialogTheme} rounded-xl`}>
                {TONE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2 col-span-2 sm:col-span-1">
              <Label htmlFor="suggest-attachment">Attachment URL (optional)</Label>
              <Input
                id="suggest-attachment"
                type="url"
                value={attachmentUrl}
                onChange={(e) => setAttachmentUrl(e.target.value)}
                placeholder="https://..."
                disabled={submitting}
              />
            </div>
            <div className="space-y-2 col-span-2 sm:col-span-1">
              <Label htmlFor="suggest-due">Post by (optional)</Label>
              <Input
                id="suggest-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl" disabled={!canSubmit}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>Submit request</>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
