"use client";

import { Star, Quote } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function TestimonialsSection() {
  const testimonials = [
    {
      name: "Maria",
      role: "Salon Owner",
      content:
        "Reduced no-shows by 50%. Clients now book online without calling me in the middle of a treatment.",
      rating: 5,
      image: "/avatars/maria.jpg", // Placeholder
      initials: "M",
    },
    {
      name: "James",
      role: "Barbershop Owner",
      content:
        "Payroll used to take 2 days of stress. Now it takes 30 minutes. My barbers are happier too.",
      rating: 5,
      image: "/avatars/james.jpg", // Placeholder
      initials: "J",
    },
    {
      name: "Anna",
      role: "Spa Owner",
      content:
        "My spa is fully booked every weekend now. The automated reminders are a lifesaver.",
      rating: 5,
      image: "/avatars/anna.jpg", // Placeholder
      initials: "A",
    },
  ];

  return (
    <section className="py-24 bg-background relative overflow-hidden">
      {/* Green Gradient Mesh Background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 0% 0%, rgba(16, 185, 129, 0.03) 0%, rgba(255, 255, 255, 0) 50%), radial-gradient(circle at 100% 100%, rgba(16, 185, 129, 0.05) 0%, rgba(255, 255, 255, 0) 50%)",
        }}
      />

      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">
            Satisfied <span className="text-green-600">Business Owners</span>
          </h2>
          <p className="text-xl text-muted-foreground">
            Don’t just take our word for it. Hear from people like you.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="bg-stone-50/50 backdrop-blur-md dark:bg-stone-900/20 p-8 rounded-3xl border border-border/50 relative hover:shadow-lg hover:shadow-green-900/5 hover:border-green-200/50 transition-all duration-300"
            >
              <div className="absolute top-8 right-8 opacity-10">
                <Quote className="size-12 text-green-600 fill-green-600" />
              </div>

              <div className="flex gap-1 mb-6">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star
                    key={i}
                    className="size-5 text-amber-400 fill-amber-400"
                  />
                ))}
              </div>

              <p className="text-lg leading-relaxed mb-8 relative z-10">
                &ldquo;{testimonial.content}&rdquo;
              </p>

              <div className="flex items-center gap-4">
                <Avatar className="size-12 border-2 border-background">
                  <AvatarImage src={testimonial.image} alt={testimonial.name} />
                  <AvatarFallback className="bg-green-100 text-green-700 font-bold">
                    {testimonial.initials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-bold text-foreground">
                    {testimonial.name}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {testimonial.role}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
