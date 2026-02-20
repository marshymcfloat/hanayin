"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, Share2, Globe, BarChart3, Check } from "lucide-react";
import Image from "next/image";

export default function IndustryUseCasesSection() {
  const systemFeatures = [
    {
      id: "dashboard",
      label: "Owner Dashboard",
      icon: LayoutDashboard,
      features: [
        "Real-time business metrics",
        "Staff performance overview",
        "Quick action shortcuts",
        "Revenue tracking",
      ],
      description: "Get a bird's-eye view of your business operations.",
      image: "/SF_Dashboard.png",
    },
    {
      id: "social",
      label: "Social Posts",
      icon: Share2,
      features: [
        "Automated scheduling",
        "AI-powered content generation",
        "Cross-platform publishing",
        "Engagement analytics",
      ],
      description: "Manage your social media presence seamlessly.",
      image: "/SF_Post.png",
    },
    {
      id: "website",
      label: "Facing Website",
      icon: Globe,
      features: [
        "Customizable themes",
        "Integrated online booking",
        "Mobile-optimized design",
        "SEO ready",
      ],
      description: "Your beautiful, high-converting digital storefront.",
      image: "/SF_Facing.png",
    },
    {
      id: "reports",
      label: "Reports",
      icon: BarChart3,
      features: [
        "Customizable report builder",
        "Export to accounting software",
        "Trend analysis",
        "Inventory insights",
      ],
      description: "Deep dive into your business data with powerful analytics.",
      image: "/SF_Reports.png",
    },
  ];

  return (
    <section className="py-24 bg-[#FAFAFA] relative overflow-hidden">
      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">
            Everything You Need{" "}
            <span className="text-green-600">In One System</span>
          </h2>
          <p className="text-xl text-muted-foreground">
            Powerful tools designed to simplify your business operations.
          </p>
        </div>

        <Tabs defaultValue="dashboard" className="max-w-6xl mx-auto">
          <TabsList className="flex flex-wrap justify-center gap-4 w-full h-auto bg-transparent p-0 mb-12">
            {systemFeatures.map((feature) => (
              <TabsTrigger
                key={feature.id}
                value={feature.id}
                className="rounded-full px-6 py-3 border border-border/50 bg-background hover:bg-muted/50 data-[state=active]:bg-green-600 data-[state=active]:text-white data-[state=active]:border-green-600 data-[state=active]:shadow-lg data-[state=active]:shadow-green-200/50 transition-all text-base h-auto"
              >
                <feature.icon className="size-4 mr-2" />
                {feature.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {systemFeatures.map((feature) => (
            <TabsContent
              key={feature.id}
              value={feature.id}
              className="animate-in fade-in slide-in-from-bottom-4 duration-500"
            >
              <div className="bg-stone-50 dark:bg-stone-900/20 border border-border/50 rounded-3xl p-8 md:p-12 overflow-hidden">
                <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-center">
                  <div className="flex-1 space-y-6 text-center lg:text-left">
                    <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-green-100 text-green-700 mb-2">
                      <feature.icon className="size-8" />
                    </div>
                    <h3 className="text-2xl md:text-3xl font-bold">
                      {feature.label}
                    </h3>
                    <p className="text-lg text-muted-foreground">
                      {feature.description}
                    </p>
                    <ul className="grid sm:grid-cols-2 gap-3 pt-4 text-left">
                      {feature.features.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <Check className="size-5 text-green-600 shrink-0 mt-0.5" />
                          <span className="font-medium">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex-[1.5] w-full group perspective-[2000px]">
                    <div className="relative w-full rounded-2xl overflow-hidden border border-border/40 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.3)] bg-background transition-all duration-700 ease-out group-hover:shadow-[0_40px_80px_-20px_rgba(22,163,74,0.15)] group-hover:-translate-y-2">
                      {/* macOS Header */}
                      <div className="h-10 w-full bg-[#f8f9fa] dark:bg-[#1a1b1e] border-b border-border/40 flex items-center px-4">
                        <div className="flex gap-1.5">
                          <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                          <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                          <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
                        </div>
                      </div>

                      {/* Image Content */}
                      <div className="relative w-full aspect-[16/10] bg-muted/20 overflow-hidden">
                        <Image
                          src={feature.image}
                          alt={`${feature.label} interface preview`}
                          fill
                          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 60vw, 50vw"
                          className="object-cover object-top transition-transform duration-700 ease-out group-hover:scale-[1.02]"
                          priority={feature.id === "dashboard"}
                        />
                      </div>
                    </div>
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
