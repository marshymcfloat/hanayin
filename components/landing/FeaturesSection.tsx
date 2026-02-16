"use client";

import { BarChart3, Calendar, Users, CheckCircle2, Zap } from "lucide-react";

export default function FeaturesSection() {
  const mainFeature = {
    title: "Smart Scheduling",
    description:
      "Effortless booking management with automated conflict checking. Your clients book 24/7, while you focus on what matters.",
    icon: Calendar,
    points: [
      "Real-time availability sync",
      "Automated email reminders",
      "No-show protection",
      "Walk-in queue management",
    ],
  };

  const secondaryFeatures = [
    {
      title: "Staff Management",
      description:
        "Track attendance, daily tasks, and performance commissions. Keep your team organized.",
      icon: Users,
      color: "blue",
      points: ["Geofenced attendance", "Commission tracking"],
    },
    {
      title: "Business Analytics",
      description:
        "Gain insights into revenue, popular services, and customer retention.",
      icon: BarChart3,
      color: "purple",
      points: ["Revenue reports", "Customer insights"],
    },
  ];

  return (
    <section
      id="features"
      className="py-20 md:py-28 bg-muted/30 border-y border-border/40 relative"
    >
      <div className="absolute inset-0 bg-[linear-gradient(to_right,transparent_0%,transparent_49%,rgba(0,0,0,0.02)_50%,transparent_51%,transparent_100%)] bg-[length:80px_80px] -z-10" />

      <div className="container mx-auto px-4 sm:px-6">
        <div className="text-center sm:text-left max-w-2xl mx-auto sm:mx-0 mb-10 md:mb-16">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 tracking-tight">
            Everything you need to{" "}
            <span className="text-transparent bg-clip-text bg-linear-to-r from-green-600 to-emerald-500">
              run your business
            </span>
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg leading-relaxed">
            Replace spreadsheets and manual logs with intelligent automation
            that works while you sleep.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2 group relative bg-linear-to-br from-green-50 via-emerald-50/50 to-teal-50/30 p-5 sm:p-8 md:p-10 rounded-2xl sm:rounded-3xl border border-green-100/50 hover:border-green-200 transition-all duration-300 hover:shadow-xl hover:shadow-green-100/30 overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-linear-to-bl from-green-200/30 to-transparent rounded-full blur-3xl -z-10 translate-x-1/3 -translate-y-1/3" />

            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
              <div className="size-14 sm:size-16 rounded-xl sm:rounded-2xl bg-linear-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white shadow-lg shadow-green-500/30 shrink-0">
                <mainFeature.icon className="size-6 sm:size-8" />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <div className="flex flex-col sm:flex-row items-center sm:items-center gap-2 mb-2">
                  <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">
                    {mainFeature.title}
                  </h3>
                  <span className="px-2 py-0.5 text-xs font-semibold bg-green-600 text-white rounded-full">
                    CORE
                  </span>
                </div>
                <p className="text-muted-foreground text-sm sm:text-lg leading-relaxed mb-4 sm:mb-6 max-w-lg">
                  {mainFeature.description}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  {mainFeature.points.map((point) => (
                    <div
                      key={point}
                      className="flex items-center text-sm text-foreground/80"
                    >
                      <CheckCircle2 className="size-4 mr-2 text-green-600 shrink-0" />
                      {point}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {secondaryFeatures.map((feature) => {
              const colorStyles = {
                blue: {
                  gradient: "from-blue-500 to-indigo-600",
                  shadow: "shadow-blue-500/30",
                  bg: "from-blue-50 to-indigo-50/50",
                  border: "border-blue-100/50 hover:border-blue-200",
                  check: "text-blue-500",
                },
                purple: {
                  gradient: "from-purple-500 to-violet-600",
                  shadow: "shadow-purple-500/30",
                  bg: "from-purple-50 to-violet-50/50",
                  border: "border-purple-100/50 hover:border-purple-200",
                  check: "text-purple-500",
                },
              }[feature.color]!;

              return (
                <div
                  key={feature.title}
                  className={`group bg-linear-to-br ${colorStyles.bg} p-6 rounded-2xl border ${colorStyles.border} transition-all duration-300 hover:shadow-lg`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`size-12 rounded-xl bg-linear-to-br ${colorStyles.gradient} flex items-center justify-center text-white shadow-lg ${colorStyles.shadow} shrink-0`}
                    >
                      <feature.icon className="size-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold mb-1">
                        {feature.title}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                        {feature.description}
                      </p>
                      <div className="space-y-1.5">
                        {feature.points.map((point) => (
                          <div
                            key={point}
                            className="flex items-center text-xs text-foreground/70"
                          >
                            <CheckCircle2
                              className={`size-3.5 mr-1.5 ${colorStyles.check} shrink-0`}
                            />
                            {point}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-12 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Zap className="size-4 text-yellow-500" />
          <span>
            Choose the plan that fits your stage, then upgrade as you grow.
          </span>
        </div>
      </div>
    </section>
  );
}
