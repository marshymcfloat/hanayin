import styles from "@/components/dashboard/design-study/owner-services.module.css";
import customers from "@/components/dashboard/design-study/owner-customers.module.css";

export function OwnerCustomersLoading() {
  return <div className={styles.page} role="status" aria-label="Loading customers" aria-busy="true"><div className={styles.content} aria-hidden="true">
    <div className={styles.back}><div className={styles.skeleton} style={{ width: 90, height: 12 }} /></div>
    <div className={styles.header}><div><div className={`${styles.skeleton} ${styles.skeletonTitle}`} /><div className={`${styles.skeleton} ${styles.skeletonText}`} style={{ width: 260 }} /></div><div className={styles.skeleton} style={{ width: 150, height: 44 }} /></div>
    <div className={styles.summary}>{Array.from({ length: 4 }, (_, i) => <div className={styles.metric} key={i}><div className={styles.skeleton} style={{ width: "75%", height: 12 }} /><div className={`${styles.skeleton} ${styles.skeletonMetric}`} /><div className={`${styles.skeleton} ${styles.skeletonText}`} /></div>)}</div>
    <div className={styles.toolbar}><div className={styles.skeleton} style={{ width: 160, height: 36 }} /><div className={styles.skeleton} style={{ width: "min(100%, 300px)", height: 44 }} /></div>
    <div className={styles.skeleton} style={{ width: "min(100%, 350px)", height: 44, marginBottom: 18 }} />
    <div className={styles.list}>{Array.from({ length: 5 }, (_, i) => <div className={`${styles.skeletonRow} ${customers.loadingRow}`} key={i}><div className={`${styles.skeleton} ${styles.skeletonIcon}`} /><div><div className={styles.skeleton} style={{ width: "65%", height: 14 }} /><div className={`${styles.skeleton} ${styles.skeletonText}`} /></div><div className={styles.skeleton} style={{ width: "80%", height: 44 }} /></div>)}</div>
  </div></div>;
}
