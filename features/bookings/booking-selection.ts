type Selection = { id: number; quantity?: number; packageId?: number; packageInstanceId?: string; packageChoiceId?: string; selectionKey?: string };
export function bookingSelectionUnit(service: Selection, index: number, unit: number) {
  return { id: service.id, quantity: 1, packageId: service.packageId, packageInstanceId: service.packageInstanceId, packageChoiceId: service.packageChoiceId, selectionKey: `${service.selectionKey ?? `cart-${index}-${service.id}`}-${unit}` };
}
export function bookingSelections(services: Selection[]) {
  return services.flatMap((service, index) => Array.from({ length: service.quantity || 1 }, (_, unit) => bookingSelectionUnit(service, index, unit)));
}
