import { BarChart3, CalendarDays, Layers3, MessageCircle, ReceiptText, Scissors, TrendingUp, Users } from "lucide-react";
import OwnerDashboardShell from "@/components/dashboard/design-study/OwnerDashboardShell";
import styles from "@/components/dashboard/design-study/owner-dashboard-study.module.css";
import summary from "@/components/dashboard/design-study/overview-summary.module.css";
import loading from "@/components/dashboard/design-study/owner-redesign-loading.module.css";

const cards = {
  performance: { title: "Business performance", note: "Your business, in a little more detail.", icon: BarChart3, id: "performance" },
  appointments: { title: "Today’s bookings", note: "A little rhythm for your day.", icon: CalendarDays, id: "appointments" },
  queue: { title: "Live queue", note: "Pending services and your claimed work.", icon: Layers3, id: "queue" },
  expenses: { title: "Expense breakdown", note: "Where your business budget goes.", icon: ReceiptText, id: "expenses" },
  growth: { title: "Room to grow", note: "Opportunities for your business.", icon: TrendingUp, id: "growth" },
  rankings: { title: "Top services", note: "Ranked by service revenue.", icon: Scissors, id: "top-services" },
  staff: { title: "Staff performance", note: "The people behind every good visit.", icon: Users, id: "team" },
  customers: { title: "Top customers", note: "A familiar face, a lasting connection.", icon: MessageCircle, id: "customers" },
};

function Line({ wide = false }: { wide?: boolean }) {
  return <span className={`${loading.line} ${wide ? loading.wide : ""}`} />;
}

function Retry({ onRetry }: { onRetry?: () => void }) {
  return <div className={loading.error} role="alert"><p>This section could not be loaded.</p><button type="button" onClick={onRetry}>Try again</button></div>;
}

export function DashboardCardPlaceholder({ kind, failed = false, onRetry }: { kind: keyof typeof cards; failed?: boolean; onRetry?: () => void }) {
  const { title, note, icon: Icon, id } = cards[kind];
  return <section id={id} className={`${styles.card} ${styles[kind]} ${loading.card}`} aria-label={title} aria-busy={!failed} data-dashboard-loading={failed ? undefined : kind}>
    <div className={styles.cardHead}><div><h2>{title}</h2><p>{note}</p></div><Icon size={18} aria-hidden="true" /></div>
    {failed ? <Retry onRetry={onRetry} /> : <>
      <span className={loading.srOnly} role="status">Loading {title.toLowerCase()}…</span>
      <div className={loading.shapes} aria-hidden="true">
        {kind === "performance" ? <div className={loading.chart}><div className={loading.chartSummary}><Line /><span className={loading.amount} /><Line wide /><Line /></div><div className={loading.plot}>{[42, 64, 51, 77, 60, 88, 71].map((height, i) => <i key={i} style={{ height: `${height}%` }} />)}</div></div>
          : kind === "growth" ? <div className={loading.growth}><span className={loading.amount} /><Line wide /><Line wide /><Line /></div>
          : <>
            {(kind === "queue" || kind === "appointments") && <div className={loading.tabs}>{[0, 1, 2].map(i => <Line key={i} />)}</div>}
            {kind === "expenses" && <span className={loading.amount} />}
            {[0, 1, 2].map(i => <div className={loading.row} key={i}>
              {(kind === "appointments" || kind === "staff" || kind === "customers") && <span className={loading.avatar} />}
              <div><Line wide /><Line />{(kind === "expenses" || kind === "rankings") && <span className={loading.bar} />}</div>
              <span className={loading.end} />
            </div>)}
          </>}
      </div>
    </>}
  </section>;
}

export function DashboardOverviewPlaceholder({ failed = false, onRetry }: { failed?: boolean; onRetry?: () => void }) {
  return <div className={summary.summary}>
    <div className={summary.heading}><div><p className={summary.eyebrow}>YOUR BUSINESS, AT A GLANCE</p><h1>A good day starts here.</h1><p>A clear view of your bookings, team, and business.</p></div><span className={`${summary.date} ${loading.date}`} aria-hidden="true"><Line wide /></span></div>
    <section className={summary.metrics} aria-label="Performance overview" aria-busy={!failed}>
      {["Total revenue", "Bookings", "Customers served", "Avg. spend"].map((title, index) => <div key={title}><article className={`${summary.metric} ${index === 0 ? summary.revenue : index === 2 ? summary.customers : ""}`}>
        <div className={summary.label}><h2>{title}</h2></div>
        {failed ? <Retry onRetry={onRetry} /> : <div className={loading.metricShapes} aria-hidden="true"><span className={loading.amount} /><Line wide /><Line /></div>}
      </article></div>)}
    </section>
    {!failed && <span role="status" className={loading.srOnly}>Loading performance overview…</span>}
    <div className={summary.team} aria-busy={!failed}><div className={summary.teamHeading}><h2>Recent contributors</h2><span>This month’s completed work</span></div><div aria-hidden="true" className={loading.team}><Line wide /><Line /><Line /></div></div>
  </div>;
}

export default function OwnerRedesignLoading({ fontClassName = "" }: { fontClassName?: string }) {
  return <OwnerDashboardShell fontClassName={fontClassName}>
    <DashboardOverviewPlaceholder />
    <div className={styles.grid}>{(Object.keys(cards) as (keyof typeof cards)[]).map(kind => <DashboardCardPlaceholder key={kind} kind={kind} />)}</div>
  </OwnerDashboardShell>;
}
