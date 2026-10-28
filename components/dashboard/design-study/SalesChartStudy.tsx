"use client";

import { useState } from "react";
import { ArrowUpRight, BarChart3 } from "lucide-react";
import styles from "@/components/dashboard/design-study/sales-chart-study.module.css";
import AnimatedFilterGroup from "@/components/bookings/design-study/AnimatedFilterGroup";
import { AnimatedValue } from "@/components/bookings/design-study/SelectionMotion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { InsightSpan, OwnerRedesignAnalytics } from "@/features/dashboard/types/owner-redesign";

const money = (value: number) => `₱${value.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
const animatedMoney = (value: number) => money(Math.round(value * 100) / 100);
const compactMoney = (value: number) => `₱${(value / 1000).toFixed(1)}k`;
const countLabel = (value: number) => String(Math.round(value));

export default function SalesChartStudy({ className, fontClassName = "", periods }: { className: string; fontClassName?: string; periods: OwnerRedesignAnalytics["periods"] }) {
  const [metric, setMetric] = useState<"Revenue" | "Bookings">("Revenue");
  const [span, setSpan] = useState<InsightSpan>("Week");
  const data = { ...periods[span], period: span === "Week" ? "LAST 7 DAYS" : span === "Month" ? "THIS MONTH" : "LAST 12 MONTHS", cadence: span === "Year" ? "Monthly" : span === "Month" ? "Weekly" : "Daily", best: span === "Year" ? "Best month" : span === "Month" ? "Best week" : "Best day", length: span === "Year" ? "12 months" : span === "Month" ? "Month to date" : "7 days", description: periods[span].range };
  const values: readonly number[] = metric === "Revenue" ? data.revenue : data.bookings;
  const total = values.reduce((sum, value) => sum + value, 0);
  const peak = Math.max(0, ...values);
  const bestDay = values.indexOf(peak);
  const format = (value: number) => metric === "Revenue" ? money(value) : String(value);
  const numberFormat = metric === "Revenue" ? animatedMoney : countLabel;
  const barFormat = metric === "Revenue" && span !== "Week" ? compactMoney : numberFormat;

  return <section className={`${className} ${styles.card}`} id="performance" aria-labelledby="sales-chart-heading">
    <header className={styles.header}>
      <div className={styles.title}><span className={styles.icon}><BarChart3 size={17} aria-hidden="true" /></span><div><h2 id="sales-chart-heading">Business performance</h2><p>Your {span.toLowerCase()}, in a little more detail.</p></div></div>
      <div className={styles.controls}>
      <Select value={span} onValueChange={(value) => setSpan(value as InsightSpan)}>
        <SelectTrigger className={styles.spanSelect} aria-label="Chart time span"><SelectValue /></SelectTrigger>
        <SelectContent position="popper" align="end" sideOffset={5} className={`${styles.spanMenu} ${fontClassName}`}>
          {Object.keys(periods).map((item) => <SelectItem className={styles.spanOption} key={item} value={item}>{item}</SelectItem>)}
        </SelectContent>
      </Select>
      <AnimatedFilterGroup className={styles.switcher} label="Chart metric">
        {(["Revenue", "Bookings"] as const).map((item) => <button type="button" key={item} aria-pressed={metric === item} onClick={() => setMetric(item)}>{item}</button>)}
      </AnimatedFilterGroup>
      </div>
    </header>
    <div className={styles.report}>
      <div className={styles.summary}>
        <span className={styles.period}>{data.period} <span>{data.range}</span></span>
        <div className={styles.primary} aria-live="polite"><p>{metric === "Revenue" ? "Completed-service revenue" : "Bookings created"}</p><strong><AnimatedValue value={total} count formatNumber={numberFormat} /></strong><span>{metric === "Revenue" ? "From completed bookings" : "Accepted and completed bookings"}</span></div>
        <div className={styles.bestDay}><span>{data.best} <ArrowUpRight size={14} aria-hidden="true" /></span><strong>{peak ? data.labels[bestDay] : "No activity"} <span><AnimatedValue value={peak} count formatNumber={numberFormat} /></span></strong></div>
        <div className={styles.summaryFoot}><i aria-hidden="true" /> A snapshot of your studio</div>
      </div>
      <div className={styles.plotPanel}>
        <div className={styles.plotHeading}><span><i aria-hidden="true" /> {data.cadence} {metric.toLowerCase()}</span><small>{data.length}</small></div>
        <div className={styles.chart} data-span={span} role="img" aria-label={`${metric} trend over ${data.description}`}>
          <div className={styles.guides} aria-hidden="true"><span /><span /><span /></div>
          {values.map((value, index) => <div className={styles.column} key={index} data-peak={index === bestDay} title={`${data.labels[index]}: ${format(value)}`}>
            <div className={styles.bar} style={{ height: `${peak ? value / peak * 82 : 0}%` }}><span className={styles.value}><AnimatedValue value={value} count formatNumber={barFormat} /></span><i aria-hidden="true" /></div>
            <span className={styles.day}>{data.labels[index]}</span>
          </div>)}
        </div>
        <div className={styles.legend}><span><i /> {metric}</span><span><i /> {data.best}</span><span>{data.length}</span></div>
      </div>
    </div>
    <table className={styles.accessibleValues}>
      <caption>{metric} chart values</caption>
      <tbody>{values.map((value, index) => <tr key={data.labels[index]}><th scope="row">{data.labels[index]}</th><td>{format(value)}</td></tr>)}</tbody>
    </table>
  </section>;
}
