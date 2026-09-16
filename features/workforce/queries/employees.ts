import { requireTenantAccess } from "@/lib/auth/guards";
import { Role } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

export async function getEmployeesWorkspaceData(businessSlug: string) {
  const auth = await requireTenantAccess(businessSlug);
  if (!auth.success) return auth;
  if (auth.session.user.role !== Role.OWNER) {
    return { success: false as const, error: "Forbidden" };
  }
  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: { id: true },
  });
  if (!business) return { success: false as const, error: "Not found" };
  const attendanceCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [employees, serviceCategories] = await Promise.all([
    prisma.employee.findMany({
      where: { business_id: business.id },
      include: {
        user: true,
        attendance: { where: { date: { gte: attendanceCutoff } }, orderBy: { date: "desc" }, take: 7 },
        payslips: { orderBy: { ending_date: "desc" }, take: 1 },
        _count: { select: { served_services: true } },
      },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.service.findMany({
      where: { business_id: business.id },
      select: { category: true },
      distinct: ["category"],
    }),
  ]);
  const categories = serviceCategories.map(({ category }) => category)
    .filter((category) => category.toLowerCase() !== "general")
    .sort((a, b) => a.localeCompare(b));
  return { success: true as const, employees, categories };
}
