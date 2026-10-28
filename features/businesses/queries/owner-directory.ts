import { prisma } from "@/prisma/prisma";

export async function getTenantOwnerDirectory(businessId: string) {
  const owners = await prisma.owner.findMany({
    where: { business_id: businessId },
    select: {
      id: true,
      specialties: true,
      user: { select: { name: true, contact_number: true } },
    },
  });
  return owners.map((owner) => ({
    id: owner.id,
    specialties: owner.specialties,
    user: { name: owner.user.name, contact_number: owner.user.contact_number },
  }));
}
