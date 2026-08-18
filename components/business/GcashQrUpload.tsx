"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function GcashQrUpload({ defaultValue }: { defaultValue?: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(defaultValue ?? null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);

  useEffect(() => () => { if (localUrl) URL.revokeObjectURL(localUrl); }, [localUrl]);

  function chooseFile(file?: File) {
    if (localUrl) URL.revokeObjectURL(localUrl);
    if (!file) {
      setLocalUrl(null);
      setPreview(defaultValue ?? null);
      return;
    }
    const url = URL.createObjectURL(file);
    setLocalUrl(url);
    setPreview(url);
  }

  return (
    <div className="grid gap-4 sm:grid-cols-[180px_1fr] sm:items-center">
      <button type="button" onClick={() => inputRef.current?.click()} className="group relative grid aspect-square w-full max-w-[180px] place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-primary/20 bg-primary/[0.03] text-primary transition hover:border-primary/40 hover:bg-primary/[0.06]">
        {preview ? <Image src={preview} alt="GCash QR preview" fill unoptimized className="object-contain p-3" /> : <><ImagePlus className="size-7" /><span className="sr-only">Choose QR image</span></>}
      </button>
      <div className="space-y-3">
        <div className="flex items-start gap-2 text-sm text-muted-foreground"><ScanLine className="mt-0.5 size-4 shrink-0 text-primary" /><p>Upload a GCash screenshot or photo. On save, the system finds the QR code, crops surrounding content, adds a scan-safe white margin, and stores the normalized QR.</p></div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>{preview ? "Replace image" : "Upload image"}</Button>
          {localUrl ? <Button type="button" variant="ghost" onClick={() => { if (inputRef.current) inputRef.current.value = ""; chooseFile(); }}><X className="mr-1.5 size-4" />Undo selection</Button> : null}
        </div>
        <p className="text-xs text-muted-foreground">PNG, JPG, WebP, or HEIC · Maximum 8 MB · The QR must be fully visible.</p>
        <input ref={inputRef} className="sr-only" type="file" name="gcashQrImageFile" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" onChange={(event) => chooseFile(event.target.files?.[0])} />
        <input type="hidden" name="existingGcashQrImageUrl" value={defaultValue ?? ""} />
      </div>
    </div>
  );
}
