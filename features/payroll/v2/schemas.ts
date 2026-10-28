import { z } from "zod";

export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const day = new Date(value + "T00:00:00Z"); return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value;
}, "Enter a valid date");
export const decimalString = z.string().trim().regex(/^-?\d{1,12}(\.\d{1,6})?$/, "Enter an amount using digits and a decimal point.");
const nonnegative = decimalString.refine(value => Number(value) >= 0);
export const commandEnvelope = z.object({ key: z.string().uuid(), expectedRevision: z.number().int().nonnegative() });
export const prepareRunSchema = commandEnvelope.extend({
  start: dateOnly, end: dateOnly, paymentDate: dateOnly,
  kind: z.enum(["REGULAR", "OFF_CYCLE", "YEAR_END", "FINAL_PAY"]).default("REGULAR"),
  employeeIds: z.array(z.number().int().positive()).min(1).max(500).refine(ids => new Set(ids).size === ids.length),
}).refine(value => value.start <= value.end && value.end <= value.paymentDate, "Period must end on or before payment")
  .refine(value => (Date.parse(value.end) - Date.parse(value.start)) <= 366 * 86400000, "Period is too long");
export const statementCommandSchema = commandEnvelope.extend({ statementId: z.string().uuid() });
export const runCommandSchema = commandEnvelope.extend({ runId: z.string().uuid() });
export const paymentSchema = statementCommandSchema.extend({
  amount: decimalString.refine(value => Number(value) > 0 && /^\d+(\.\d{1,2})?$/.test(value)),
  date: dateOnly, method: z.enum(["CASH", "BANK", "WALLET"]), reference: z.string().trim().min(1).max(200),
  reconciliationId: z.string().uuid().optional(),
});
export const simpleSaveSchema = statementCommandSchema.extend({ payment: paymentSchema.omit({ key: true, expectedRevision: true, statementId: true, reconciliationId: true }).optional() });
export const paymentReconciliationSchema = statementCommandSchema.extend({
  date: dateOnly, amount: decimalString.refine(value => Number(value) > 0),
  expectedHash: z.string().regex(/^[a-f0-9]{64}$/), reason: z.string().trim().min(10).max(1000),
  legacyTaxDelta: decimalString.optional(),
});
export const compensationSchema = commandEnvelope.extend({
  employeeId: z.number().int().positive(), from: dateOnly, to: dateOnly.optional(),
  basis: z.enum(["DAILY", "MONTHLY", "HOURLY"]), rate: nonnegative,
  hours: decimalString.refine(value => Number(value) > 0 && Number(value) <= 8),
  monthlyDivisor: decimalString.refine(value => Number(value) > 0).optional(),
  commissionRate: nonnegative.refine(value => Number(value) <= 100),
  commissionBasis: z.enum(["ORIGINAL_PRICE", "DISCOUNTED_PRICE"]),
}).refine(value => !value.to || value.to >= value.from);
export const eligibilitySchema = z.object({
  sss: z.boolean(), philhealth: z.boolean(), pagibig: z.boolean(), withholding: z.boolean(),
  overtime: z.boolean(), night: z.boolean(), holiday: z.boolean(), thirteenthMonth: z.boolean(),
  minimumWageExempt: z.boolean().default(false), exemptionEvidence: z.string().max(1000).default(""),
}).refine(value => (!value.minimumWageExempt && value.sss && value.philhealth && value.pagibig && value.withholding && value.overtime && value.night && value.holiday && value.thirteenthMonth) || value.exemptionEvidence.trim().length >= 10, "Record verified evidence for any statutory exemption or exclusion.");
export const openingSchema = z.object({
  taxable: nonnegative, taxWithheld: nonnegative, basicEarned: nonnegative, thirteenthPaid: nonnegative,
  benefitsReceived: nonnegative.optional(),
  previousEmployer: z.boolean(), confirmed: z.literal(true),
  year: z.number().int().min(2020).max(2100).optional(),
  monthlyAssessments: z.array(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), gross: nonnegative, sssEmployee: nonnegative, sssEmployer: nonnegative, philhealthEmployee: nonnegative, philhealthEmployer: nonnegative, pagibigEmployee: nonnegative, pagibigEmployer: nonnegative })).default([]),
  taxPeriodContexts: z.array(z.object({ period: z.string().max(20), taxable: nonnegative, withheld: nonnegative })).default([]),
}).refine(value => value.benefitsReceived === undefined || Number(value.benefitsReceived) >= Number(value.thirteenthPaid), "Opening qualified benefits must include recorded thirteenth-month payments");
export const profileSchema = commandEnvelope.extend({
  employeeId: z.number().int().positive(), region: z.string().trim().min(1).max(80),
  wageCategory: z.string().trim().min(1).max(100), monthlyBasic: nonnegative,
  monthlyBasicFrom: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  eligibilityFrom: dateOnly,
  eligibility: eligibilitySchema, opening: openingSchema,
  identifiers: z.object({ tin: z.string().max(30), sss: z.string().max(30), philhealth: z.string().max(30), pagibig: z.string().max(30) }),
}).refine(value => ["tin", "sss", "philhealth", "pagibig"].every(field => {
  const required = field === "tin" ? value.eligibility.withholding : value.eligibility[field as "sss" | "philhealth" | "pagibig"];
  const identifier = value.identifiers[field as keyof typeof value.identifiers].replace(/[-\s]/g, "");
  return !required || (field === "tin" ? /^\d{9}(\d{3})?$/.test(identifier) : field === "sss" ? /^\d{10}$/.test(identifier) : /^\d{12}$/.test(identifier));
}), "Enter valid government identifiers for applicable agencies.");
export const adjustmentSchema = commandEnvelope.extend({
  label: z.string().trim().min(1).max(120).optional(),
  employeeId: z.number().int().positive(), originalStatementId: z.string().uuid().optional(),
  amount: decimalString.refine(value => Number(value) !== 0 && /^-?\d+(\.\d{1,2})?$/.test(value)),
  code: z.enum(["ALLOWANCE", "BONUS", "RECOVERY", "DEDUCTION", "OPENING", "FINAL_PAY", "SERVICE_CHARGE"]),
  reason: z.string().trim().min(5).max(1000), authorization: z.string().trim().min(5).max(1000), effectiveOn: dateOnly,
}).refine(value => !["DEDUCTION", "RECOVERY"].includes(value.code) || Number(value.amount) < 0, "Enter a negative amount for a deduction or recovery.");
export const adjustmentDecisionSchema = commandEnvelope.extend({
  adjustmentId: z.string().uuid(), disposition: z.enum(["APPROVED", "DEFERRED", "WAIVED"]),
  reason: z.string().trim().min(5).max(1000),
  reviewedAmount: decimalString.optional(),
});
export const settingsSchema = commandEnvelope.extend({
  effectiveFrom: dateOnly.optional(), reviewedOpening: z.boolean().optional(),
  cadence: z.enum(["WEEKLY", "SEMIMONTHLY", "CUSTOM"]), payDays: z.array(z.number().int().min(1).max(31)).max(31),
  smsEnabled: z.boolean(), rulePackageId: z.string().min(1).max(120),
  employerIdentifiers: z.object({ tin: z.string().trim().max(30), sss: z.string().trim().max(30), philhealth: z.string().trim().max(30), pagibig: z.string().trim().max(30) }).optional(),
});
export const simpleSettingsSchema = commandEnvelope.extend({
  cadence: z.enum(["WEEKLY", "SEMIMONTHLY", "CUSTOM"]), payDays: z.array(z.number().int().min(1).max(31)).max(31),
  smsEnabled: z.boolean(), effectiveFrom: dateOnly, phase: z.enum(["SETUP", "ACTIVATE"]), confirmation: z.literal("RECONCILED"),
});
export const simpleAdjustmentSchema = commandEnvelope.extend({
  employeeId: z.number().int().positive(), originalStatementId: z.string().uuid().optional(),
  label: z.string().trim().min(1).max(120), reason: z.string().trim().min(5).max(1000), earnedOn: dateOnly,
  amount: decimalString.refine(value => Number(value) !== 0 && /^-?\d+(\.\d{1,2})?$/.test(value)),
});
export const activationSchema = commandEnvelope.extend({ target: z.enum(["SHADOW", "ACTIVE"]), confirmation: z.literal("RECONCILED") });
export const attendanceCorrectionSchema = commandEnvelope.extend({
  employeeId: z.number().int().positive(), date: dateOnly, status: z.enum(["PRESENT", "LATE", "ABSENT", "OFF"]),
  startedAt: z.string().datetime({ offset: true }).optional(), endedAt: z.string().datetime({ offset: true }).optional(),
  breaks: z.array(z.object({ start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }) })).max(20).default([]),
  reason: z.string().trim().min(5).max(1000), confirmFullDay: z.boolean().default(false),
}).refine(value => Boolean(value.startedAt) === Boolean(value.endedAt), "Provide both clock times")
  .refine(value => !value.startedAt || Date.parse(value.endedAt!) > Date.parse(value.startedAt), "End must follow start");
export type CompensationInput = z.infer<typeof compensationSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
