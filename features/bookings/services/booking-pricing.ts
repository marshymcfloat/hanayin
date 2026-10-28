import { createHash } from "node:crypto";
import { calculateBookingTotal } from "@/lib/utils/pricing";
import { normalizeVoucherCode } from "@/lib/utils/voucher-code";
import { Prisma, PrismaClient } from "@/prisma/generated/prisma/client";
import { readPackageChoices, readConditionalSale, matchesServiceRule } from "@/features/catalog/offer-definitions";
import { allocateCents, moneyCents, fromCents, discountCents } from "@/features/bookings/pricing-arithmetic";
import { chooseConditionalPrice } from "@/features/bookings/conditional-pricing";

type PricingDbClient = PrismaClient | Prisma.TransactionClient;
export type BookingServiceInput = { id: number; quantity: number; duration?: number; claimedByCurrentEmployee?: boolean; packageId?: number; packageInstanceId?: string; packageChoiceId?: string; selectionKey?: string };
export type CanonicalBookingService = BookingServiceInput & { name: string; duration: number; price: number; originalPrice: number; estimatedCost: number; discount: number; discountReason: string | null; saleEventId: number | null; commissionBase: number };
export type BookingPricingSnapshot = {
  business: { id: string; slug: string; name: string; commission_calculation_basis: "ORIGINAL_PRICE" | "DISCOUNTED_PRICE"; gcash_account_name?: string | null; gcash_mobile_number?: string | null };
  services: CanonicalBookingService[]; subtotal: number; voucherDiscount: number; grandTotal: number; appliedSaleEventId: number | null;
  downpaymentAmount: number | null; amountToPay: number; totalDuration: number; estimatedEnd: Date; voucher: { id: number; code: string } | null;
  appliedOffers: { id: number; title: string; revision: number; conditional: boolean; selections: string[] }[];
  packageSnapshots: { instanceId: string; packageId: number; name: string; revision: number; choices: unknown; selections: { serviceId: number; choiceId?: string; key: string }[] }[];
  quoteFingerprint: string; voucherOutcome: "NONE" | "APPLIED" | "BETTER_OFFER";
};

