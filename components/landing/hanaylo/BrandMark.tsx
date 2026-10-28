import styles from "@/components/landing/hanaylo/hanaylo.module.css";

export default function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <span className={small ? styles.brandSmall : styles.brand}>
      <span className={styles.brandMark} aria-hidden="true"><i /><i /><i /></span>
      <span>HANAYIN</span>
    </span>
  );
}
