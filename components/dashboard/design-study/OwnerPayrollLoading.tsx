import styles from "@/components/dashboard/design-study/owner-payroll-loading.module.css";
import catalog from "@/components/dashboard/design-study/owner-services.module.css";

export function OwnerPayrollLoading() {
  return <div className={`${catalog.page} ${catalog.content} ${styles.page}`} role="status" aria-label="Loading payroll" aria-busy="true">
    <div aria-hidden="true">
      <div className={styles.back}><span /></div>
      <div className={styles.header}><div className={styles.heading}><span className={styles.short} /><span className={styles.title} /><span className={styles.description} /></div><div className={styles.actions}><span /><span /><span /></div></div>
      <div className={styles.summary} data-payroll-skeleton="summary">{[0, 1, 2, 3].map(metric => <div key={metric}><span className={styles.short} /><span className={styles.number} /><span className={styles.description} /></div>)}</div>
      <div className={styles.steps}>{[0, 1, 2].map(step => <div key={step} data-payroll-skeleton="step"><i /><span /></div>)}</div>
      <div className={styles.filters}><span /><span /></div>
      <div className={styles.rows}>{[0, 1, 2, 3, 4].map(row => <div className={styles.row} key={row} data-payroll-skeleton="employee"><div className={styles.person}><i /><div><span className={styles.name} /><span className={styles.short} /></div></div><span className={styles.value} /><span className={styles.value} /><span className={styles.value} /><div className={styles.rowActions}><span /></div></div>)}</div>
    </div>
  </div>;
}
