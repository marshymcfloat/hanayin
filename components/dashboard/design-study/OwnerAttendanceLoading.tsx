import styles from "@/components/dashboard/design-study/owner-services.module.css";
import attendance from "@/components/dashboard/design-study/owner-attendance.module.css";

export function OwnerAttendanceLoading() {
  return <section className={styles.page} aria-label="Loading attendance" aria-busy="true" role="status">
    <div className={styles.header}><div><p className={styles.eyebrow}>Your team · Attendance</p><h1>Attendance</h1><div className={styles.skeletonText + " " + styles.skeleton} /></div><div className={styles.skeleton} style={{ width: 230, height: 44 }} /></div>
    <div className={styles.summary} aria-hidden="true">{Array.from({ length: 4 }, (_, i) => <div className={styles.metric} key={i}><div className={styles.skeletonText + " " + styles.skeleton} /><div className={styles.skeletonMetric + " " + styles.skeleton} /></div>)}</div>
    <div className={attendance.toolbar} aria-hidden="true"><div className={styles.skeleton} style={{ width: 260, height: 44 }} /><div className={styles.skeleton} style={{ width: 200, height: 44 }} /></div>
    <div className={styles.list} aria-hidden="true">{Array.from({ length: 4 }, (_, i) => <div className={`${styles.row} ${attendance.skeletonRow}`} key={i}><div className={styles.skeleton} style={{ width: "45%", height: 18 }} /><div className={styles.skeleton} style={{ width: "70%", height: 14, marginTop: 16 }} /></div>)}</div>
  </section>;
}
