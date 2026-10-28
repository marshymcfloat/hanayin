"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { InsightSpan } from "@/features/dashboard/types/owner-redesign";
import styles from "@/components/dashboard/design-study/owner-dashboard-study.module.css";
import chartStyles from "@/components/dashboard/design-study/sales-chart-study.module.css";

export default function InsightSpanSelect({ value, onChange, label, fontClassName, range }: {
  value: InsightSpan; onChange: (value: InsightSpan) => void; label: string; fontClassName: string; range: string;
}) {
  return <div className={styles.insightFilters}>
    <span>{range}</span>
    <Select value={value} onValueChange={next => onChange(next as InsightSpan)}>
      <SelectTrigger className={chartStyles.spanSelect} aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent position="popper" align="end" sideOffset={5} className={`${chartStyles.spanMenu} ${fontClassName}`}>
        {(["Week", "Month", "Year"] as const).map(span => <SelectItem key={span} value={span} className={chartStyles.spanOption}>{span}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>;
}
