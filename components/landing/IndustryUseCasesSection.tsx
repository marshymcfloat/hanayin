"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Scissors, Sparkles, Flower2, Stethoscope, Check } from "lucide-react";

export default function IndustryUseCasesSection() {
  const industries = [
    {
      id: "salon",
      label: "Salon Owners",
      icon: Scissors,
      features: [
        "Package bookings",
        "Add-on services (e.g., wash + blowdry)",
        "Color + treatment combos",
        "Stylist performance tracking",
      ],
      description:
        "Manage complex appointments and stylist commissions with ease.",
    },
    {
      id: "barbershop",
      label: "Barbershops",
      icon: Sparkles,
      features: [
        "Walk-in + Appointment management",
        "Loyalty client tracking",
        "Fast rebooking workflow",
        "Queue management",
      ],
      description: "Keep your chairs full and your barbers happy.",
    },
    {
      id: "spa",
      label: "Spas",
      icon: Flower2,
      features: [
        "Therapist scheduling",
        "Multi-session packages",
        "Room management",
        "Resource allocation",
      ],
      description: "Create a relaxing experience from booking to payment.",
    },
    {
      id: "clinic",
      label: "Clinics",
      icon: Stethoscope,
      features: [
        "Treatment records (EMR)",
        "Follow-up reminders",
        "Patient scheduling",
        "Consent forms",
      ],
      description: "Professional tools for aesthetic and wellness clinics.",
    },
  ];

  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">
            Built for <span className="text-green-600">Beauty & Wellness</span>{" "}
            Businesses
          </h2>
          <p className="text-xl text-muted-foreground">
            Tailored features for your specific industry needs.
          </p>
        </div>

        <Tabs defaultValue="salon" className="max-w-4xl mx-auto">
          <TabsList className="flex flex-wrap justify-center gap-4 w-full h-auto bg-transparent p-0 mb-12">
            {industries.map((industry) => (
              <TabsTrigger
                key={industry.id}
                value={industry.id}
                className="rounded-full px-6 py-3 border border-border/50 bg-background hover:bg-muted/50 data-[state=active]:bg-green-600 data-[state=active]:text-white data-[state=active]:border-green-600 data-[state=active]:shadow-lg data-[state=active]:shadow-green-200/50 transition-all text-base h-auto"
              >
                <industry.icon className="size-4 mr-2" />
                {industry.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {industries.map((industry) => (
            <TabsContent
              key={industry.id}
              value={industry.id}
              className="animate-in fade-in slide-in-from-bottom-4 duration-500"
            >
              <div className="bg-stone-50 dark:bg-stone-900/20 border border-border/50 rounded-3xl p-8 md:p-12">
                <div className="flex flex-col md:flex-row gap-8 items-center">
                  <div className="flex-1 space-y-6 text-center md:text-left">
                    <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-green-100 text-green-700 mb-2">
                      <industry.icon className="size-8" />
                    </div>
                    <h3 className="text-2xl font-bold">{industry.label}</h3>
                    <p className="text-lg text-muted-foreground">
                      {industry.description}
                    </p>
                    <ul className="grid sm:grid-cols-2 gap-3 pt-4">
                      {industry.features.map((feature, idx) => (
                        <li key={idx} className="flex items-center gap-2">
                          <Check className="size-5 text-green-600 shrink-0" />
                          <span className="font-medium">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {/* Placeholder for an image or graphic specific to the industry */}
                  <div className="flex-1 w-full aspect-video bg-linear-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center text-muted-foreground text-sm font-mono border border-dashed border-gray-300">
                    {industry.label} Dashboard Preview
                  </div>
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}
