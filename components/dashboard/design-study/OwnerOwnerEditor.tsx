"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Root as ScrollAreaRoot, Viewport as ScrollAreaViewport } from "@radix-ui/react-scroll-area";
import { toast } from "sonner";
import { OwnerPermission } from "@/prisma/generated/prisma/enums";
import type { OwnerDirectoryChange, OwnerPreviewOwner } from "@/features/workforce/types/owner-preview-directory";
import { setPrimaryOwnerAction, updateOwnerPermissionsAction } from "@/features/workforce/actions/owners";
import { sanitizeOwnerPermissions } from "@/features/workforce/owner-permission-policy";
import { CatalogEditorFooter, CatalogEditorOverlay } from "@/components/dashboard/owner-preview/CatalogEditorOverlay";
import { ScrollBar } from "@/components/ui/scroll-area";
import { useOwnerPreviewRevoke } from "@/components/dashboard/owner-preview/OwnerPreviewQueryProvider";
import styles from "@/components/dashboard/design-study/owner-services.module.css";
import owners from "@/components/dashboard/design-study/owner-owners.module.css";
import { useTeamDraftGuard } from "@/components/dashboard/design-study/useTeamDraftGuard";

export type OwnerEditorMode = "permissions" | "specialties" | "primary";
export const ownerPermissionLabels: Record<OwnerPermission, string> = {
  BILLING_VIEW: "View billing", BILLING_MANAGE: "Manage billing", REPORTS_VIEW_FULL: "Full reports", REPORTS_VIEW_SALES_ONLY: "Sales reports",
  EMPLOYEES_MANAGE: "Manage employees", STAFF_MANAGE: "Manage staff", SETTINGS_MANAGE: "Business settings", CATALOG_MANAGE: "Manage catalog", PAYROLL_MANAGE: "Manage payroll",
  WORKFORCE_MANAGE: "Manage time and leave",
};
const titles = { permissions: "Edit permissions", specialties: "Edit specialties", primary: "Set primary owner" };

