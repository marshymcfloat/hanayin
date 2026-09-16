import { prisma } from "@/prisma/prisma";

export type BusinessLocation = {
  businessSlug: string;
  latitude: number;
  longitude: number;
};

export async function setBusinessLocation(input: BusinessLocation) {
  await prisma.business.update({
    where: { slug: input.businessSlug },
    data: {
      latitude: input.latitude,
      longitude: input.longitude,
    },
  });
}
