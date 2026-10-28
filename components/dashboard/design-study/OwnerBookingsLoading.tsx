import styles from "@/components/dashboard/design-study/owner-services.module.css";
import bookings from "@/components/dashboard/design-study/owner-bookings.module.css";

export function BookingOverviewLoading() {
  return <section className={styles.summary} aria-label="Loading booking overview" aria-busy="true">{Array.from({ length: 4 }, (_, i) => <div key={i} className={styles.metric}><div className={`${styles.skeleton} ${styles.skeletonText}`} /><div className={`${styles.skeleton} ${styles.skeletonMetric}`} /><div className={`${styles.skeleton} ${styles.skeletonText}`} /></div>)}</section>;
}

export function BookingRegisterLoading() {
  return <div className={styles.list} aria-label="Loading booking register" aria-busy="true">{Array.from({ length: 4 }, (_, i) => <div className={`${styles.row} ${bookings.loadingRow}`} key={i}><div className={`${styles.skeleton} ${styles.skeletonText}`} /><div className={`${styles.skeleton} ${styles.skeletonText}`} /><div className={`${styles.skeleton} ${styles.skeletonText}`} /></div>)}</div>;
}

export function OwnerBookingsLoading() {
  return <div className={styles.page} aria-label="Loading bookings" aria-busy="true"><div className={styles.content}><div className={`${styles.skeleton} ${styles.skeletonText}`} /><div className={`${styles.skeleton} ${styles.skeletonTitle}`} /><div className={`${styles.skeleton} ${styles.skeletonText}`} /><div className={bookings.loadingFilters}><div className={`${styles.skeleton} ${styles.skeletonText}`} /></div><BookingOverviewLoading /><div className={bookings.columns}><BookingRegisterLoading /><div className={`${bookings.review} ${bookings.loadingReview}`}><div className={`${styles.skeleton} ${styles.skeletonText}`} /></div></div></div></div>;
}
