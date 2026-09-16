import { getServerSession } from "next-auth";
import { authOptions } from "@/features/auth/auth-options";
import { getCachedBusinessBySlug, getCachedServices } from "@/lib/data/cached";
import { prisma } from "@/prisma/prisma";

export async function getInternalBookingFormData(businessSlug: string) {
  const business = await getCachedBusinessBySlug(businessSlug);
  if (!business) return null;
  const session = await getServerSession(authOptions);
  let isStaff = false;
  let currentEmployeeId: number | undefined;
  if (session?.user?.id) {
    const employee = await prisma.employee.findFirst({ where: { user_id: session.user.id, business_id: business.id }, select: { id: true } });
    if (employee) { isStaff = true; currentEmployeeId = employee.id; }
    else isStaff = Boolean(await prisma.owner.findFirst({ where: { user_id: session.user.id, business_id: business.id }, select: { id: true } }));
  }
  const services = await getCachedServices(business.id);
  return { business, services, categories: [...new Set(services.map((service) => service.category))], isStaff, currentEmployeeId };
}
