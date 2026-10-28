import styles from "@/components/dashboard/design-study/owner-services.module.css";

export function OwnerServicesLoading({ label = "services", fontClassName = "" }: { label?: string; fontClassName?: string }) {
  return <div className={`${styles.page} ${fontClassName}`} role="status" aria-label={`Loading ${label}`} aria-busy="true">
    <div className={styles.content} aria-hidden="true">
      <div className={styles.back}><div className={styles.skeleton} style={{ width: 90, height: 12 }} /></div>
      <div className={styles.header}>
        <div style={{ flex: 1 }}><div className={styles.skeleton} style={{ width: 160, height: 10 }} /><div className={`${styles.skeleton} ${styles.skeletonTitle}`} /><div className={`${styles.skeleton} ${styles.skeletonText}`} /></div>
        <div className={`${styles.skeleton} ${styles.skeletonIcon}`} style={{ width: 130 }} />
      </div>
      <div className={styles.summary}>{Array.from({ length: 4 }, (_, index) => <div className={styles.metric} key={index}><div className={styles.skeleton} style={{ width: "75%", height: 12 }} /><div className={`${styles.skeleton} ${styles.skeletonMetric}`} /><div className={`${styles.skeleton} ${styles.skeletonText}`} /></div>)}</div>
      <div className={styles.catalog}>
        <div className={styles.toolbar}><div className={styles.skeleton} style={{ width: 150, height: 24 }} /><div className={styles.skeleton} style={{ width: "min(100%, 420px)", height: 44 }} /></div>
        <div className={styles.list}>{Array.from({ length: 5 }, (_, index) => <div className={styles.skeletonRow} key={index}><div className={`${styles.skeleton} ${styles.skeletonIcon}`} /><div><div className={styles.skeleton} style={{ width: "65%", height: 14 }} /><div className={`${styles.skeleton} ${styles.skeletonText}`} /></div><div className={styles.skeleton} style={{ width: "80%", height: 20 }} /></div>)}</div>
      </div>
    </div>
  </div>;
}
