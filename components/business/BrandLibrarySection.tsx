"use client";

import * as React from "react";
import Image from "next/image";
import { Loader2, Plus, Trash2, ImageIcon, Sparkles, Building2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  deleteBrandAssetAction,
  uploadBrandAssetAction,
} from "@/lib/server actions/brand-assets";

type Asset = {
  id: string;
  kind: string;
  url: string;
  alt: string | null;
};

const PICKER_KINDS: {
  value: "LOGO" | "HERO" | "REFERENCE";
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "LOGO",
    label: "Logo",
    description: "Used as a watermark on social posts.",
    icon: <Building2 className="h-4 w-4" />,
  },
  {
    value: "HERO",
    label: "Hero photo",
    description: "Cover image on the public booking page.",
    icon: <ImageIcon className="h-4 w-4" />,
  },
  {
    value: "REFERENCE",
    label: "AI reference",
    description: "Style hints fed to social-post image generation.",
    icon: <Sparkles className="h-4 w-4" />,
  },
];

export function BrandLibrarySection({ assets }: { assets: Asset[] }) {
  const router = useRouter();
  const [uploading, setUploading] = React.useState<string | null>(null);
  const fileInputs = React.useRef<Record<string, HTMLInputElement | null>>({});

  const grouped = React.useMemo(() => {
    const map: Record<string, Asset[]> = {};
    for (const a of assets) {
      (map[a.kind] ??= []).push(a);
    }
    return map;
  }, [assets]);

  async function handleUpload(
    kind: "LOGO" | "HERO" | "REFERENCE",
    file: File,
  ) {
    setUploading(kind);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kind", kind);
      const result = await uploadBrandAssetAction(formData);
      if (result.success) {
        toast.success("Asset uploaded");
        router.refresh();
      } else {
        toast.error(result.error || "Upload failed");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  async function handleDelete(assetId: string) {
    const result = await deleteBrandAssetAction(assetId);
    if (result.success) {
      toast.success("Asset removed");
      router.refresh();
    } else {
      toast.error(result.error || "Delete failed");
    }
  }

  return (
    <div className="space-y-5">
      {PICKER_KINDS.map((kind) => {
        const items = grouped[kind.value] ?? [];
        return (
          <div key={kind.value} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
                  {kind.icon}
                </span>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-foreground">
                    {kind.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {kind.description}
                  </span>
                </div>
              </div>
              <input
                ref={(node) => {
                  fileInputs.current[kind.value] = node;
                }}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleUpload(kind.value, file);
                  // Reset so the same file can be reselected after delete.
                  event.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl cursor-pointer"
                disabled={uploading === kind.value}
                onClick={() => fileInputs.current[kind.value]?.click()}
              >
                {uploading === kind.value ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                )}
                Upload
              </Button>
            </div>

            {items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
                No {kind.label.toLowerCase()} uploaded yet.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {items.map((asset) => (
                  <div
                    key={asset.id}
                    className={cn(
                      "group relative aspect-square overflow-hidden rounded-xl border border-border bg-card",
                    )}
                  >
                    <Image
                      src={asset.url}
                      alt={asset.alt ?? `${kind.label} asset`}
                      fill
                      className="object-cover"
                      sizes="120px"
                      unoptimized
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(asset.id)}
                      className="absolute right-1.5 top-1.5 h-7 w-7 rounded-lg bg-card/85 text-muted-foreground hover:bg-rose-50 hover:text-rose-700 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all cursor-pointer"
                      aria-label="Remove asset"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
