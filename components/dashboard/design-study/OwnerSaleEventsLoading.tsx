import styles from "@/components/dashboard/design-study/owner-services.module.css";
import offers from "@/components/dashboard/design-study/owner-sale-events.module.css";

export function OwnerSaleEventsLoading({ fontClassName = "" }: { fontClassName?: string }) {
  return <div className={`${styles.page} ${fontClassName}`} role="status" aria-label="Loading sale events" aria-busy="true"><div className={styles.content} aria-hidden="true">
    <div className={styles.back}><div className={styles.skeleton} style={{ width: 90, height: 12 }} /></div>
    <div className={styles.header}><div style={{ flex: 1 }}><div className={styles.skeleton} style={{ width: 160, height: 10 }} /><div className={`${styles.skeleton} ${styles.skeletonTitle}`} /><div className={`${styles.skeleton} ${styles.skeletonText}`} /></div><div className={`${styles.skeleton} ${styles.skeletonIcon}`} style={{ width: 150 }} /></div>
    <div className={styles.summary}>{Array.from({ length: 4 }, (_, i) => <div className={styles.metric} key={i}><div className={styles.skeleton} style={{ width: "75%", height: 12 }} /><div className={`${styles.skeleton} ${styles.skeletonMetric}`} /><div className={`${styles.skeleton} ${styles.skeletonText}`} /></div>)}</div>
    <div className={styles.skeleton} style={{ height: 90, marginBottom: 28, borderRadius: 20 }}/>
    <div className={styles.toolbar}><div className={styles.skeleton} style={{ width: 150, height: 24 }} /><div className={styles.skeleton} style={{ width: "min(100%, 420px)", height: 44 }} /></div>
    <div className={styles.list}>{Array.from({ length: 5 }, (_, i) => <div className={styles.row} key={i}><div className={offers.row}><div className={styles.serviceIdentity}><div className={`${styles.skeleton} ${styles.skeletonIcon}`} /><div style={{ flex: 1 }}><div className={styles.skeleton} style={{ width: "75%", height: 14 }} /><div className={`${styles.skeleton} ${styles.skeletonText}`} /></div></div><div className={offers.schedule}><div className={styles.skeleton} style={{ width: 120, height: 12 }} /><div className={`${styles.skeleton} ${styles.skeletonText}`} /></div><div className={offers.discount}><div className={styles.skeleton} style={{ width: 100, height: 22 }} /><div className={`${styles.skeleton} ${styles.skeletonText}`} /></div><div className={`${styles.skeleton} ${styles.skeletonIcon} ${offers.actions}`} /></div></div>)}</div>
  </div></div>;
}
