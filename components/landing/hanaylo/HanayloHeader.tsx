"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import BrandMark from "@/components/landing/hanaylo/BrandMark";
import HanayinLogo from "@/components/landing/hanaylo/HanayinLogo";
import useHeaderMotion from "@/components/landing/hanaylo/useHeaderMotion";
import originalStyles from "@/components/landing/hanaylo/hanaylo.module.css";
import referenceStyles from "@/components/landing/hanaylo/mobilo.module.css";

const links = [
  { href: "#product", label: "The product" },
  { href: "#for-teams", label: "Who it’s for" },
  { href: "#questions", label: "Good questions" },
];

export default function HanayloHeader({ appearance = "original" }: { appearance?: "original" | "reference" }) {
  const styles = appearance === "reference" ? referenceStyles : originalStyles;
  const navigationLinks = appearance === "reference" ? [
    { href: "#for-teams", label: "For teams" },
    { href: "#product", label: "Features" },
    { href: "#plans", label: "Plans" },
    { href: "#contact", label: "Contact" },
  ] : links;
  const [open, setOpen] = useState(false);
  const header = useRef<HTMLElement>(null);
  const surface = useRef<HTMLSpanElement>(null);
  const mobileNav = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  useHeaderMotion(header, surface, mobileNav, open, appearance === "reference");

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !header.current?.contains(event.target)) setOpen(false);
    };
    const dismissOnDesktop = () => {
      if (window.innerWidth > 800) setOpen(false);
    };
    document.addEventListener("pointerdown", dismissOutside);
    window.addEventListener("resize", dismissOnDesktop);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      window.removeEventListener("resize", dismissOnDesktop);
    };
  }, [open]);

  return (
    <header ref={header} className={styles.header} onKeyDown={(event) => {
      if (event.key === "Escape" && open) {
        setOpen(false);
        menuButton.current?.focus();
      }
    }}>
      <span ref={surface} className={styles.headerSurface} aria-hidden="true" />
      <div className={styles.headerInner}>
        <Link data-intro-nav={appearance === "reference" ? "" : undefined} href="/redesign" className={styles.brandLink} aria-label="HANAYIN home">{appearance === "reference" ? <HanayinLogo /> : <BrandMark />}</Link>
        <nav className={styles.desktopNav} aria-label="Main navigation">
          {navigationLinks.map((link) => <a data-intro-nav={appearance === "reference" ? "" : undefined} key={link.href} href={link.href}>{link.label}</a>)}
        </nav>
        <div data-intro-nav={appearance === "reference" ? "" : undefined} className={styles.headerActions}>
          <Link href="/login" className={styles.loginLink}>Log in</Link>
          <Link href="/apply" className={`${styles.button} ${styles.headerCta}`}>Get started <span className={styles.headerCtaIcon} aria-hidden="true"><ArrowUpRight size={15} /></span></Link>
          <button ref={menuButton} className={styles.menuButton} type="button" aria-expanded={open} aria-controls="hanaylo-mobile-nav" aria-label={open ? "Close navigation" : "Open navigation"} onClick={() => setOpen(!open)}>
            <span className={styles.menuGlyph} aria-hidden="true"><i /><i /></span>
          </button>
        </div>
      </div>
      <nav ref={mobileNav} id="hanaylo-mobile-nav" className={styles.mobileNav} aria-label="Mobile navigation" hidden={!open} data-lenis-prevent>
        <span className={styles.mobileNavLabel}>Explore HANAYIN</span>
        {navigationLinks.map((link) => <a key={link.href} href={link.href} onClick={() => flushSync(() => setOpen(false))}>{link.label}<ArrowUpRight size={16} aria-hidden="true" /></a>)}
        <Link href="/login" onClick={() => setOpen(false)}>Log in<ArrowUpRight size={16} aria-hidden="true" /></Link>
      </nav>
    </header>
  );
}
