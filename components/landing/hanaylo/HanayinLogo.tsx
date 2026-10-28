import Image from "next/image";
import styles from "@/components/landing/hanaylo/logo.module.css";

export default function HanayinLogo({ footer = false }: { footer?: boolean }) {
  return (
    <span className={`${styles.logo} ${footer ? styles.footer : ""}`} aria-hidden="true">
      <Image
        src="/hanaylo/hanayin-logo-v1.png"
        alt=""
        width={2172}
        height={724}
        sizes={footer ? "250px" : "(max-width: 520px) 146px, 203px"}
        loading={footer ? "lazy" : "eager"}
      />
    </span>
  );
}