export function OwnerOwnerEditor({ owner, mode, canManage, currentOwnerId, categories, open, onOpenChange, onExited, onChanged, onSpecialties, fontClassName = "" }: {
  owner: OwnerPreviewOwner; mode: OwnerEditorMode; canManage: boolean; currentOwnerId: number; categories: string[]; open: boolean;
  onOpenChange: (open: boolean) => void; onExited: () => void; onChanged: (change: OwnerDirectoryChange) => void;
  onSpecialties: (owner: OwnerPreviewOwner, specialties: string[]) => Promise<{ success: boolean; error?: string }>;
  fontClassName?: string;
}) {
  const [permissions, setPermissions] = useState(owner.permissions);
  const [specialties, setSpecialties] = useState(owner.specialties);
  const [confirming, setConfirming] = useState(mode === "primary");
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const guard = useTeamDraftGuard(() => onOpenChange(false));
  const confirmButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!confirming || mode !== "permissions") return;
    const frame = requestAnimationFrame(() => confirmButton.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [confirming, mode]);
  const revoke = useOwnerPreviewRevoke();
  const options = [...new Set([...categories, ...owner.specialties])];
  const self = owner.id === currentOwnerId;
  const valid = permissions.length > 0 && (!owner.isPrimary || permissions.includes(OwnerPermission.SETTINGS_MANAGE));
  function togglePermission(permission: OwnerPermission) {
    setConfirming(false);
    setPermissions(current => {
      if (current.includes(permission)) return current.filter(value => value !== permission);
      const exclusive = permission === OwnerPermission.REPORTS_VIEW_FULL ? OwnerPermission.REPORTS_VIEW_SALES_ONLY : permission === OwnerPermission.REPORTS_VIEW_SALES_ONLY ? OwnerPermission.REPORTS_VIEW_FULL : null;
      return [...current.filter(value => value !== exclusive), permission];
    });
  }
  async function save() {
    if (lock.current || !canManage || (mode === "permissions" && !valid) || (mode === "primary" && !owner.permissions.includes(OwnerPermission.SETTINGS_MANAGE))) return;
    lock.current = true;
    setPending(true);
    try {
      const cleaned = sanitizeOwnerPermissions(permissions);
      const result = mode === "specialties" ? await onSpecialties(owner, specialties) : mode === "primary" ? await setPrimaryOwnerAction(owner.id) : await updateOwnerPermissionsAction(owner.id, cleaned);
      if (!result.success) {
        toast.error(result.error || "The change could not be saved. Please try again.");
        if (result.error === "Forbidden" || result.error === "Unauthorized") revoke();
        return;
      }
      if (mode === "primary") onChanged({ type: "primary", ownerId: owner.id });
      if (mode === "permissions") onChanged({ type: "permissions", ownerId: owner.id, permissions: cleaned });
      toast.success(mode === "primary" ? "Primary owner updated." : mode === "permissions" ? "Owner permissions updated." : "Owner specialties updated.");
      onOpenChange(false);
    } catch { toast.error("The change could not be confirmed. Refresh before trying again."); }
    finally { lock.current = false; setPending(false); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (mode === "specialties") void save();
    else setConfirming(true);
  }
  return <CatalogEditorOverlay open={open} onOpenChange={() => { if (!lock.current) guard.close(); }} onExited={onExited} title={titles[mode]} description={`${owner.name}${self ? " · Your account" : ""}`} restoreFocusKey={!canManage || (self && mode === "permissions" && !permissions.includes(OwnerPermission.SETTINGS_MANAGE)) ? "owner-directory" : `owner-${owner.id}`} initialFocus="panel" className={`${styles.editor} ${fontClassName}`}>
    {guard.confirmation}<form onSubmit={submit} onChangeCapture={guard.markChanged} style={guard.confirming ? { display: "none" } : undefined} className={owners.form} aria-busy={pending}>
      <ScrollAreaRoot type="scroll" scrollHideDelay={800} className={styles.editorScroll}><ScrollAreaViewport data-slot="scroll-area-viewport" tabIndex={0} aria-label="Owner settings" className="size-full"><div className={styles.editorFields}>
        {!canManage && <p role="alert" className={styles.notice}>Your owner-management access has changed. Close this sheet and refresh the directory.</p>}
        <fieldset className={owners.fields} disabled={pending || !canManage}>
          {mode === "permissions" && <><p className={owners.help}>Choose what this owner can access. At least one permission is required.{owner.isPrimary && " The primary owner must keep Business settings."}</p><div className={owners.choices}>{Object.values(OwnerPermission).map(permission => <label className={owners.choice} key={permission}><input type="checkbox" checked={permissions.includes(permission)} disabled={owner.isPrimary && permission === OwnerPermission.SETTINGS_MANAGE} onChange={() => togglePermission(permission)} />{ownerPermissionLabels[permission]}</label>)}</div>{!valid && <p role="alert" className={styles.notice}>Keep at least one permission and retain Business settings for the primary owner.</p>}</>}
          {mode === "specialties" && <><p className={owners.help}>An owner with no selected specialties can provide all service categories. Existing assignments are retained even if a category is no longer in the catalog.</p><div className={owners.choices}><label className={owners.choice}><input type="checkbox" checked={specialties.length === 0} onChange={() => setSpecialties([])} />All service categories</label>{options.map(category => <label className={owners.choice} key={category}><input type="checkbox" checked={specialties.includes(category)} onChange={() => setSpecialties(current => current.includes(category) ? current.filter(value => value !== category) : [...current, category])} />{category}</label>)}</div>{!options.length && <p className={owners.help}>No service categories are configured yet.</p>}</>}
          {mode === "primary" && <p className={owners.help}>This makes {owner.name} the primary owner of record and replaces the current primary owner. The new primary owner must have Business settings permission.</p>}
          {confirming && <div className={owners.confirm} role="group" aria-label="Confirm owner access change"><p>{mode === "primary" ? `Confirm ${owner.name} as primary owner?` : `Apply these permissions to ${owner.name}?`}</p>{mode === "permissions" && <p>{permissions.map(permission => ownerPermissionLabels[permission]).join(" · ")}</p>}{mode === "permissions" && self && !permissions.includes(OwnerPermission.SETTINGS_MANAGE) && <p>You are removing your own business-settings access. You will need another authorized owner to restore it.</p>}<div className={owners.confirmActions}><button ref={confirmButton} type="button" className={styles.primary} disabled={pending || !valid} onClick={() => { void save(); }}>{pending ? "Saving…" : "Confirm change"}</button>{mode === "permissions" && <button type="button" className={styles.secondary} onClick={() => setConfirming(false)}>Keep editing</button>}</div></div>}
        </fieldset>
      </div></ScrollAreaViewport><ScrollBar /></ScrollAreaRoot>
      <CatalogEditorFooter className={styles.editorFooter}><button type="button" className={styles.secondary} disabled={pending} onClick={guard.close}>Cancel</button>{mode !== "primary" && !confirming && <button type="submit" className={styles.primary} disabled={pending || !canManage || (mode === "permissions" && !valid)}>{pending ? "Saving…" : mode === "permissions" ? "Review changes" : "Save specialties"}</button>}</CatalogEditorFooter>
    </form>
  </CatalogEditorOverlay>;
}
