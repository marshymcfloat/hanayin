import { prisma } from "@/prisma/prisma";

import type { PendingFlow } from "@/features/catalog/pending-flow-types";

export async function getTenantCustomerPendingFlows(
  customerId: string,
  businessId: string,
): Promise<PendingFlow[]> {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, business_id: businessId },
      select: { id: true },
    });
    if (!customer) return [];
    const lastAvailedServices = await prisma.availedService.findMany({
      where: {
        service: { business_id: businessId },
        booking: {
          business_id: businessId,
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
              where: { business_id: businessId, suggested_service: { business_id: businessId } },
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
              business_id: businessId,
              customer_id: customerId,
              status: { not: "CANCELLED" },
            },
            service_id: flow.suggested_service_id,
            service: { business_id: businessId },
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
