"use client";

import {
  Calendar,
  Bell,
  Users,
  UserCheck,
  TrendingUp,
  Globe,
  BarChart,
  CheckCircle2,
} from "lucide-react";

const features = [
  {
    name: "Online Booking System",
    description: "Accept appointments 24/7 without lifting a finger.",
    icon: Calendar,
  },
  {
    name: "Automated Reminders",
    description: "Reduce no-shows with SMS and email notifications.",
    icon: Bell,
  },
  {
    name: "Staff & Payroll Management",
    description: "Track hours, commissions, and performance effortlessly.",
    icon: Users,
  },
  {
    name: "Client Management (CRM)",
    description: "Keep client history, preferences, and notes in one place.",
    icon: UserCheck,
  },
  {
    name: "Sales & Promo Engine",
    description: "Boost revenue with targeted campaigns and discounts.",
    icon: TrendingUp,
  },
  {
    name: "Free Business Website",
    description: "Get a professional online presence instantly.",
    icon: Globe,
  },
  {
    name: "Reports & Analytics",
    description: "Make data-driven decisions to grow your business.",
    icon: BarChart,
  },
];

export default function SolutionSection() {
  return (
    <section
      className="py-24 bg-background relative overflow-hidden"
      id="features"
    >
      {/* Green Gradient Background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 50% 100%, rgba(16, 185, 129, 0.08) 0%, rgba(255, 255, 255, 0) 50%)",
        }}
      />

      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">
            One Platform. <span className="text-green-600">Total Control.</span>
          </h2>
          <p className="text-xl text-muted-foreground">
            Everything you need to manage your salon, spa, or clinic. Nothing
            you don’t.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {features.map((feature) => (
            <div
              key={feature.name}
              className="group relative p-6 bg-card/50 backdrop-blur-sm rounded-2xl border border-green-100/20 hover:border-green-500/30 hover:shadow-lg hover:shadow-green-500/5 transition-all duration-300 hover:-translate-y-1"
            >
              <div className="size-12 rounded-xl bg-green-50/80 dark:bg-green-900/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 group-hover:bg-green-100 dark:group-hover:bg-green-900/30">
                <feature.icon className="size-6 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2 group-hover:text-green-700 dark:group-hover:text-green-400 transition-colors">
                {feature.name}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {feature.description}
              </p>
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <CheckCircle2 className="size-5 text-green-500/50" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Smooth Transition Mask */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-linear-to-t from-background to-transparent pointer-events-none" />
    </section>
  );
}
