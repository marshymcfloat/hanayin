"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, PenLine, Sparkles } from "lucide-react";
import { getSocialAiStatusAction } from "@/lib/server actions/social-ai-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createOrganicSocialPostAction } from "@/lib/server actions/social";
import { SOCIAL_IMAGE_PROFILE_OPTIONS } from "@/lib/services/social/image-profiles";
import type { OrganicPostCategory } from "@/lib/services/social/caption-generator";
import type { CaptionTone } from "@/lib/zod-schemas/growth";

// Same six options used on the campaign-side dialog. AUTO defers to the
// engine's default voice; the rest bias the LLM prompt toward a specific
// register so an ad-hoc post can sound exactly the way the owner wants.
const CAPTION_TONE_OPTIONS: Array<{
  value: CaptionTone;
  label: string;
  hint: string;
}> = [
  {
    value: "AUTO",
    label: "Recommended (auto)",
    hint: "Let the engine pick the voice based on the post type.",
  },
  {
    value: "FRIENDLY_TAGLISH",
    label: "Friendly Taglish",
    hint: "Warm, conversational, like texting a friend.",
  },
  {
    value: "PREMIUM_LUXURY",
    label: "Premium / luxury",
    hint: "Refined and editorial. Restraint over hype. No emoji.",
  },
  {
    value: "WITTY_PLAYFUL",
    label: "Witty / playful",
    hint: "Cheeky one-liners, observational humor.",
  },
  {
    value: "WARM_NURTURING",
    label: "Warm / nurturing",
    hint: "Gentle, no pressure — focus on care and rest.",
  },
  {
    value: "DIRECT_URGENT",
    label: "Direct / urgent",
    hint: "Confident, present-tense, every line moves toward action.",
  },
];

const CATEGORY_OPTIONS: { value: OrganicPostCategory; label: string; description: string }[] = [
  { value: "SERVICE_SHOWCASE", label: "Service Showcase", description: "Highlight a treatment or service" },
  { value: "BEHIND_THE_SCENES", label: "Behind the Scenes", description: "Show your team and process" },
  { value: "TIPS_EDUCATION", label: "Tips & Education", description: "Share beauty or wellness tips" },
  { value: "SEASONAL_GREETING", label: "Seasonal Greeting", description: "Holiday or seasonal content" },
  { value: "TEAM_SPOTLIGHT", label: "Team Spotlight", description: "Celebrate your team" },
  { value: "GENERAL", label: "General", description: "Keep your page active" },
];

const MOOD_OPTIONS = [
  { value: "warm and relaxing", label: "Warm & Relaxing" },
  { value: "clean and professional", label: "Clean & Professional" },
  { value: "playful and fun", label: "Playful & Fun" },
  { value: "elegant and premium", label: "Elegant & Premium" },
];

const VISUAL_FOCUS_OPTIONS = [
  { value: "client receiving treatment", label: "Client receiving treatment" },
  { value: "behind the scenes staff preparation", label: "Staff & behind the scenes" },
  { value: "genuine team portrait", label: "Team portrait" },
  { value: "beauty products and tools flat-lay", label: "Products & tools" },
  { value: "spa or salon ambiance and space", label: "Space & ambiance" },
];

type Props = {
  open: boolean;
  businessSlug: string;
  onOpenChange: (open: boolean) => void;
  onCreated: (postId: string) => void;
};

// Sentinel value used in place of an empty string for the "let AI decide"
// option in the Mood / Visual focus / Image style selects. Radix Select
// strictly disallows `value=""` because empty string is reserved for
// clearing the selection and showing the placeholder. We translate this
// back to `undefined` before calling the action so the existing server
// contract is unchanged.
const AI_DECIDES = "AUTO" as const;

