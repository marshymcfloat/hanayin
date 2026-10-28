import styles from "@/components/dashboard/design-study/owner-services.module.css";
import gifts from "@/components/dashboard/design-study/owner-gift-cards.module.css";

export function OwnerGiftCardsLoading({ fontClassName = "" }: { fontClassName?: string }) {
  return <div className={`${styles.page} ${fontClassName}`} role="status" aria-label="Loading gift cards" aria-busy="true"><div className={styles.content} aria-hidden="true">
    <div className={styles.back}><div className={styles.skeleton} style={{ width: 90, height: 12 }} /></div>
    <div className={styles.header}><div style={{ flex: 1 }}><div className={styles.skeleton} style={{ width: 160, height: 10 }} /><div className={`${styles.skeleton} ${styles.skeletonTitle}`} /><div className={`${styles.skeleton} ${styles.skeletonText}`} /></div><div className={gifts.headerActions}>{[0, 1].map(index => <div key={index} className={styles.skeleton} style={{ width: 140, height: 44 }} />)}</div></div>
    <div className={styles.summary}>{Array.from({ length: 4 }, (_, index) => <div className={styles.metric} key={index}><div className={styles.skeleton} style={{ width: "75%", height: 12 }} /><div className={`${styles.skeleton} ${styles.skeletonMetric}`} /><div className={`${styles.skeleton} ${styles.skeletonText}`} /></div>)}</div>
    <div className={styles.toolbar}><div className={styles.skeleton} style={{ width: 150, height: 24 }} /><div className={styles.skeleton} style={{ width: "min(100%, 420px)", height: 44 }} /></div>
    <div className={styles.list}>{Array.from({ length: 5 }, (_, index) => <div key={index} className={gifts.skeletonRow}><div className={`${styles.skeleton} ${styles.skeletonIcon}`} />{[0, 1, 2, 3].map(column => <div key={column}><div className={styles.skeleton} style={{ width: "75%", height: 14 }} /><div className={`${styles.skeleton} ${styles.skeletonText}`} /></div>)}</div>)}</div>
  </div></div>;
}
