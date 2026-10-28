"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Crown, MoreHorizontal, Search, ShieldCheck, Sparkles, Users } from "lucide-react";
import type { OwnerDirectoryChange, OwnerPreviewOwner, OwnerPreviewOwnersData } from "@/features/workforce/types/owner-preview-directory";
import { updateOwnerSpecialties } from "@/features/dashboard/actions/queries";
import { useOptimisticCatalog } from "@/components/dashboard/owner-preview/useOptimisticCatalog";
import { useSelectionMotion } from "@/components/bookings/design-study/SelectionMotion";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { OwnerOwnerEditor, ownerPermissionLabels, type OwnerEditorMode } from "@/components/dashboard/design-study/OwnerOwnerEditor";
import styles from "@/components/dashboard/design-study/owner-services.module.css";
import owners from "@/components/dashboard/design-study/owner-owners.module.css";
import { useTeamAvailabilitySessions } from "@/components/dashboard/design-study/useTeamAvailabilitySessions";
import { useCatalogListState, useCatalogScroll } from "@/components/dashboard/owner-preview/useCatalogListState";
import { useOwnerPreviewContext } from "@/components/dashboard/owner-preview/OwnerPreviewQueryProvider";
import { OwnerAvailabilityEditor } from "@/components/dashboard/design-study/OwnerAvailabilityEditor";