export function CreateOrganicPostDialog({ open, businessSlug, onOpenChange, onCreated }: Props) {
  const [topic, setTopic] = useState("");
  const [category, setCategory] = useState<OrganicPostCategory>("SERVICE_SHOWCASE");
  const [creating, setCreating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Caption-side controls — surfaced at the top alongside post type, since
  // owners think about voice as first-class as topic.
  const [captionTone, setCaptionTone] = useState<CaptionTone>("AUTO");
  const [ownerCaptionDirection, setOwnerCaptionDirection] = useState("");

  // Advanced options — image-side controls remain tucked away. Each select
  // initializes to the AI_DECIDES sentinel so Radix has a non-empty value
  // for the placeholder row.
  const [visualMood, setVisualMood] = useState<string>(AI_DECIDES);
  const [visualFocus, setVisualFocus] = useState<string>(AI_DECIDES);
  const [imageProfile, setImageProfile] = useState<string>(AI_DECIDES);
  const [generateImageNow, setGenerateImageNow] = useState(false);
  const [ownerDirection, setOwnerDirection] = useState("");

  // H8: surface AI provider configuration to the owner. When Gemini is
  // unset, captions silently fall back to category rescue templates —
  // useful as a floor but the owner deserves to know the AI isn't
  // running.
  const [aiStatus, setAiStatus] = useState<{
    geminiConfigured: boolean;
    openaiImageConfigured: boolean;
  } | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void getSocialAiStatusAction().then((res) => {
      if (cancelled) return;
      if (res.success) setAiStatus(res.status);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  function resetForm() {
    setTopic("");
    setCategory("SERVICE_SHOWCASE");
    setShowAdvanced(false);
    setCaptionTone("AUTO");
    setOwnerCaptionDirection("");
    setVisualMood(AI_DECIDES);
    setVisualFocus(AI_DECIDES);
    setImageProfile(AI_DECIDES);
    setGenerateImageNow(false);
    setOwnerDirection("");
  }

  async function handleCreate() {
    const trimmed = topic.trim();
    if (!trimmed) {
      toast.error("Enter a topic for the post.");
      return;
    }

    setCreating(true);
    try {
      // Translate the AI_DECIDES sentinel back to undefined so the
      // server contract stays "absent = let AI decide". Empty strings
      // never cross the wire from this dialog.
      const optional = (v: string) =>
        v && v !== AI_DECIDES ? v : undefined;

      const result = await createOrganicSocialPostAction({
        businessSlug,
        topic: trimmed,
        category,
        visualMood: optional(visualMood),
        visualFocus: optional(visualFocus),
        imageProfile: optional(imageProfile),
        generateImageNow,
        ownerDirection: ownerDirection.trim() || undefined,
        captionTone,
        ownerCaptionDirection: ownerCaptionDirection.trim() || undefined,
      });

      if (!result.success) {
        toast.error(result.error ?? "Failed to create post.");
        return;
      }

      toast.success(
        generateImageNow
          ? "Post created with AI caption and image."
          : "Post created with AI caption.",
      );
      resetForm();
      onOpenChange(false);
      onCreated(result.data.postId);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!creating) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="h-4 w-4 text-primary" />
            Create Organic Post
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* H8: warn the owner when AI generation isn't configured.
              Without GEMINI_KEY the caption pipeline silently falls
              back to category rescue templates — fine as a floor but
              the owner should know the AI isn't running. */}
          {aiStatus && !aiStatus.geminiConfigured ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold">AI caption generation is not configured.</p>
                <p>
                  We&apos;ll use a category-aware fallback template — you can
                  still edit before publishing. Ask your admin to set
                  <code className="mx-1 rounded bg-amber-100 px-1 py-0.5 font-mono text-[11px]">GEMINI_KEY</code>
                  to enable smarter captions.
                </p>
              </div>
            </div>
          ) : null}
          {aiStatus &&
          aiStatus.geminiConfigured &&
          !aiStatus.openaiImageConfigured &&
          generateImageNow ? (
            <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold">Image generation will use Gemini.</p>
                <p>
                  OpenAI image generation isn&apos;t configured. Gemini will
                  produce the image instead.
                </p>
              </div>
            </div>
          ) : null}

          {/* Required fields */}
          <div className="space-y-1.5">
            <Label htmlFor="post-category">Post type</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as OrganicPostCategory)}>
              <SelectTrigger id="post-category" className="w-full">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="font-medium">{opt.label}</span>
                    <span className="ml-1.5 text-muted-foreground text-xs">— {opt.description}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="post-topic">Topic / title</Label>
            <Input
              id="post-topic"
              placeholder="e.g. Our signature facial, Meet our team, Summer self-care tips"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !creating && !showAdvanced) handleCreate(); }}
              disabled={creating}
              maxLength={120}
            />
          </div>

          {/* Caption voice — first-class control. Same options as the
              campaign dialog so owners build a consistent style across both
              ad-hoc and sale-driven posts. */}
          <div className="space-y-1.5">
            <Label htmlFor="caption-tone">Caption voice</Label>
            <Select
              value={captionTone}
              onValueChange={(value) => setCaptionTone(value as CaptionTone)}
            >
              <SelectTrigger id="caption-tone" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAPTION_TONE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex flex-col">
                      <span>{opt.label}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {opt.hint}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Advanced options toggle */}
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            <span>Tune further (optional)</span>
            {showAdvanced ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {showAdvanced && (
            <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
              {/* Caption-only direction. Distinct from "Additional context"
                  below (which goes to both caption AND image). Useful when
                  the owner wants to push a specific angle in the words
                  without changing the visual direction. */}
              <div className="space-y-1.5">
                <Label htmlFor="caption-direction">Caption direction</Label>
                <Textarea
                  id="caption-direction"
                  placeholder='e.g. "lean into team appreciation" or "mention the rainy weather"'
                  value={ownerCaptionDirection}
                  onChange={(e) => setOwnerCaptionDirection(e.target.value)}
                  disabled={creating}
                  maxLength={400}
                  rows={2}
                  className="resize-none text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Optional. Shapes only the caption — the image direction is below.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="visual-mood">Mood / vibe</Label>
                <Select value={visualMood} onValueChange={setVisualMood}>
                  <SelectTrigger id="visual-mood" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AI_DECIDES}>AI decides (default)</SelectItem>
                    {MOOD_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="visual-focus">Visual focus</Label>
                <Select value={visualFocus} onValueChange={setVisualFocus}>
                  <SelectTrigger id="visual-focus" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AI_DECIDES}>AI decides (default)</SelectItem>
                    {VISUAL_FOCUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="image-style">Image style</Label>
                <Select value={imageProfile} onValueChange={setImageProfile}>
                  <SelectTrigger id="image-style" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AI_DECIDES}>Soft Editorial (default)</SelectItem>
                    {SOCIAL_IMAGE_PROFILE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="owner-direction">Image direction</Label>
                <Textarea
                  id="owner-direction"
                  placeholder="e.g. autumn colors, woman in her 30s, natural setting, golden hour light"
                  value={ownerDirection}
                  onChange={(e) => setOwnerDirection(e.target.value)}
                  disabled={creating}
                  maxLength={200}
                  rows={2}
                  className="resize-none text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Optional. Shapes the image only — caption direction is at the top of this section.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Generate image now</p>
                  <p className="text-xs text-muted-foreground">Takes 15–30s extra. You can also generate after.</p>
                </div>
                <Switch
                  checked={generateImageNow}
                  onCheckedChange={setGenerateImageNow}
                  disabled={creating}
                />
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            AI will generate a Taglish caption based on your inputs. You can edit it after.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={creating || !topic.trim()}>
            {creating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {generateImageNow ? "Generating caption & image…" : "Generating caption…"}
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Create Post
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
