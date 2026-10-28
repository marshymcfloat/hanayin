import styles from "@/components/dashboard/design-study/owner-services.module.css";
import ui from "@/components/dashboard/design-study/owner-social-posts.module.css";

export function OwnerSocialPostsLoading() {
  return <div className={styles.page} role="status" aria-label="Loading social posts" aria-busy="true"><div aria-hidden="true">
    <div className={styles.skeleton} style={{ width: "60%", height: 54, marginBottom: 28 }}/>
    <div className={styles.summary}>{[0,1,2,3].map(item => <div key={item} className={styles.metric}><div className={styles.skeleton} style={{ height: 78 }}/></div>)}</div>
    <div className={styles.skeleton} style={{ height: 88, marginBottom: 28 }}/>
    <div className={styles.skeleton} style={{ height: 44, marginBottom: 20 }}/>
    <div className={ui.library}>{[0,1,2].map(item => <div className={styles.skeleton} style={{ height: 330, borderRadius: 20 }} key={item}/>)}</div>
  </div></div>;
}
