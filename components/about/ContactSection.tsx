"use client";

import Link from "next/link";
import { ArrowUpRight, Facebook, Mail } from "lucide-react";
import { motion } from "motion/react";

const CHANNELS = [
  {
    label: "Email",
    value: "canoydaniel06@gmail.com",
    href: "mailto:canoydaniel06@gmail.com",
    Icon: Mail,
    external: false,
  },
  {
    label: "Facebook",
    value: "Daniel Canoy",
    href: "https://web.facebook.com/RosesRBlacc",
    Icon: Facebook,
    external: true,
  },
] as const;

export default function ContactSection() {
  return (
    <section
      id="contact"
      className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:py-28"
    >
      <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/50">
            Get in touch
          </p>
          <h2 className="mt-4 text-balance text-3xl font-semibold leading-[1.1] tracking-[-0.02em] text-foreground sm:text-4xl lg:text-[44px]">
            Questions, feedback, or a hello.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-foreground/60">
            The two of us read every message. Email is the fastest path; the
            Facebook page is fine for shorter notes.
          </p>
        </motion.div>

        <motion.ul
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{
            duration: 0.7,
            ease: [0.16, 1, 0.3, 1],
            delay: 0.05,
          }}
          className="space-y-3"
        >
          {CHANNELS.map(({ label, value, href, Icon, external }) => {
            const linkProps = external
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {};
            return (
              <li key={label}>
                <Link
                  href={href}
                  {...linkProps}
                  className="group flex items-center justify-between gap-4 rounded-2xl border border-black/[0.06] bg-background px-5 py-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition hover:border-black/[0.12] hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.1)] sm:px-6 sm:py-6"
                >
                  <span className="flex items-center gap-4">
                    <span
                      aria-hidden
                      className="grid size-10 place-items-center rounded-full bg-foreground/[0.04] text-foreground/70 ring-1 ring-inset ring-black/[0.05] transition group-hover:bg-primary/10 group-hover:text-primary group-hover:ring-primary/20"
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="flex flex-col">
                      <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/50">
                        {label}
                      </span>
                      <span className="text-base font-medium tracking-tight text-foreground">
                        {value}
                      </span>
                    </span>
                  </span>
                  <ArrowUpRight className="size-4 text-foreground/40 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
                </Link>
              </li>
            );
          })}
        </motion.ul>
      </div>
    </section>
  );
}
