"use client";
import { useId, useState } from "react";
import { matchesServiceRule, ruleLabel, type ServiceRule } from "@/features/catalog/offer-definitions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import styles from "@/components/dashboard/design-study/owner-services.module.css";

export type RuleEditorService = { id: number; name: string; category: string; price?: number };
export function ServiceRuleEditor({ label, rule, services, onChange, fontClassName = "" }: { label: string; rule: ServiceRule; services: RuleEditorService[]; onChange: (rule: ServiceRule) => void; fontClassName?: string }) {
  const id = useId();
  const [search, setSearch] = useState("");
  const eligible = services.filter(service => matchesServiceRule(rule, { ...service, price: service.price ?? 0 }));
  const categories = [...new Set(services.map(service => service.category))].sort();
  return <fieldset className="grid min-w-0 gap-3 rounded-2xl border border-[#E6DCF3] p-4">
    <legend className="px-1 text-sm font-semibold">{label}</legend>
    <label htmlFor={id}>Choose from</label><Select value={rule.kind} onValueChange={value => onChange(value === "SERVICES" ? { kind: "SERVICES", serviceIds: [] } : { kind: "CATEGORY", category: categories[0] ?? "" })}><SelectTrigger id={id} className={styles.categorySelect}><SelectValue /></SelectTrigger><SelectContent className={`${styles.menu} ${fontClassName}`}><SelectItem value="SERVICES">Selected services</SelectItem><SelectItem value="CATEGORY">A category</SelectItem></SelectContent></Select>
    {rule.kind === "CATEGORY" ? <>
      <label htmlFor={`${id}-category`}>Category</label><Select value={rule.category} onValueChange={category => onChange({ ...rule, category })}><SelectTrigger id={`${id}-category`} className={styles.categorySelect}><SelectValue placeholder="Choose a category" /></SelectTrigger><SelectContent className={`${styles.menu} ${fontClassName}`}>{categories.map(category => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select>
      <div className="grid gap-3 sm:grid-cols-2">{(["minPrice", "maxPrice"] as const).map(key => <label key={key} className="grid gap-2 text-xs">{key === "minPrice" ? "Minimum" : "Maximum"} regular price (optional)<input className="h-11 rounded-xl border px-3" type="number" min="0" step="0.01" value={rule[key] ?? ""} onChange={event => onChange({ ...rule, [key]: event.target.value === "" ? undefined : Number(event.target.value) })} /></label>)}</div>
      <p className="text-xs leading-5">New matching services are included automatically.</p>
    </> : <>
      <label className="grid gap-2 text-xs">Find services<input className="h-11 rounded-xl border px-3" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name or category…" /></label>
      {services.filter(service => `${service.name} ${service.category}`.toLowerCase().includes(search.trim().toLowerCase())).map(service => <label key={service.id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" checked={rule.serviceIds.includes(service.id)} onChange={() => onChange({ ...rule, serviceIds: rule.serviceIds.includes(service.id) ? rule.serviceIds.filter(id => id !== service.id) : [...rule.serviceIds, service.id] })} />{service.name}<span className="ml-auto text-xs">₱{service.price ?? 0}</span></label>)}
    </>}
    <p role="status" className="text-xs leading-5">{eligible.length ? `${eligible.length} eligible · ${ruleLabel(rule)}` : "No eligible services. Adjust this group before saving."}</p>
    {rule.kind === "CATEGORY" && eligible.length > 0 && <details className="text-xs"><summary className="min-h-11 cursor-pointer py-3">Preview eligible services</summary><ul className="grid gap-2">{eligible.map(service => <li key={service.id}>{service.name} · ₱{service.price ?? 0}</li>)}</ul></details>}
  </fieldset>;
}
