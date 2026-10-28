"use client";

import { useRef, useState } from "react";
import styles from "@/components/dashboard/design-study/owner-services.module.css";

/** Sensitive Team drafts remain in their open editor, never in persistent storage. */
export function useTeamDraftGuard(onClose: () => void) {
  const dirty = useRef(false);
  const [confirming, setConfirming] = useState(false);
  return {
    markChanged: () => { dirty.current = true; },
    close: () => { if (confirming) setConfirming(false); else if (dirty.current) setConfirming(true); else onClose(); },
    confirming,
    confirmation: confirming ? <section role="alert" className="flex flex-1 flex-col justify-center gap-5 p-6"><h3 className="text-xl font-semibold">Discard your changes?</h3><p>Your changes have not been saved.</p><div className="flex flex-wrap gap-3"><button autoFocus type="button" className={styles.primary} onClick={() => setConfirming(false)}>Keep editing</button><button type="button" className={styles.secondary} onClick={onClose}>Discard changes</button></div></section> : null,
  };
}
