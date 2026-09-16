import { prisma } from "@/prisma/prisma";

export async function getApplicationStatus(applicationId: string) {
  return prisma.onboardingApplication.findUnique({ where: { id: applicationId }, select: { id: true, business_name: true, owner_name: true, owner_email: true, status: true, review_notes: true, requested_structure: true, requested_allow_employee_self_booking: true, requested_manager_can_serve: true, created_at: true, reviewed_at: true, converted_business: { select: { name: true, slug: true, owners: { take: 1, select: { user_id: true } } } } } });
}
