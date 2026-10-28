"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, CalendarDays, Check, ChevronUp, Clock3, Flower2,
  Layers3, Minus, Plus, Search, UserRound, X,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import styles from "@/components/bookings/design-study/booking-design-experiment.module.css";
import HairDryerIcon from "@/components/bookings/design-study/HairDryerIcon";
import { AnimatedValue, useSelectionMotion } from "@/components/bookings/design-study/SelectionMotion";
import AnimatedFilterGroup from "@/components/bookings/design-study/AnimatedFilterGroup";

export type BookingDesignTreatment = {
  disabled?: boolean;
  availabilityLabel?: string;
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  minutes: number;
  kind: "service" | "package";
};

export function BookingProgress({ activeStep = 0 }: { activeStep?: number }) {
  return <ol className={styles.steps} aria-label="Booking progress">
    {["Services", "Schedule", "Customer", "Review"].map((label, index) => (
      <li key={label} aria-current={index === activeStep ? "step" : undefined}>
        <span>{String(index + 1).padStart(2, "0")}</span>{label}
      </li>
    ))}
  </ol>;
}

export function BookingDesignForm({ fontClassName = "", presentation = "page", onOpenSheet, treatments, categories, live }: {
  treatments: readonly BookingDesignTreatment[];
  categories: readonly string[];
  live?: { quantities: Record<string, number>; total: number; disabled?: boolean; onToggle: (id: string) => void; onQuantity: (id: string, delta: number) => void; onContinue: () => void; canContinue: boolean };
  fontClassName?: string;
  presentation?: "page" | "sheet";
  onOpenSheet?: () => void;
}) {
  const id = useId();
  const formRef = useRef<HTMLDivElement>(null);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [kind, setKind] = useState<"service" | "package">("service");
  const [category, setCategory] = useState("All services");
  const [search, setSearch] = useState("");
  const [sampleQuantities, setQuantities] = useState<Record<string, number>>({});
  const quantities = live?.quantities ?? sampleQuantities;
  const captureSelection = useSelectionMotion(formRef, JSON.stringify(quantities));
  const captureCatalog = useSelectionMotion(formRef, JSON.stringify([kind, category, search, treatments.map(item => item.id)]), "catalog");
  const selected = treatments.filter((item) => quantities[item.id] > 0);
  const units = selected.reduce((sum, item) => sum + quantities[item.id], 0);
  const total = live?.total ?? selected.reduce((sum, item) => sum + item.price * quantities[item.id], 0);
  const visible = treatments.filter((item) => item.kind === kind
    && (category === "All services" || item.category === category)
    && `${item.name} ${item.category} ${item.description}`.toLowerCase().includes(search.trim().toLowerCase()));

  useEffect(() => {
    if (presentation !== "sheet") return;
    const viewport = window.visualViewport;
    const panel = formRef.current?.closest<HTMLElement>('[role="dialog"]');
    if (!viewport || !panel) return;
    const updateViewport = () => {
      if (viewport.scale !== 1) return;
      panel.style.setProperty("--booking-visible-height", `${viewport.height}px`);
      panel.style.setProperty("--booking-keyboard-inset", `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`);
    };
    updateViewport();
    viewport.addEventListener("resize", updateViewport);
    viewport.addEventListener("scroll", updateViewport);
    return () => {
      viewport.removeEventListener("resize", updateViewport);
      viewport.removeEventListener("scroll", updateViewport);
      panel.style.removeProperty("--booking-visible-height");
      panel.style.removeProperty("--booking-keyboard-inset");
    };
  }, [presentation]);

  function toggle(id: string) {
    captureSelection();
    if (live) { live.onToggle(id); return; }
    setQuantities((current) => ({ ...current, [id]: current[id] ? 0 : 1 }));
  }

  function changeQuantity(id: string, delta: number) {
    captureSelection();
    if (live) { live.onQuantity(id, delta); return; }
    setQuantities((current) => ({ ...current, [id]: Math.min(99, Math.max(1, current[id] + delta)) }));
  }

  function collapseSelection() {
    setSelectionOpen(false);
    formRef.current?.querySelector<HTMLButtonElement>(`[aria-controls="${id}-selection-summary"]`)?.focus();
  }

  return (
    <div ref={formRef} className={`${styles.page} ${fontClassName} ${presentation === "sheet" ? styles.embedded : ""}`}>
      {presentation === "page" && <div className={styles.studyBar}>
        <Link href="/redesign"><ArrowLeft size={15} aria-hidden="true" /> Back to HANAYIN</Link>
        <div className={styles.studyActions}><span>Design preview · Sample catalog</span><button type="button" className={styles.sheetLaunch} data-catalog-focus="booking-design-sheet" onClick={onOpenSheet}>Open as sheet <ArrowRight size={16} aria-hidden="true" /></button></div>
      </div>}

      {presentation === "page" && <div className={styles.mobileNotice}>
        <span className={styles.eyebrow}>HANAYIN / BOOKINGS</span>
        <h1>A little time for you.</h1>
        <p>Explore the new booking drawer. Choose treatments, then review your selection.</p>
        <button type="button" className={styles.mobileLaunch} data-catalog-focus="booking-design-sheet" onClick={onOpenSheet}>Open mobile preview <ArrowRight size={18} aria-hidden="true" /></button>
        <small>Sample catalog · No booking is created</small>
      </div>}

      <div className={styles.workspace}>
        <header className={styles.header} role={presentation === "sheet" ? "presentation" : undefined}>
          <div className={styles.headingLockup}>
            <span className={styles.brandTile} aria-hidden="true"><i /><i /><i /></span>
            <div><span className={styles.eyebrow}>HANAYIN / BOOKINGS</span><p>New booking</p></div>
          </div>
          {presentation === "page" && <BookingProgress />}
          <p className={styles.mobileProgress}>Services <span>Step 1 of 4</span></p>
        </header>

        <div className={styles.body}>
          <section className={styles.selection} aria-labelledby={`${id}-services-heading`}>
            <div className={styles.intro}>
              <h1 id={`${id}-services-heading`}>Choose services</h1>
              <p>Select treatments for this appointment.</p>
            </div>

            <div className={styles.catalog}>
              <div className={styles.catalogToolbar}>
                <AnimatedFilterGroup className={styles.switcher} label="Catalog type">
                  <button type="button" aria-pressed={kind === "service"} onClick={() => { captureCatalog(); setKind("service"); setCategory("All services"); }}>
                    <HairDryerIcon /> Services <span>{treatments.filter(item => item.kind === "service").length}</span>
                  </button>
                  <button type="button" aria-pressed={kind === "package"} onClick={() => { captureCatalog(); setKind("package"); setCategory("All services"); }}>
                    <Layers3 size={15} aria-hidden="true" /> Packages <span>{treatments.filter(item => item.kind === "package").length}</span>
                  </button>
                </AnimatedFilterGroup>
                <label className={styles.search}>
                  <Search size={17} aria-hidden="true" />
                  <input aria-label="Search treatments" placeholder="Search services" value={search} onChange={(event) => { captureCatalog(); setSearch(event.target.value); }} />
                </label>
              </div>

              <AnimatedFilterGroup className={styles.categories} label="Treatment category">
                {categories.map((name) => <button type="button" key={name} aria-pressed={category === name} onClick={() => { captureCatalog(); setCategory(name); }}>{name === "All services" && kind === "package" ? "All packages" : name}</button>)}
              </AnimatedFilterGroup>
              <div className={styles.listCaption}><span>{visible.length} {kind === "service" ? "services" : "packages"} to explore</span><span>Select to add <Plus size={12} aria-hidden="true" /></span></div>

              <div className={styles.results} tabIndex={0} aria-label="Available treatments" data-catalog-area>
                {visible.length === 0 ? <div className={styles.noResults}>
                  <Search size={24} aria-hidden="true" /><h2>No treatments found</h2><p>Try another name or category.</p>
                  <button type="button" onClick={() => { captureCatalog(); setSearch(""); setCategory("All services"); }}>Clear filters</button>
                </div> : <ul className={styles.serviceList} aria-label="Available treatments">
                  {visible.map((item) => {
                    const isSelected = Boolean(quantities[item.id]);
                    return <li key={item.id} data-catalog-row={item.id}>
                      <button type="button" className={styles.service} aria-pressed={isSelected} disabled={live?.disabled || (item.disabled && !isSelected)} aria-label={`${isSelected ? "Remove" : "Add"} ${item.name}`} onClick={() => toggle(item.id)}>
                        <span className={styles.serviceCopy}><strong>{item.name}</strong><span>{item.description}{item.disabled && item.availabilityLabel ? ` · ${item.availabilityLabel}` : ""}</span><small><Clock3 size={11} aria-hidden="true" /> {item.minutes} min <i aria-hidden="true" /> {item.category}</small></span>
                        <span className={styles.servicePrice}>{formatCurrency(item.price)}</span>
                        <span className={styles.addIcon}>{isSelected ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}</span>
                      </button>
                    </li>;
                  })}
                </ul>}
              </div>
              <div className={styles.catalogNote}><Clock3 size={13} aria-hidden="true" /> Times are estimates. Availability is checked when scheduling.</div>
            </div>
          </section>

          <aside id={`${id}-selection-summary`} className={styles.summary} data-expanded={selectionOpen} aria-labelledby={`${id}-summary-heading`}>
            <div className={styles.summaryTop}>
              <div><h2 id={`${id}-summary-heading`}>Your selection</h2><p>Everything for this visit.</p></div>
              <Image src="/hanaylo/hero-nail-polish-v1.png" width={1254} height={1254} sizes="110px" loading="eager" alt="" aria-hidden="true" className={styles.polish} />
              <button type="button" className={styles.collapseSelection} aria-label="Collapse selection" onClick={collapseSelection}><X size={18} aria-hidden="true" /></button>
            </div>
            <div className={styles.summaryInner}>
              <div className={styles.summaryLabel}><span>Treatments</span><span>{units} {units === 1 ? "item" : "items"}</span></div>
              <div className={styles.selectedArea} tabIndex={0} aria-label="Selected treatments" data-selection-area>
                {selected.length === 0 ? <div className={styles.empty}>
                  <span><Flower2 size={28} aria-hidden="true" /></span><h3>No services selected</h3><p>Add a treatment to begin.</p>
                </div> : <ul className={styles.selectedList} aria-label="Selected treatments">
                  {selected.map((item) => <li key={item.id} className={styles.selectedItem} data-selection-row={item.id}>
                    <div className={styles.selectedHeading}><strong>{item.name}</strong><button type="button" disabled={live?.disabled} aria-label={`Remove ${item.name} from selection`} onClick={() => toggle(item.id)}><X size={14} aria-hidden="true" /></button></div>
                    <span className={styles.itemDetail}>{item.minutes} min{item.kind === "package" ? " · Package" : ""} · {formatCurrency(item.price)} each</span>
                    <div className={styles.selectedBottom}>
                      <div className={styles.quantity} role="group" aria-label={`${item.name} quantity`}>
                        <button type="button" disabled={live?.disabled || quantities[item.id] <= 1} aria-label={`Decrease ${item.name} quantity`} onClick={() => changeQuantity(item.id, -1)}><Minus size={12} aria-hidden="true" /></button>
                        <AnimatedValue value={quantities[item.id]} />
                        <button type="button" disabled={live?.disabled || quantities[item.id] >= 99} aria-label={`Increase ${item.name} quantity`} onClick={() => changeQuantity(item.id, 1)}><Plus size={12} aria-hidden="true" /></button>
                      </div>
                      <strong><AnimatedValue value={item.price * quantities[item.id]} currency /></strong>
                    </div>
                  </li>)}
                </ul>}
              </div>
              <div className={styles.nextDetails}>
                <div><span><CalendarDays size={15} aria-hidden="true" /> Schedule</span><small>Choose next</small></div>
                <div><span><UserRound size={15} aria-hidden="true" /> Customer</span><small>Add later</small></div>
              </div>
              <div className={styles.total} aria-live="polite" aria-atomic="true"><div><span>Estimated total</span><small>{units} {units === 1 ? "item" : "items"} selected</small></div><strong><AnimatedValue value={total} currency /></strong></div>
              <div className={styles.nextAction}>
                <button type="button" className={styles.continue} disabled={!live?.canContinue || live.disabled} onClick={live?.onContinue} aria-describedby={`${id}-prototype-scope`}>Continue to schedule <span><ArrowRight size={18} aria-hidden="true" /></span></button>
                <p id={`${id}-prototype-scope`}>{live ? "Choose your appointment time next." : "Service selection preview. Scheduling comes next."}</p>
              </div>
            </div>
          </aside>
        </div>
        {presentation === "sheet" && <div className={styles.mobileBar}>
          <div className={styles.mobileBarActions}>
            <button type="button" className={styles.selectionToggle} aria-expanded={selectionOpen} aria-controls={`${id}-selection-summary`} onClick={() => {
              setSelectionOpen(!selectionOpen);
              if (!selectionOpen) requestAnimationFrame(() => document.getElementById(`${id}-selection-summary`)?.querySelector<HTMLButtonElement>("button")?.focus());
            }}>
              <span>{units} {units === 1 ? "treatment" : "treatments"} <ChevronUp size={15} aria-hidden="true" /></span>
              <strong><AnimatedValue value={total} currency /></strong>
            </button>
            <button type="button" className={styles.mobileContinue} disabled={!live?.canContinue || live.disabled} onClick={live?.onContinue} aria-describedby={`${id}-mobile-scope`}>Continue <ArrowRight size={17} aria-hidden="true" /></button>
          </div>
          <p id={`${id}-mobile-scope`}>{live ? "Choose your appointment time next." : "Selection preview only · Scheduling comes next"}</p>
          <span className={styles.screenReaderOnly} role="status">{units} {units === 1 ? "treatment" : "treatments"} selected. Estimated total {formatCurrency(total)}.</span>
        </div>}
        <footer className={styles.footer}><span>HANAYIN</span><span>{live ? "Availability confirmed when scheduling" : "Sample prices · No booking is created"}</span></footer>
      </div>
    </div>
  );
}
