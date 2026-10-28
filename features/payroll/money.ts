import { Prisma } from "@/prisma/generated/prisma/browser";
const Decimal = Prisma.Decimal.clone({ precision: 40, rounding: Prisma.Decimal.ROUND_HALF_UP });
type Decimal = InstanceType<typeof Decimal>;

export type DecimalInput = string | number | Decimal;
export const decimal = (value: DecimalInput) => {
  const result = new Decimal(value);
  if (!result.isFinite()) throw new Error("Invalid monetary value");
  return result;
};
export const money = (value: DecimalInput) => decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
export const amount = (value: DecimalInput) => money(value).toFixed(2);
export const sum = (values: DecimalInput[]) => values.reduce<Decimal>((total, value) => total.plus(decimal(value)), decimal(0));
export { Decimal };
export const outstanding = (net: string, paid: string) => amount(decimal(net).minus(paid));
