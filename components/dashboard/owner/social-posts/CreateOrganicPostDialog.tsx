"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Loader2, PenLine, Sparkles } from "lucide-react";
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

export function CreateOrganicPostDialog({ open, businessSlug, onOpenChange, onCreated }: Props) {
  const [topic, setTopic] = useState("");
  const [category, setCategory] = useState<OrganicPostCategory>("SERVICE_SHOWCASE");
  const [creating, setCreating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Advanced options
  const [visualMood, setVisualMood] = useState("");
  const [visualFocus, setVisualFocus] = useState("");
  const [imageProfile, setImageProfile] = useState("");
  const [generateImageNow, setGenerateImageNow] = useState(false);
  const [ownerDirection, setOwnerDirection] = useState("");

  function resetForm() {
    setTopic("");
    setCategory("SERVICE_SHOWCASE");
    setShowAdvanced(false);
    setVisualMood("");
    setVisualFocus("");
    setImageProfile("");
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
      const result = await createOrganicSocialPostAction({
        businessSlug,
        topic: trimmed,
        category,
        visualMood: visualMood || undefined,
        visualFocus: visualFocus || undefined,
        imageProfile: imageProfile || undefined,
        generateImageNow,
        ownerDirection: ownerDirection.trim() || undefined,
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
              <div className="space-y-1.5">
                <Label htmlFor="visual-mood">Mood / vibe</Label>
                <Select value={visualMood} onValueChange={setVisualMood}>
                  <SelectTrigger id="visual-mood" className="w-full">
                    <SelectValue placeholder="AI decides (default)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">AI decides (default)</SelectItem>
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
                    <SelectValue placeholder="AI decides (default)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">AI decides (default)</SelectItem>
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
                    <SelectValue placeholder="Soft Editorial (default)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Soft Editorial (default)</SelectItem>
                    {SOCIAL_IMAGE_PROFILE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="owner-direction">Additional context (optional)</Label>
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
                  Describe the look or feel you want for both the caption and image.
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
