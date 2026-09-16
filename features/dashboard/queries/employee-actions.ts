import { getEndOfDayPH, getStartOfDayPH } from "@/lib/date-utils";
import {
  getEmployeeSpecialtySet,
  hasAnyAllowedCategoryForEmployee,
} from "@/lib/utils/employee-specialties";
import {
  AvailedServiceStatus,
  BookingStatus,
} from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";

export async function getManagerQueueBoard(businessSlug: string) {
  const [services, employees] = await Promise.all([
    prisma.availedService.findMany({
      where: {
        booking: {
          business: { slug: businessSlug },
          status: BookingStatus.ACCEPTED,
        },
        status: {
          in: [
            AvailedServiceStatus.PENDING,
            AvailedServiceStatus.CLAIMED,
            AvailedServiceStatus.SERVING,
          ],
        },
      },
      select: {
        id: true,
        status: true,
        price: true,
        scheduled_at: true,
        package: { select: { name: true } },
        service: { select: { name: true, category: true, duration: true } },
        served_by_id: true,
        booking: {
          select: {
            customer: { select: { name: true } },
            scheduled_at: true,
            created_at: true,
          },
        },
        served_by: { select: { user: { select: { name: true } } } },
      },
      orderBy: [{ scheduled_at: "asc" }, { created_at: "asc" }],
      take: 100,
    }),
    prisma.employee.findMany({
      where: { business: { slug: businessSlug } },
      select: {
        id: true,
        specialties: true,
        user: { select: { name: true } },
      },
      orderBy: { user: { name: "asc" } },
    }),
  ]);
  return { services, employees };
}

export async function getEmployeeTodayBookings(input: {
  businessSlug: string;
  specialties: string[];
}) {
  const startOfToday = getStartOfDayPH();
  const endOfToday = getEndOfDayPH();
  const bookings = await prisma.booking.findMany({
    where: {
      business: { slug: input.businessSlug },
      status: { in: [BookingStatus.ACCEPTED, BookingStatus.COMPLETED] },
      OR: [
        { scheduled_at: { gte: startOfToday, lte: endOfToday } },
        {
          scheduled_at: null,
          created_at: { gte: startOfToday, lte: endOfToday },
        },
      ],
    },
    select: {
      id: true,
      status: true,
      payment_status: true,
      payment_method: true,
      grand_total: true,
      amount_paid: true,
      created_at: true,
      scheduled_at: true,
      customer: { select: { name: true, email: true } },
      availed_services: {
        select: {
          id: true,
          service: { select: { name: true, category: true } },
        },
      },
      payments: {
        where: { status: { in: ["SUCCEEDED", "CANCELED"] } },
        select: {
          id: true,
          status: true,
          payment_method: true,
          amount_principal: true,
          provider_reference: true,
          paid_at: true,
        },
        orderBy: { created_at: "desc" },
      },
    },
    orderBy: [{ scheduled_at: "asc" }, { created_at: "desc" }],
    take: 50,
  });

  const specialtySet = getEmployeeSpecialtySet(input.specialties);
  return bookings.filter((booking) =>
    hasAnyAllowedCategoryForEmployee(
      booking.availed_services.map((item) => item.service.category),
      specialtySet,
    ),
  );
}

export async function getEmployeeServiceWork(input: {
  businessSlug: string;
  employeeId: number;
}) {
  const include = {
    service: true,
    package: true,
    booking: {
      select: {
        customer: true,
        is_anonymous_walk_in: true,
        customer_label: true,
        scheduled_at: true,
        created_at: true,
        downpayment: true,
        downpayment_status: true,
        grand_total: true,
        amount_paid: true,
        payment_status: true,
      },
    },
  } as const;

  const [pending, active, completed] = await Promise.all([
    prisma.availedService.findMany({
      where: {
        status: AvailedServiceStatus.PENDING,
        booking: {
          business: { slug: input.businessSlug },
          status: BookingStatus.ACCEPTED,
        },
      },
      include,
      orderBy: { scheduled_at: "asc" },
    }),
    prisma.availedService.findMany({
      where: {
        served_by_id: input.employeeId,
        status: {
          in: [AvailedServiceStatus.CLAIMED, AvailedServiceStatus.SERVING],
        },
        booking: {
          business: { slug: input.businessSlug },
          status: BookingStatus.ACCEPTED,
        },
      },
      include,
      orderBy: { updated_at: "desc" },
      take: 50,
    }),
    prisma.availedService.findMany({
      where: {
        served_by_id: input.employeeId,
        status: AvailedServiceStatus.COMPLETED,
        booking: { business: { slug: input.businessSlug } },
      },
      include,
      orderBy: { updated_at: "desc" },
      take: 10,
    }),
  ]);
  return { pending, active, completed };
}
