"use client";

import { type ComponentProps, useState } from "react";
import { CatalogEditorOverlay } from "@/components/dashboard/owner-preview/CatalogEditorOverlay";

export function CatalogDraftOverlay({ draftKey, onDiscard, children, onOpenChange, allowKeepDraft = true, busy = false, ...props }: ComponentProps<typeof CatalogEditorOverlay> & { draftKey: string; onDiscard: () => void; allowKeepDraft?: boolean; busy?: boolean }) {
  const [initial] = useState(draftKey);
  const [confirming, setConfirming] = useState(false);
  return <CatalogEditorOverlay {...props} onOpenChange={next => {
    if (busy) return;
    if (confirming) { setConfirming(false); return; }
    if (!next && draftKey !== initial) setConfirming(true);
    else { onDiscard(); onOpenChange(next); }
  }}>
    {confirming ? <div className="flex flex-1 flex-col justify-center gap-5 p-6 text-[#30213f]" role="alert">
      <h3 className="text-xl font-semibold">Keep your changes?</h3>
      <p className="text-sm text-[#756580]">{allowKeepDraft ? "Keep this draft on the page, continue editing, or discard it. Nothing has been saved yet." : "Continue editing or discard these unsaved changes."}</p>
      <div className="flex flex-wrap gap-3">
        <button autoFocus type="button" className="rounded-full bg-[#7042b9] px-5 py-3 text-white" onClick={() => setConfirming(false)}>Keep editing</button>
        {allowKeepDraft && <button type="button" className="rounded-full border px-5 py-3" onClick={() => { setConfirming(false); onOpenChange(false); }}>Keep draft</button>}
        <button type="button" className="rounded-full border px-5 py-3 text-[#a6313f]" onClick={() => { setConfirming(false); onDiscard(); onOpenChange(false); }}>Discard</button>
      </div>
    </div> : children}
  </CatalogEditorOverlay>;
}