export function OwnerOwnersStudy({ data, refreshControl, fontClassName = "", onChanged }: {
  data: OwnerPreviewOwnersData; refreshControl: ReactNode; fontClassName?: string; onChanged: (change: OwnerDirectoryChange) => void;
}) {
  const identity = useOwnerPreviewContext();
  const scope = `${identity.userId}:${identity.businessId}:Owners`;
  const [search, setSearch] = useCatalogListState(scope, "search", "");
  const [limit, setLimit] = useCatalogListState(scope, "limit", 12);
  const [editor, setEditor] = useState<{ owner: OwnerPreviewOwner; mode: OwnerEditorMode } | null>(null);
  const [open, setOpen] = useState(false);
  const drafts = useTeamAvailabilitySessions<OwnerPreviewOwner>(open);
  const list = useRef<HTMLDivElement>(null);
  useCatalogScroll(scope, list);
  const directory = useOptimisticCatalog(data.owners, change => {
    if (change.type === "upsert") onChanged({ type: "specialties", ownerId: change.item.id, specialties: change.item.specialties });
  });
  const visible = useMemo(() => directory.items.filter(owner => `${owner.name} ${owner.contactNumber} ${owner.specialties.join(" ")} ${owner.permissions.map(permission => ownerPermissionLabels[permission]).join(" ")}`.toLowerCase().includes(search.trim().toLowerCase())), [directory.items, search]);
  const shown = visible.slice(0, limit);
  const capture = useSelectionMotion(list, shown.map(owner => owner.id).join(","), "owner");
  const administration = data.administration;
  const canManage = administration?.canManage === true;
  function edit(owner: OwnerPreviewOwner, mode: OwnerEditorMode) {
    if (mode === "specialties") { drafts.open(owner); return; }
    setEditor({ owner, mode }); setOpen(true);
  }
  async function saveSpecialties(owner: OwnerPreviewOwner, specialties: string[]) {
    capture();
    return directory.update({ ...owner, specialties }, async () => {
      const result = await updateOwnerSpecialties(owner.id, specialties);
      return result.success ? { success: true as const, data: { ...owner, specialties } } : { success: false as const, error: result.error || "Specialties could not be saved." };
    });
  }
  const metrics = [
    { label: "Owners", value: data.owners.length, detail: "Current owner accounts", icon: Users },
    { label: "Primary owners", value: data.owners.filter(owner => owner.isPrimary).length, detail: "Owners of record", icon: Crown },
    { label: "Service specialties", value: new Set(data.owners.flatMap(owner => owner.specialties)).size, detail: "Assigned categories", icon: Sparkles },
    { label: "Capabilities", value: new Set(data.owners.flatMap(owner => owner.permissions)).size, detail: "Distinct permissions", icon: ShieldCheck },
  ];
  return <div className={`${styles.page} ${fontClassName}`}><div className={styles.content}>
    <Link className={styles.back} href="/redesign/owner-dashboard"><ArrowLeft size={14} aria-hidden="true" />Dashboard</Link>
    <header className={styles.header}><div><p className={styles.eyebrow}>Your people</p><h1>Owners<span className={styles.titleDetail}> & access</span></h1><p className={styles.description}>The people responsible for your business, their access, and service specialties.</p></div><div className={styles.refresh}>{refreshControl}</div></header>
    <section className={styles.summary} aria-label="Owner overview">{metrics.map(({ label, value, detail, icon: Icon }) => <div className={styles.metric} key={label}><span className={styles.metricLabel}><Icon size={14} aria-hidden="true" />{label}</span><strong>{value}</strong><small>{detail}</small></div>)}</section>
    {!canManage && <p className={styles.notice}>You can view this directory. Business-settings permission is required to change owner access or specialties.</p>}
    <section className={styles.catalog} aria-labelledby="owner-directory-heading"><div className={styles.toolbar}><div><h2 id="owner-directory-heading" tabIndex={-1} data-catalog-focus="owner-directory">Owner directory</h2><p>{visible.length} of {data.owners.length} owners</p></div><label className={styles.search}><Search size={16} aria-hidden="true" /><span className="sr-only">Search owners</span><input value={search} onChange={event => { capture(); setSearch(event.target.value); setLimit(12); }} placeholder="Search owners or permissions" /></label></div>
      <div ref={list}><ul className={styles.list}>{shown.map(owner => <li key={owner.id} data-owner-row={owner.id} className={styles.row} aria-busy={directory.pendingIds.has(owner.id)}><div className={owners.row}>
        <div className={styles.serviceIdentity}><span className={styles.serviceIcon}><Crown size={19} aria-hidden="true" /></span><div className={styles.serviceCopy}><h3>{owner.name}</h3><div className={styles.metadata}><span>{owner.contactNumber}</span>{owner.isPrimary && <span className={styles.category}>Primary owner</span>}{owner.id === data.administration?.currentOwnerId && <span className={styles.category}>You</span>}</div>{directory.pendingIds.has(owner.id) && <p className={styles.saving}>Saving…</p>}</div></div>
        <div className={owners.detail}><small>Permissions</small><p>{owner.permissions.length ? owner.permissions.map(permission => ownerPermissionLabels[permission]).join(" · ") : "No permissions assigned"}</p></div>
        <div className={owners.detail}><small>Specialties</small><p>{owner.specialties.length ? owner.specialties.join(" · ") : "All service categories"}</p></div>
        {canManage && <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className={styles.rowActions} aria-label={`Manage ${owner.name}`} data-catalog-focus={`owner-${owner.id}`} disabled={directory.pendingIds.has(owner.id)}><MoreHorizontal size={19} aria-hidden="true" /></button></DropdownMenuTrigger><DropdownMenuContent align="end" className={`${styles.menu} ${owners.menu} ${fontClassName}`}><DropdownMenuItem onSelect={() => edit(owner, "permissions")}>Edit permissions</DropdownMenuItem><DropdownMenuItem onSelect={() => edit(owner, "specialties")}>Edit specialties</DropdownMenuItem>{!owner.isPrimary && <DropdownMenuItem disabled={!owner.permissions.includes("SETTINGS_MANAGE")} onSelect={() => edit(owner, "primary")}>Set primary owner</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu>}
      </div></li>)}</ul></div>
      {!visible.length && <div className={styles.empty}><div><span className={styles.emptyIcon}><Crown aria-hidden="true" /></span><h3>{data.owners.length ? "No matching owners" : "No owners found"}</h3><p>{data.owners.length ? "Try a name, permission, or service category." : "Owner accounts will appear here when available."}</p>{data.owners.length > 0 && <button type="button" className={styles.secondary} onClick={() => setSearch("")}>Clear search</button>}</div></div>}
      {visible.length > limit && <div className={styles.loadMore}><span>Showing {shown.length} of {visible.length}</span><button type="button" className={styles.secondary} onClick={() => { capture(); setLimit(value => value + 12); }}>Show more owners</button></div>}
    </section>
    {editor && administration && <OwnerOwnerEditor key={`${editor.owner.id}:${editor.mode}`} {...editor} canManage={canManage} currentOwnerId={administration.currentOwnerId} categories={administration.categories} open={open} onOpenChange={setOpen} onExited={() => setEditor(null)} onChanged={onChanged} onSpecialties={saveSpecialties} fontClassName={fontClassName} />}
    {drafts.sessions.filter(session => session.item && (session.state === "failed" || session.state === "draft") && session.id !== drafts.activeId).map(session => <button key={session.id} type="button" className={styles.secondary} disabled={!canManage || open || drafts.activeId !== null} onClick={() => drafts.resume(session.id)}>Resume {session.item!.name} draft</button>)}
    {drafts.sessions.map(session => session.item && <OwnerAvailabilityEditor key={session.id} person={session.item} kind="owner" categories={administration?.categories} disabled={!canManage} open={drafts.activeId === session.id} fontClassName={fontClassName} onDismiss={() => drafts.dismiss(session.id)} onDiscard={() => drafts.status(session.id, "saved")} onPending={() => drafts.status(session.id, "pending")} onSaved={() => drafts.status(session.id, "saved")} onFailed={error => drafts.failed(session.id, error)} onSubmit={specialties => saveSpecialties(session.item!, specialties)} />)}
  </div></div>;
}
