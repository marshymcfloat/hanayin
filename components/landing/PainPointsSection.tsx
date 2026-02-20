"use client";

import { X } from "lucide-react";

export default function PainPointsSection() {
  const painPoints = [
    {
      title: "Missed appointments",
      description: "Clients ghosting you because of manual tracking.",
    },
    {
      title: "Clients forget schedules",
      description: "No automated reminders means lost revenue.",
    },
    {
      title: "Manual payroll headaches",
      description: "Hours spent calculating commissions and deductions.",
    },
    {
      title: "Empty slots = lost money",
      description: "No way to fill last-minute cancellations.",
    },
    {
      title: "Too many chats to manage",
      description: "Drowning in Messenger, IG, and Viber inquiries.",
    },
    {
      title: "No clear sales reports",
      description: "Guessing how much your business actually made.",
    },
  ];

  return (
    <section className="py-20 md:py-32 bg-[#FAFAFA]">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            Still Running Your Business on <br className="hidden md:block" />
            <span className="text-destructive relative inline-block">
              Notebook + Messenger + Excel?
              <svg
                viewBox="0 0 200 9"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="absolute -bottom-2.5 left-0 w-full text-destructive/30"
              >
                <path
                  d="M2.00025 6.99997C2.00025 6.99997 101.5 0.999997 197.5 3.49997"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </h2>
          <p className="text-lg text-muted-foreground">
            The old way is costing you time, money, and your sanity.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 max-w-6xl mx-auto">
          {painPoints.map((point, index) => (
            <div
              key={index}
              className="bg-background rounded-2xl p-6 shadow-xs border border-border/50 hover:shadow-md transition-shadow duration-300 flex items-start gap-4"
            >
              <div className="size-10 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-1">
                <X className="size-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1 italic">
                  {point.title}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {point.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <p className="text-xl font-medium text-foreground">
            Your business deserves better tools.
          </p>
        </div>
      </div>
    </section>
  );
}
