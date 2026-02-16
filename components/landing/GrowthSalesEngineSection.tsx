"use client";

import { TrendingUp, Gift, Mail, Zap, BarChart3 } from "lucide-react";

export default function GrowthSalesEngineSection() {
  const features = [
    {
      title: "Automatic promo campaigns",
      icon: Zap,
      color: "text-amber-500",
      bg: "bg-amber-100",
    },
    {
      title: "Birthday discounts",
      icon: Gift,
      color: "text-pink-500",
      bg: "bg-pink-100",
    },
    {
      title: "Rebooking reminders",
      icon: Mail,
      color: "text-blue-500",
      bg: "bg-blue-100",
    },
    {
      title: "Flash sales",
      icon: TrendingUp,
      color: "text-red-500",
      bg: "bg-red-100",
    },
    {
      title: "Best-selling service reports",
      icon: BarChart3,
      color: "text-purple-500",
      bg: "bg-purple-100",
    },
  ];

  return (
    <section className="py-24 bg-stone-900 text-stone-50 overflow-hidden relative">
      {/* Smooth Transition Top */}
      <div className="absolute top-0 left-0 right-0 h-32 bg-linear-to-b from-background to-transparent z-10 pointer-events-none" />

      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-20 pointer-events-none">
        <div className="absolute -top-[20%] -right-[10%] w-[600px] h-[600px] rounded-full bg-green-500/30 blur-[100px]" />
        <div className="absolute top-[40%] -left-[10%] w-[500px] h-[500px] rounded-full bg-emerald-500/20 blur-[100px]" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight leading-tight">
              Turn Empty Slots <br />
              Into{" "}
              <span className="text-transparent bg-clip-text bg-linear-to-r from-green-400 to-emerald-300">
                Revenue
              </span>
            </h2>
            <p className="text-xl text-stone-300 leading-relaxed max-w-lg">
              ServiceFlow doesn’t just manage your business. <br />
              <strong className="text-white">It grows it.</strong>
            </p>

            <div className="space-y-4 pt-4">
              {features.map((feature, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-green-500/30 transition-all backdrop-blur-sm"
                >
                  <div
                    className={`size-10 rounded-full ${feature.bg} flex items-center justify-center shrink-0`}
                  >
                    <feature.icon className={`size-5 ${feature.color}`} />
                  </div>
                  <span className="font-medium text-lg">{feature.title}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            {/* Abstract visual representation of growth */}
            <div className="relative aspect-square md:aspect-4/3 rounded-3xl bg-linear-to-br from-stone-800 to-stone-900 border border-stone-700/50 shadow-2xl p-8 flex flex-col justify-between overflow-hidden">
              <div className="absolute top-0 right-0 p-8 w-2/3 opacity-30">
                <TrendingUp className="w-full h-full text-green-500" />
              </div>

              <div className="relative z-10 bg-stone-800/80 backdrop-blur-md p-6 rounded-2xl border border-stone-700/50 max-w-sm mb-6 shadow-xl animate-in fade-in slide-in-from-right-8 duration-700 delay-300">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-stone-400">Total Revenue</span>
                  <span className="text-xs text-green-400 font-mono">+28%</span>
                </div>
                <div className="text-3xl font-bold text-white mb-4">
                  ₱124,500
                </div>
                <div className="h-2 bg-stone-700 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 w-[78%]" />
                </div>
              </div>

              <div className="relative z-10 bg-stone-800/80 backdrop-blur-md p-6 rounded-2xl border border-stone-700/50 max-w-sm ml-auto shadow-xl animate-in fade-in slide-in-from-left-8 duration-700 delay-500">
                <div className="flex gap-3 items-center mb-3">
                  <div className="size-8 rounded-full bg-pink-500/20 flex items-center justify-center">
                    <Gift className="size-4 text-pink-500" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">
                      Birthday Campaign
                    </div>
                    <div className="text-xs text-stone-400">
                      Sent to 45 clients
                    </div>
                  </div>
                </div>
                <div className="flex justify-between items-end">
                  <div className="text-xs text-stone-400">Converted</div>
                  <div className="text-xl font-bold text-white">
                    12 Bookings
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Smooth Transition Bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-linear-to-t from-background to-transparent z-10 pointer-events-none" />
    </section>
  );
}
