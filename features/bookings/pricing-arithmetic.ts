export const moneyCents = (value: number) => {
  if (!Number.isFinite(value) || value < 0 || value > 2147483647) throw new Error("Invalid price.");
  return Math.round((value + Number.EPSILON) * 100);
};
export const fromCents = (value: number) => value / 100;

/** Largest-remainder allocation; input order breaks ties. */
export function allocateCents(total: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0 || weights.some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error("Invalid allocation.");
  if (!weights.length) { if (total) throw new Error("Cannot allocate an empty amount."); return []; }
  const sum = weights.reduce((a, b) => a + BigInt(b), BigInt(0));
  const denominator = sum || BigInt(weights.length);
  const values = weights.map((weight, index) => {
    const product = BigInt(total) * (sum ? BigInt(weight) : BigInt(1));
    return { index, value: Number(product / denominator), remainder: product % denominator };
  });
  let remaining = total - values.reduce((a, b) => a + b.value, 0);
  for (const value of [...values].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)) {
    if (!remaining) break;
    value.value++; remaining--;
  }
  return values.map(value => value.value);
}
export function discountCents(base: number, type: string, value: number) {
  if (!Number.isFinite(value) || value < 0) throw new Error("Invalid discount.");
  return Math.min(base, type === "PERCENTAGE" ? Math.round(base * Math.min(100, value) / 100) : Math.round(Math.min(base / 100, value) * 100));
}
