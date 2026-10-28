import styles from "@/components/dashboard/design-study/owner-business-workspace.module.css";
import hours from "@/components/dashboard/design-study/owner-hours-editor.module.css";

export function OwnerBusinessLoading({ page }: { page: "business-hours" | "billing" | "reports" }) {
  const label = page === "business-hours" ? "business hours" : page;
  if (page === "business-hours") return <div className={hours.page} role="status" aria-label="Loading business hours" aria-busy="true"><div aria-hidden="true">
    <header className={styles.header}><div style={{width:"min(100%,600px)"}}><div className={styles.skeleton} style={{width:130,height:10}}/><div className={styles.skeleton} style={{height:46,margin:"14px 0"}}/><div className={styles.skeleton}/></div></header>
    <div className={hours.main}><div className={hours.cardHeading}><div className={styles.skeleton} style={{width:46,height:46}}/><div className={styles.skeleton} style={{width:"60%",height:30}}/></div><div className={styles.skeleton} style={{height:40}}/><div style={{padding:24}}>{[0,1,2].map(day=><div className={styles.skeleton} key={day} style={{height:42,marginBottom:14}}/>)}</div></div>
    <div className={hours.exceptions} style={{padding:24}}><div className={styles.skeleton} style={{width:"65%",height:22}}/><div className={styles.skeleton} style={{width:"80%",marginTop:12}}/></div>
  </div></div>;
  return <div className={styles.page} role="status" aria-label={`Loading ${label}`} aria-busy="true"><div aria-hidden="true">
    <header className={styles.header}><div style={{ width:"min(100%,450px)" }}><div className={styles.skeleton} style={{width:130,height:10}} /><div className={styles.skeleton} style={{width:"70%",height:38,margin:"14px 0"}} /><div className={styles.skeleton} /></div></header>
    {page === "billing" ? <>
      <div className={styles.columns}><div className={styles.skeleton} style={{height:235,borderRadius:24}}/><div className={styles.aside}><div className={styles.skeleton}/><div className={styles.skeleton} style={{height:150}}/></div></div>
      <div className={styles.features}>{Array.from({length:6},(_,i)=><div className={styles.skeleton} key={i} style={{height:86}}/>)}</div>
    </> : <>
      {page === "reports" && <div className={styles.skeleton} style={{height:48,width:"min(100%,560px)"}}/>}
      <div className={`${styles.summary} ${page === "reports" ? styles.reportMetrics : ""}`}>{Array.from({length:page === "reports" ? 4 : 3},(_,i)=><div key={i} className={styles.metric}><div className={styles.skeleton} style={{width:"50%"}}/><div className={styles.skeleton} style={{height:30,marginTop:16}}/></div>)}</div>
      {page === "reports" && <div className={`${styles.skeleton} ${styles.chart}`} style={{marginBottom:28}}/>}
    </>}
    <div className={styles.columns}><div className={styles.list}>{Array.from({length:4},(_,i)=><div key={i} className={styles.skeletonRow}><div className={styles.skeleton} style={{width:"60%"}}/></div>)}</div><div className={styles.aside}><div className={styles.skeleton}/><div className={styles.skeleton} style={{height:150}}/></div></div>
  </div></div>;
}
