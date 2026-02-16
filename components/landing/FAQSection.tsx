"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "Do I need technical skills?",
    answer:
      "No. ServiceFlow is designed to be super simple. We also help you set everything up during onboarding.",
  },
  {
    question: "Can I use it on my phone?",
    answer:
      "Yes! ServiceFlow is mobile-friendly and works great on any smartphone or tablet.",
  },
  {
    question: "Can I migrate my old data?",
    answer:
      "Yes, our team will help you import your client list and service menu from your old system or spreadsheets.",
  },
  {
    question: "Is customer support available?",
    answer:
      "Absolutely. We provide local support here in the Philippines 🇵🇭 available via chat and email.",
  },
  {
    question: "Is there a long-term contract?",
    answer:
      "No. You can cancel anytime. We believe you should stay because you love the product, not because you're locked in.",
  },
];

export default function FAQSection() {
  return (
    <section className="py-24 bg-stone-50 dark:bg-stone-900/10">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">
            Frequently Asked <span className="text-green-600">Questions</span>
          </h2>
          <p className="text-xl text-muted-foreground">
            Everything you need to know about ServiceFlow.
          </p>
        </div>

        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="text-lg font-medium text-left">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-base leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