export async function buildBookingPricingSnapshot({ db, businessSlug, scheduledAt, services, paymentMethod, paymentType, voucherCode, existingBookingId }: {
  db: PricingDbClient; businessSlug: string; scheduledAt: Date; services: BookingServiceInput[]; paymentMethod: "CASH" | "ONLINE"; paymentType: "FULL" | "DOWNPAYMENT"; voucherCode?: string; existingBookingId?: number;
}): Promise<BookingPricingSnapshot> {
  const business = await db.business.findUnique({ where: { slug: businessSlug }, select: { id: true, slug: true, name: true, commission_calculation_basis: true, downpayment_percentage: true, gcash_account_name: true, gcash_mobile_number: true } });
  if (!business) throw new Error("Business not found");
  if (!services.length || services.length > 100 || services.some(service => !Number.isInteger(service.quantity) || service.quantity < 1 || service.quantity > 100) || services.reduce((sum, service) => sum + service.quantity, 0) > 100) throw new Error("Choose between 1 and 100 service units.");
  const now = new Date();
  const activeBooking = { id: { not: existingBookingId ?? -1 }, status: { not: "CANCELLED" as const }, OR: [{ status: { not: "HOLD" as const } }, { hold_expires_at: null }, { hold_expires_at: { gt: now } }] };
  const serviceIds = [...new Set(services.map(service => service.id))];
  const packageIds = [...new Set(services.flatMap(service => service.packageId === undefined ? [] : [service.packageId]))];
  const [catalog, packages, packageItems, events] = await Promise.all([
    db.service.findMany({ where: { business_id: business.id, id: { in: serviceIds } }, select: { id: true, name: true, category: true, price: true, estimated_cost: true, duration: true } }),
    packageIds.length ? db.servicePackage.findMany({ where: { business_id: business.id, id: { in: packageIds } }, select: { id: true, name: true, revision: true, choices: true, price: true } }) : Promise.resolve([]),
    packageIds.length ? db.packageItem.findMany({ where: { package_id: { in: packageIds }, package: { business_id: business.id } }, select: { package_id: true, service_id: true, custom_price: true } }) : Promise.resolve([]),
    db.saleEvent.findMany({
      where: { business_id: business.id, start_date: { lte: now }, end_date: { gte: now } },
      select: {
        id: true, title: true, revision: true, conditional_rule: true, discount_type: true, discount_value: true, slot_limit: true,
        applicable_services: { select: { id: true } }, applicable_packages: { select: { id: true } },
        _count: { select: {
          bookings: { where: { ...activeBooking, offer_applications: { none: {} } } },
          applications: { where: { booking: activeBooking } },
        } },
      },
    }),
  ]);
  if (catalog.length !== serviceIds.length || packages.length !== packageIds.length) throw new Error("One or more selected services or packages are invalid");
  const activeEvents = events.filter(event => event.slot_limit == null || (event._count?.bookings ?? 0) + (event._count?.applications ?? 0) < event.slot_limit);
  const ordinary = activeEvents.filter(event => !event.conditional_rule);
  const byService = new Map(catalog.map(service => [service.id, service]));
  const byPackage = new Map(packages.map(pkg => [pkg.id, pkg]));
  const units = services.flatMap((service, inputIndex) => Array.from({ length: service.quantity }, (_, unitIndex) => ({ ...service, quantity: 1, selectionKey: service.selectionKey ? `${service.selectionKey}:${unitIndex}` : `line-${inputIndex}-${unitIndex}`, packageInstanceId: service.packageId === undefined ? undefined : service.packageInstanceId ?? `legacy-${service.packageId}-${unitIndex}` })));
  if (new Set(units.map(unit => unit.selectionKey)).size !== units.length) throw new Error("Duplicate service selections.");
  const packageSnapshots: BookingPricingSnapshot["packageSnapshots"] = [];
  const allocated = new Map<string, number>();
  for (const instanceId of [...new Set(units.flatMap(unit => unit.packageInstanceId ? [unit.packageInstanceId] : []))]) {
    const members = units.filter(unit => unit.packageInstanceId === instanceId);
    const pkg = byPackage.get(members[0].packageId!);
    if (!pkg || members.some(unit => unit.packageId !== pkg.id)) throw new Error("Invalid package instance.");
    const choices = readPackageChoices(pkg.choices);
    const fixed = members.filter(unit => !unit.packageChoiceId);
    const items = packageItems.filter(item => item.package_id === pkg.id);
    if (fixed.length !== items.length || items.some(item => fixed.filter(unit => unit.id === item.service_id).length !== 1)) throw new Error("Include every fixed service in the package.");
    if (members.length !== items.length + choices.length || choices.some(choice => {
      const selected = members.filter(unit => unit.packageChoiceId === choice.id);
      return selected.length !== 1 || !matchesServiceRule(choice.rule, byService.get(selected[0].id)!);
    }) || members.some(unit => unit.packageChoiceId && !choices.some(choice => choice.id === unit.packageChoiceId))) throw new Error("Complete every package choice using an eligible service.");
    if (choices.length && members.some(unit => !services.some(source => source.packageInstanceId === instanceId && source.quantity === 1 && source.id === unit.id && source.packageChoiceId === unit.packageChoiceId))) throw new Error("Package choices need separate instance selections.");
    const prices = choices.length ? allocateCents(moneyCents(pkg.price), members.map(unit => moneyCents(byService.get(unit.id)!.price))) : members.map(unit => moneyCents(items.find(item => item.service_id === unit.id)!.custom_price));
    members.forEach((unit, index) => allocated.set(unit.selectionKey, prices[index]));
    packageSnapshots.push({ instanceId, packageId: pkg.id, name: pkg.name, revision: pkg.revision ?? 0, choices, selections: members.map(unit => ({ serviceId: unit.id, choiceId: unit.packageChoiceId, key: unit.selectionKey })) });
  }
  const bestDiscount = (base: number, applicable: typeof ordinary) => [...applicable].map(event => ({ event, discount: discountCents(base, event.discount_type, event.discount_value) })).sort((a, b) => b.discount - a.discount || a.event.id - b.event.id)[0];
  const packageDiscounts = new Map<string, { offerId: number | null; reason: string | null; reductions: Map<string, number> }>();
  for (const snapshot of packageSnapshots) {
    const pkg = byPackage.get(snapshot.packageId)!;
    const members = units.filter(unit => unit.packageInstanceId === snapshot.instanceId);
    const best = bestDiscount(moneyCents(pkg.price), ordinary.filter(event => event.applicable_packages.some(item => item.id === pkg.id)));
    const base = members.map(unit => allocated.get(unit.selectionKey)!);
    const reduction = best ? allocateCents(Math.min(base.reduce((a, b) => a + b, 0), best.discount), base) : base.map(() => 0);
    packageDiscounts.set(snapshot.instanceId, { offerId: best?.discount ? best.event.id : null, reason: best?.discount ? best.event.title : null, reductions: new Map(members.map((unit, index) => [unit.selectionKey, reduction[index]])) });
  }
  const baseline = units.map(unit => {
    const service = byService.get(unit.id)!;
    const originalCents = unit.packageId === undefined ? moneyCents(service.price) : allocated.get(unit.selectionKey)!;
    const best = unit.packageId === undefined ? bestDiscount(originalCents, ordinary.filter(event => event.applicable_services.some(item => item.id === unit.id))) : undefined;
    const packageDiscount = unit.packageInstanceId ? packageDiscounts.get(unit.packageInstanceId) : undefined;
    const reduction = packageDiscount?.reductions.get(unit.selectionKey) ?? best?.discount ?? 0;
    return { id: service.id, category: service.category, price: service.price, key: unit.selectionKey, packageId: unit.packageId, originalCents, finalCents: originalCents - reduction, offerId: packageDiscount?.offerId ?? (best?.discount ? best.event.id : null), reason: packageDiscount?.reason ?? (best?.discount ? best.event.title : null) };
  });
  const ordinarySubtotal = baseline.reduce((sum, line) => sum + line.finalCents, 0);
  let voucher: BookingPricingSnapshot["voucher"] = null;
  let voucherDiscountCents = 0;
  if (voucherCode) {
    const record = await db.voucher.findUnique({ where: { code: normalizeVoucherCode(voucherCode) }, include: { business: { select: { slug: true } } } });
    const alreadyReserved = record?.used_by_id != null && record.used_by_id === existingBookingId;
    if (!record || record.business.slug !== businessSlug || !alreadyReserved && (!record.is_active || record.used_by_id || now > record.expires_at)) throw new Error("Invalid or expired voucher code");
    if (ordinarySubtotal < moneyCents(record.minimum_amount)) throw new Error(`Minimum spend of ${record.minimum_amount} required to use this voucher`);
    voucherDiscountCents = discountCents(ordinarySubtotal, record.type, record.value);
    voucher = { id: record.id, code: record.code };
  }
  const winner = chooseConditionalPrice(baseline, activeEvents.flatMap(event => { const rule = readConditionalSale(event.conditional_rule); return rule ? [{ ...event, rule }] : []; }), voucherDiscountCents);
  const voucherOutcome = voucher ? winner.useVoucher ? "APPLIED" : "BETTER_OFFER" : "NONE";
  if (!winner.useVoucher) { voucher = null; voucherDiscountCents = 0; }
  const canonical = winner.units.map((line, index): CanonicalBookingService => {
    const unit = units[index]; const service = byService.get(unit.id)!;
    return { ...unit, name: service.name, duration: service.duration || 30, price: fromCents(line.finalCents), originalPrice: fromCents(line.originalCents), estimatedCost: fromCents(moneyCents(service.estimated_cost ?? 0)), discount: fromCents(line.originalCents - line.finalCents), discountReason: line.reason, saleEventId: line.offerId, commissionBase: fromCents(business.commission_calculation_basis === "ORIGINAL_PRICE" ? line.originalCents : line.finalCents) };
  });
  const appliedIds = [...new Set([...canonical.flatMap(line => line.saleEventId == null ? [] : [line.saleEventId]), ...(winner.conditionalId == null ? [] : [winner.conditionalId])])].sort((a, b) => a - b);
  const appliedOffers = appliedIds.map(id => { const event = activeEvents.find(event => event.id === id)!; return { id, title: event.title, revision: event.revision ?? 0, conditional: Boolean(event.conditional_rule), selections: canonical.filter(line => line.saleEventId === id).map(line => line.selectionKey!) }; });
  const subtotal = fromCents(winner.units.reduce((sum, line) => sum + line.finalCents, 0));
  const voucherDiscount = fromCents(voucherDiscountCents);
  const grandTotal = fromCents(winner.total);
  const dpPercent = Math.max(1, Math.min(100, business.downpayment_percentage ?? 50));
  const downpaymentAmount = paymentType === "DOWNPAYMENT" ? fromCents(Math.round(winner.total * dpPercent / 100)) : null;
  const totalDuration = canonical.reduce((sum, line) => sum + line.duration, 0);
  const quotedServices = canonical.map(line => ({ id: line.id, name: line.name, key: line.selectionKey, instance: line.packageInstanceId, choice: line.packageChoiceId, package: line.packageId, duration: line.duration, original: line.originalPrice, price: line.price, offer: line.saleEventId }));
  const quoteFingerprint = createHash("sha256").update(JSON.stringify({ businessId: business.id, scheduledAt: scheduledAt.toISOString(), services: quotedServices, packages: packageSnapshots, offers: appliedOffers, voucher, voucherOutcome, grandTotal, downpaymentAmount, paymentMethod, paymentType })).digest("hex");
  return { business, services: canonical, subtotal, voucherDiscount, grandTotal, appliedSaleEventId: appliedIds[0] ?? null, downpaymentAmount, amountToPay: calculateBookingTotal({ subtotal, voucherDiscount, paymentMethod, paymentType, downpaymentPercentage: dpPercent }), totalDuration, estimatedEnd: new Date(scheduledAt.getTime() + totalDuration * 60000), voucher, appliedOffers, packageSnapshots, quoteFingerprint, voucherOutcome };
}
