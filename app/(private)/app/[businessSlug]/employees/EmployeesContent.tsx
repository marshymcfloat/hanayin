import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next auth/options";
import { redirect } from "next/navigation";
import { prisma } from "@/prisma/prisma";
import { EmployeesPageClient } from "./EmployeesPageClient";

interface EmployeesContentProps {
  businessSlug: string;
}

export async function EmployeesContent({
  businessSlug,
}: EmployeesContentProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/auth/login");
  }

  if (session.user.role !== "OWNER") {
    redirect(`/app/${businessSlug}`);
  }

  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: { id: true },
  });

  if (!business) {
    redirect("/auth/login");
  }

  const employees = await prisma.employee.findMany({
    where: {
      business_id: business.id,
    },
    include: {
      user: true,
      attendance: {
        orderBy: { date: "desc" },
        take: 7,
      },
      payslips: {
        orderBy: { ending_date: "desc" },
        take: 1,
      },
      _count: {
        select: {
          served_services: true,
        },
      },
    },
    orderBy: {
      user: {
        name: "asc",
      },
    },
  });

  const serviceCategories = await prisma.service.findMany({
    where: {
      business_id: business.id,
    },
    select: {
      category: true,
    },
    distinct: ["category"],
  });

  const categories = serviceCategories
    .map((item) => item.category)
    .filter((category) => category.toLowerCase() !== "general")
    .sort((a, b) => a.localeCompare(b));

  return (
    <EmployeesPageClient
      employees={employees}
      businessSlug={businessSlug}
      categories={categories}
    />
  );
}
