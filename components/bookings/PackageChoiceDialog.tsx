"use client";
import { useState } from "react";
import { toast } from "sonner";
import type { Service, ServicePackage, PackageItem } from "@/prisma/generated/prisma/client";
import { readPackageChoices, matchesServiceRule } from "@/features/catalog/offer-definitions";
import { allocateCents, moneyCents, fromCents } from "@/features/bookings/pricing-arithmetic";
import { CatalogEditorOverlay, CatalogEditorFooter } from "@/components/dashboard/owner-preview/CatalogEditorOverlay";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import styles from "@/components/dashboard/design-study/owner-services.module.css";

type Package = ServicePackage & { items: (PackageItem & { service: Service })[] };
export type ChosenPackageService = Service & { quantity: number; packageId: number; packageName: string; packageInstanceId: string; packageChoiceId?: string; selectionKey: string; originalPrice: number };
export function PackageChoiceDialog({ pkg, services, open, onClose, onExited, onAdd }: { pkg: Package; services: Service[]; open: boolean; onClose: () => void; onExited: () => void; onAdd: (services: ChosenPackageService[]) => void }) {
  const choices = readPackageChoices(pkg.choices);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const selectedServices = choices.flatMap(choice => { const service = services.find(service => service.id === selected[choice.id] && matchesServiceRule(choice.rule, service)); return service ? [service] : []; });
  const complete = choices.length > 0 && selectedServices.length === choices.length;
  function add() {
    if (!complete) { toast.error("Choose an eligible service for every choice."); return; }
    const instance = crypto.randomUUID();
    const included = [...pkg.items.map(item => ({ service: item.service, choiceId: undefined as string | undefined })), ...choices.map(choice => ({ service: services.find(service => service.id === selected[choice.id])!, choiceId: choice.id }))];
    const prices = allocateCents(moneyCents(pkg.price), included.map(item => moneyCents(item.service.price)));
    onAdd(included.map(({ service, choiceId }, index) => ({ ...service, quantity: 1, price: fromCents(prices[index]), originalPrice: fromCents(prices[index]), packageId: pkg.id, packageName: pkg.name, packageInstanceId: instance, packageChoiceId: choiceId, selectionKey: `${instance}-${index}` })));
    onClose();
  }
  const duration = [...pkg.items.map(item => item.service), ...selectedServices].reduce((sum, service) => sum + (service.duration || 30), 0);
  return <CatalogEditorOverlay open={open} onOpenChange={next => { if (!next) onClose(); }} onExited={onExited} title={pkg.name} description="Choose your included services. Every eligible choice is included in the fixed price." restoreFocusKey={`package-choice:${pkg.id}`} className={styles.editor}>
    <ScrollArea type="scroll" scrollHideDelay={800} className={styles.editorScroll}><div className={`${styles.editorFields} grid gap-5`}>
      {pkg.items.length > 0 && <section><h3 className="font-semibold">Always included</h3><ul className="mt-2 grid gap-2 text-sm">{pkg.items.map(item => <li key={item.service_id}>{item.service.name} · {item.service.duration || 30} min</li>)}</ul></section>}
      {choices.map(choice => {
        const eligible = services.filter(service => matchesServiceRule(choice.rule, service));
        return <section className="grid gap-2" key={choice.id}><label htmlFor={`choice-${choice.id}`}>{choice.label}</label><Select value={selected[choice.id] ? String(selected[choice.id]) : ""} onValueChange={value => setSelected(current => ({ ...current, [choice.id]: Number(value) }))}><SelectTrigger id={`choice-${choice.id}`} className={styles.categorySelect}><SelectValue placeholder="Choose one service" /></SelectTrigger><SelectContent className={styles.menu}>{eligible.map(service => <SelectItem key={service.id} value={String(service.id)}>{service.name} · {service.duration || 30} min</SelectItem>)}</SelectContent></Select>{!eligible.length && <p role="alert">No eligible services are currently available. This package cannot be booked.</p>}</section>;
      })}
      <p className="text-sm" role="status">{complete ? `${duration} minutes total · availability is checked for these services.` : "Complete every choice to check the full duration and availability."}</p>
      <div className={styles.previewPrice}><span>Package total · all choices included</span><strong>₱{pkg.price.toFixed(2)}</strong></div>
    </div></ScrollArea>
    <CatalogEditorFooter className={styles.editorFooter}><button type="button" onClick={onClose} className={styles.secondary}>Cancel</button><button type="button" className={styles.primary} disabled={!complete} onClick={add}>Add package</button></CatalogEditorFooter>
  </CatalogEditorOverlay>;
}
