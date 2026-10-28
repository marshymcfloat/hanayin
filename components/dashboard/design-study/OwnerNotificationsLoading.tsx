import { OwnerNotificationsFrame } from "@/components/dashboard/design-study/OwnerNotificationsFrame";
import styles from "@/components/dashboard/design-study/owner-services.module.css";
import notices from "@/components/dashboard/design-study/owner-notifications.module.css";

export function OwnerNotificationsLoading() {
  return <OwnerNotificationsFrame><div role="status" aria-label="Loading notifications" aria-busy="true">
    <section className={styles.summary} aria-label="Loading notification overview">{[0, 1, 2, 3].map(i => <div key={i} className={styles.metric} aria-hidden="true"><div className={styles.skeleton} style={{ width: "75%", height: 12 }} /><div className={`${styles.skeleton} ${styles.skeletonMetric}`} /><div className={`${styles.skeleton} ${styles.skeletonText}`} /></div>)}</section>
    <div className={notices.columns}><section aria-label="Loading delivery history"><div className={`${styles.skeleton} ${notices.loadingListHeading}`} aria-hidden="true" /><div className={`${styles.skeleton} ${notices.loadingFilters}`} aria-hidden="true" /><div className={notices.loadingList} aria-hidden="true">{[0, 1, 2].map(i => <div key={i} className={notices.loadingRow}><div className={styles.skeleton} style={{ width: "65%", height: 18 }} /><div className={`${styles.skeleton} ${styles.skeletonText}`} /><div className={`${styles.skeleton} ${styles.skeletonText}`} /></div>)}</div></section><section aria-label="Loading channel performance" className={`${styles.skeleton} ${notices.loadingAside}`} /></div>
  </div></OwnerNotificationsFrame>;
}
