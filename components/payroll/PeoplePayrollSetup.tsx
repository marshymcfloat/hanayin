import styles from "./payroll.module.css";

export function PeoplePayrollSetup({ employeeId, employeeName, payrollHref }: { employeeId: number; employeeName: string; payrollHref: string }) {
  const separator = payrollHref.includes("?") ? "&" : "?";
  return <a className={styles.secondary} href={payrollHref + separator + "stage=setup&employee=" + employeeId} aria-label={"Payroll setup for " + employeeName}>Compensation and payroll setup</a>;
}
