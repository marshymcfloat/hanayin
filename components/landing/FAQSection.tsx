"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { motion } from "motion/react";

const faqs = [
  {
    question: "Do I need technical skills to use ServiceFlow?",
    answer:
      "No. We designed it to feel like the apps you already use on your phone. We also help you set everything up during onboarding — at no extra cost.",
  },
  {
    question: "Can I use it on my phone?",
    answer:
      "Yes. ServiceFlow is mobile-first and works on any smartphone, tablet, or laptop browser. No app install required.",
  },
  {
    question: "Can I migrate my old data?",
    answer:
      "Yes. Send us your client list and service menu — even from a spreadsheet or notebook — and our team will import it for you before launch.",
  },
  {
    question: "Is customer support based in the Philippines?",
    answer:
      "Yes. Our support team is local, available via chat and email, and answers in Filipino or English.",
  },
  {
    question: "Is there a long-term contract?",
    answer:
      "No. Pay monthly. Cancel anytime. We'd rather you stay because the product earns its keep.",
  },
  {
    question: "What happens after my 14-day trial?",
    answer:
      "If you choose to continue, you'll be billed for the plan you select — Starter, Plus, or Pro. If not, your data stays available for 30 days in case you change your mind.",
  },
];

export default function FAQSection() {
  return (
    <section className="relative overflow-hidden py-20 sm:py-28 lg:py-32 bg-zinc-50/60">

      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-center"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
            Frequently asked
          </p>
          <h2 className="mt-4 text-balance text-3xl font-semibold leading-[1.1] tracking-[-0.02em] text-foreground sm:text-4xl lg:text-5xl">
            Questions, answered.
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{
            duration: 0.6,
            ease: [0.16, 1, 0.3, 1],
            delay: 0.1,
          }}
          className="mt-12 sm:mt-16"
        >
          <Accordion
            type="single"
            collapsible
            className="border-t border-black/[0.06]"
          >
            {faqs.map((faq, i) => (
              <AccordionItem
                key={i}
                value={`item-${i}`}
                className="border-b border-black/[0.06]"
              >
                <AccordionTrigger className="cursor-pointer py-5 text-left text-base font-medium tracking-[-0.005em] text-foreground hover:no-underline sm:py-6 sm:text-lg [&>svg]:text-muted-foreground/60">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="pb-5 text-sm leading-relaxed text-muted-foreground sm:pb-6 sm:text-base">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
}
