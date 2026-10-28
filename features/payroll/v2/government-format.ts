import { z } from "zod";
import { PayrollError } from "./contracts";

export const governmentAgencies = ["SSS", "PHILHEALTH", "PAGIBIG", "BIR"] as const;
export const exportFields = ["employeeId", "employeeName", "tin", "sss", "philhealth", "pagibig", "employerName", "employerTin", "employerSss", "employerPhilhealth", "employerPagibig", "month", "employeeShare", "employerShare", "ec", "mpfEmployee", "mpfEmployer"] as const;
export const governmentTemplateSchema = z.object({
  agency: z.enum(governmentAgencies), version: z.string().regex(/^[A-Z0-9.-]{1,80}$/),
  source: z.string().url(), effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), supportedThrough: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  format: z.enum(["CSV", "FIXED_WIDTH"]), delimiter: z.enum([",", "\t", "|"]).default(","), header: z.boolean().default(true),
  columns: z.array(z.object({ label: z.string().min(1).max(100), field: z.enum(exportFields), required: z.boolean().default(true), digits: z.boolean().default(false), width: z.number().int().positive().max(200).optional(), align: z.enum(["LEFT", "RIGHT"]).default("LEFT"), padding: z.enum([" ", "0"]).default(" ") })).min(1).max(50),
}).refine(value => value.supportedThrough >= value.effectiveFrom)
  .refine(value => value.format !== "FIXED_WIDTH" || value.columns.every(column => Boolean(column.width)), "Fixed-width exports require every column width");
export type GovernmentTemplate = z.infer<typeof governmentTemplateSchema>;
export function formatGovernmentExport(template: GovernmentTemplate, records: Record<string, string>[]) {
  const rows = records.map(record => template.columns.map(column => {
    const value = column.digits ? (record[column.field] ?? "").replace(/[-\s]/g, "") : record[column.field] ?? "";
    if (column.required && !value.trim()) throw new PayrollError("BLOCKED", "Required government export information is missing: " + column.label);
    if (column.digits && value && !/^\d+$/.test(value)) throw new PayrollError("BLOCKED", "An agency identifier needs verification: " + column.label);
    if (/[\r\n\x00-\x1f]/.test(value) || /^[=+@]/.test(value.trimStart()) || (/^-/.test(value.trimStart()) && !/^-\d+(\.\d+)?$/.test(value.trimStart()))) throw new PayrollError("BLOCKED", "An export field contains unsupported content: " + column.label);
    if (column.width && value.length > column.width) throw new PayrollError("BLOCKED", "An export field exceeds its verified length: " + column.label);
    if (template.format === "FIXED_WIDTH" && /[^\x20-\x7e]/.test(value + column.label)) throw new PayrollError("BLOCKED", "This verified fixed-width format supports ASCII only; review the agency encoding for " + column.label);
    return template.format === "FIXED_WIDTH" ? column.align === "RIGHT" ? value.padStart(column.width!, column.padding) : value.padEnd(column.width!, column.padding) : value;
  }));
  if (template.header) rows.unshift(template.columns.map(column => template.format === "FIXED_WIDTH" ? column.label.padEnd(column.width!).slice(0, column.width) : column.label));
  return rows.map(row => template.format === "FIXED_WIDTH" ? row.join("") : row.map(value => value.includes(template.delimiter) || value.includes('"') ? '"' + value.replaceAll('"', '""') + '"' : value).join(template.delimiter)).join("\r\n") + "\r\n";
}
