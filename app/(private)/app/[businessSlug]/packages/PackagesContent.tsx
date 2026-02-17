import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next auth/options";
import { redirect } from "next/navigation";
import { prisma } from "@/prisma/prisma";
import { getCachedBusinessBySlug } from "@/lib/data/cached";
import { PackagesPageClient } from "./PackagesPageClient";
import { requireStaffPermission } from "@/lib/auth/staff-access";
import { StaffPermission } from "@/prisma/generated/prisma/enums";

interface PackagesContentProps {
  businessSlug: string;
}

export async function PackagesContent({ businessSlug }: PackagesContentProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/auth/login");
  }

  const access = await requireStaffPermission(
    businessSlug,
    StaffPermission.CATALOG_MANAGE,
  );
  if (!access.success) {
    if (access.error === "Unauthorized") {
      redirect("/auth/login");
    }
    redirect(`/app/${businessSlug}`);
  }

  const business = await getCachedBusinessBySlug(businessSlug);

  if (!business) {
    redirect("/");
  }

  const [packages, services, categories] = await Promise.all([
    prisma.servicePackage.findMany({
      where: { business_id: business.id },
      include: {
        items: {
          include: {
            service: true,
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.service.findMany({
      where: { business_id: business.id },
      orderBy: { name: "asc" },
    }),
    prisma.service
      .groupBy({
        by: ["category"],
        where: { business_id: business.id },
      })
      .then((groups) => groups.map((g) => g.category)),
  ]);

  return (
    <PackagesPageClient
      packages={packages}
      services={services}
      categories={categories}
      businessSlug={businessSlug}
    />
  );
}
