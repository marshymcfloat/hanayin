"use server";

// Feature-owned Server Action boundary.

import { prisma } from "@/prisma/prisma";

export type PendingFlow = {
  triggerServiceId: number;
  triggerServiceName: string;
  suggestedServiceId: number;
  suggestedServiceName: string;
  suggestedServicePrice: number;
  suggestedServiceDuration: number | null;
  suggestedServiceIdString: string;
  dueDate: Date;
  flowType: "REQUIRED" | "SUGGESTED";
  delayDuration: number;
  delayUnit: "DAYS" | "WEEKS" | "MONTHS";
  lastServiceDate: Date;
};

export async function getCustomerPendingFlows(
  customerId: string,
): Promise<PendingFlow[]> {
  if (!customerId) return [];

  try {
    const lastAvailedServices = await prisma.availedService.findMany({
      where: {
        booking: {
          customer_id: customerId,
          status: { not: "CANCELLED" },
        },
      },
      orderBy: {
        created_at: "desc",
      },
      take: 5,
      include: {
        service: {
          include: {
            flow_triggers: {
              include: {
                suggested_service: true,
              },
            },
          },
        },
      },
    });

    const pendingFlows: PendingFlow[] = [];

    for (const availed of lastAvailedServices) {
      if (
        !availed.service.flow_triggers ||
        availed.service.flow_triggers.length === 0
      ) {
        continue;
      }

      for (const flow of availed.service.flow_triggers) {
        const lastDate = availed.served_at || availed.created_at;
        const dueDate = new Date(lastDate);

        if (flow.delay_unit === "DAYS") {
          dueDate.setDate(dueDate.getDate() + flow.delay_duration);
        } else if (flow.delay_unit === "WEEKS") {
          dueDate.setDate(dueDate.getDate() + flow.delay_duration * 7);
        } else if (flow.delay_unit === "MONTHS") {
          dueDate.setMonth(dueDate.getMonth() + flow.delay_duration);
        }

        const alreadyBooked = await prisma.availedService.findFirst({
          where: {
            booking: {
              customer_id: customerId,
              status: { not: "CANCELLED" },
            },
            service_id: flow.suggested_service_id,
            created_at: {
              gte: lastDate,
            },
          },
        });

        if (!alreadyBooked) {
          pendingFlows.push({
            triggerServiceId: flow.trigger_service_id,
            triggerServiceName: availed.service.name,
            suggestedServiceId: flow.suggested_service_id,
            suggestedServiceName: flow.suggested_service.name,
            suggestedServicePrice: flow.suggested_service.price,
            suggestedServiceDuration: flow.suggested_service.duration,
            suggestedServiceIdString: flow.suggested_service_id.toString(),
            dueDate: dueDate,
            flowType: flow.type,
            delayDuration: flow.delay_duration,
            delayUnit: flow.delay_unit,
            lastServiceDate: lastDate,
          });
        }
      }
    }

    // Return unique suggestions (in case multiple past services trigger the same next step, take the latest one)
    // For now, simpler is better: return all unique by suggestedServiceId
    const uniqueFlows = pendingFlows.filter(
      (flow, index, self) =>
        index ===
        self.findIndex((t) => t.suggestedServiceId === flow.suggestedServiceId),
    );

    return uniqueFlows;
  } catch (error) {
    console.error("Failed to fetch pending flows:", error);
    return [];
  }
}
