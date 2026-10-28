"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { CalendarDays, Check, ChevronRight, Clock3, LayoutGrid, Users, Wallet } from "lucide-react";
import BrandMark from "@/components/landing/hanaylo/BrandMark";
import styles from "@/components/landing/hanaylo/hanaylo.module.css";

const views = ["The schedule", "The service", "The earnings"] as const;
const appointments = [
  { time: "10:00", customer: "Alex R.", service: "Cut & style", staff: "Mira", initials: "MR", duration: "45 min", state: "Completed", amount: "₱600", commission: "₱120", eligibleCommission: "₱120", paid: true },
  { time: "11:00", customer: "Sam D.", service: "Scalp treatment", staff: "Jules", initials: "JL", duration: "60 min", state: "In service", amount: "₱900", commission: "₱180", eligibleCommission: "₱0", paid: false },
  { time: "13:30", customer: "Jamie L.", service: "Cut & finish", staff: "Mira", initials: "MR", duration: "45 min", state: "Upcoming", amount: "₱600", commission: "₱120", eligibleCommission: "₱0", paid: false },
];

export default function WorkdayDemo() {
  const [view, setView] = useState(0);
  const [selected, setSelected] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const appointment = appointments[selected];

  function changeTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3;
    setView(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className={styles.demo}>
      <div className={styles.demoTop}><BrandMark small /><span className={styles.demoLabel}>Interactive product tour · Sample data</span><span className={styles.demoOwner} aria-hidden="true">AL</span></div>
      <div className={styles.demoBody}>
        <div className={styles.demoRail} aria-hidden="true"><LayoutGrid size={18} /><span><CalendarDays size={18} /></span><Users size={18} /><Wallet size={18} /><i /></div>
        <div className={styles.demoMain}>
          <div className={styles.demoHeading}><div><span className={styles.demoEyebrow}>A GOOD DAY STARTS HERE</span><h2>Your team. In sync.</h2></div><span className={styles.demoDate}>Tuesday, 06 Oct<CalendarDays size={14} aria-hidden="true" /></span></div>
          <div role="tablist" aria-label="Explore the product" className={styles.demoTabs}>
            {views.map((label, index) => <button key={label} ref={(element) => { tabRefs.current[index] = element; }} id={`workday-tab-${index}`} type="button" role="tab" aria-selected={view === index} aria-controls="workday-panel" tabIndex={view === index ? 0 : -1} onClick={() => setView(index)} onKeyDown={(event) => changeTab(event, index)}><span>0{index + 1}</span>{label}</button>)}
          </div>
          <div className={styles.demoPanel} role="tabpanel" id="workday-panel" aria-labelledby={`workday-tab-${view}`} tabIndex={0}>
            {view === 0 && <>
              <div className={styles.scheduleColumns}><span>TIME / CUSTOMER</span><span>SERVICE / STAFF</span><span>STATUS</span></div>
              {appointments.map((item, index) => <button key={item.customer} type="button" className={`${styles.appointment} ${selected === index ? styles.appointmentSelected : ""}`} aria-label={`View ${item.customer} service details`} onClick={() => { setSelected(index); setView(1); tabRefs.current[1]?.focus(); }}>
                <span className={styles.customerTime}><b>{item.time}</b><span>{item.customer}</span></span>
                <span className={styles.serviceCell}><b>{item.service}</b><span><i>{item.initials}</i>{item.staff}<span className={styles.duration}>· {item.duration}</span></span></span>
                <span className={`${styles.status} ${index === 0 ? styles.statusDone : index === 1 ? styles.statusServing : styles.statusUpcoming}`}>{index === 0 && <Check size={11} aria-hidden="true" />}{item.state}</span>
                <ChevronRight size={14} className={styles.rowArrow} aria-hidden="true" />
              </button>)}
              <div className={styles.scheduleFoot}><span><span className={styles.smallDot} />A place for appointments. And walk-ins.</span><span>Choose a service <ArrowHint /></span></div>
            </>}
            {view === 1 && <div className={styles.serviceView}>
              <div className={styles.serviceSummary}><span className={styles.smallLabel}>THE WORK, WITH A NAME TO IT</span><h3>{appointment.service}</h3><p>{appointment.customer} · {appointment.time} · {appointment.duration}</p><span className={styles.assignedPerson}><i>{appointment.initials}</i><span>Assigned to<strong>{appointment.staff}</strong></span></span></div>
              <dl className={styles.serviceLedger}><div><dt>Service status</dt><dd>{appointment.state}</dd></div><div><dt>Service value</dt><dd>{appointment.amount}</dd></div><div><dt>Payment</dt><dd>{appointment.paid ? "Fully paid" : "Not recorded"}</dd></div><div><dt>Commission rate</dt><dd>20%</dd></div></dl>
              <p className={styles.serviceNote}>Service completion and payment stay separate, so you can see where each visit stands.</p>
            </div>}
            {view === 2 && <div className={styles.earningsView}>
              <div className={styles.earningsTotal}><span className={styles.smallLabel}>{appointment.staff.toUpperCase()}’S ELIGIBLE SERVICE COMMISSION</span><strong>{appointment.eligibleCommission}<span>.00</span></strong><p>{appointment.amount} service base × 20% = {appointment.commission}</p><span>{appointment.paid ? <Check size={13} aria-hidden="true" /> : <Clock3 size={13} aria-hidden="true" />}{appointment.paid ? "Completed service · Fully paid booking" : "Pending completion and full payment"}</span></div>
              <div className={styles.earningsBreakdown}><span className={styles.smallLabel}>THE WORK BEHIND THE NUMBER</span><div><span>{appointment.customer} / {appointment.service}</span><b>{appointment.eligibleCommission}</b></div><p>{appointment.paid ? "Review eligible commissions alongside attendance-based daily pay when preparing a payslip." : "This service is not yet eligible for a payslip. It needs to be completed and the booking fully paid."}</p><span className={styles.payoutNote}>Payslips record earnings. Money transfers are handled separately.</span></div>
            </div>}
          </div>
          <div className={styles.demoBottom}><span><Clock3 size={12} aria-hidden="true" />The details connect. Your day keeps moving.</span><span>Illustrative interface</span></div>
        </div>
      </div>
    </div>
  );
}

function ArrowHint() { return <span aria-hidden="true">↗</span>; }
