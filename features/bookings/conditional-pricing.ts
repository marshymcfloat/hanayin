import { matchesServiceRule, type ConditionalSale, type RuleService } from "@/features/catalog/offer-definitions";
import { allocateCents, discountCents } from "@/features/bookings/pricing-arithmetic";

export type PricedUnit = RuleService & { key: string; packageId?: number; originalCents: number; finalCents: number; offerId: number | null; reason: string | null };
export type ConditionalOffer = { id: number; title: string; discount_type: string; discount_value: number; rule: ConditionalSale };
export function chooseConditionalPrice(units: PricedUnit[], offers: ConditionalOffer[], voucherDiscount: number) {
  let best = { units, total: units.reduce((sum, line) => sum + line.finalCents, 0) - voucherDiscount, conditionalId: null as number | null, useVoucher: true };
  const standalone = units.map((unit, index) => ({ unit, index })).filter(({ unit }) => unit.packageId === undefined);
  for (const offer of [...offers].sort((a, b) => a.id - b.id)) {
    for (const first of standalone) for (const second of standalone) {
      if (first.index === second.index || !matchesServiceRule(offer.rule.groups[0], first.unit) || !matchesServiceRule(offer.rule.groups[1], second.unit)) continue;
      const participants = [first, second];
      const targets = offer.rule.target === "BOTH" ? participants : [offer.rule.target === "FIRST" ? first : second];
      const discount = discountCents(targets.reduce((sum, { unit }) => sum + unit.originalCents, 0), offer.discount_type, offer.discount_value);
      if (!discount) continue;
      const allocations = allocateCents(discount, targets.map(({ unit }) => unit.originalCents));
      const candidate = units.map((line, index) => {
        if (!participants.some(participant => participant.index === index)) return line;
        const targetIndex = targets.findIndex(participant => participant.index === index);
        const reduction = targetIndex < 0 ? 0 : allocations[targetIndex];
        return { ...line, finalCents: line.originalCents - reduction, offerId: reduction ? offer.id : null, reason: reduction ? offer.title : null };
      });
      const total = candidate.reduce((sum, line) => sum + line.finalCents, 0);
      if (total < best.total || total === best.total && best.useVoucher && voucherDiscount > 0) best = { units: candidate, total, conditionalId: offer.id, useVoucher: false };
    }
  }
  return best;
}
