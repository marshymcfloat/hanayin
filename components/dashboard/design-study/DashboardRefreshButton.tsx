import { RefreshCw } from "lucide-react";
import styles from "@/components/dashboard/design-study/owner-dashboard-study.module.css";

export default function DashboardRefreshButton({ refreshing = false, pending, onRefresh }: {
  refreshing?: boolean;
  pending: boolean;
  onRefresh: () => void;
}) {
  return <button className={styles.previewBadge} type="button" onClick={onRefresh}
    disabled={refreshing || pending} aria-busy={refreshing} aria-label={refreshing ? "Refreshing…" : "Refresh data"}>
    <span className={styles.refreshIcon} aria-hidden="true"><RefreshCw size={15} /></span>
    <span className={styles.refreshLabel}>
      <span aria-hidden="true">Refresh data</span>
      <span>{refreshing ? "Refreshing…" : "Refresh data"}</span>
    </span>
  </button>;
}
