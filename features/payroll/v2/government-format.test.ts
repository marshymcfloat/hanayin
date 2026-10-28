import { describe, expect, it } from "vitest";
import { formatGovernmentExport, governmentTemplateSchema } from "./government-format";

const template = governmentTemplateSchema.parse({ agency: "SSS", version: "SYNTHETIC-1", source: "https://www.sss.gov.ph/test-fixture", effectiveFrom: "2026-01-01", supportedThrough: "2026-12-31", format: "CSV", columns: [{ label: "Member", field: "sss", digits: true }, { label: "Employee", field: "employeeName" }, { label: "Share", field: "employeeShare" }] });
describe("versioned export layouts", () => {
  it("preserves cents, identifiers, and required quoting", () => {
    expect(formatGovernmentExport(template, [{ sss: "12-3456789-0", employeeName: "Fixture, Ana", employeeShare: "250.00" }])).toBe('Member,Employee,Share\r\n1234567890,"Fixture, Ana",250.00\r\n');
  });
  it("fails closed on missing identifiers and spreadsheet formulas", () => {
    expect(() => formatGovernmentExport(template, [{ employeeName: "Fixture", employeeShare: "250.00" }])).toThrow("missing");
    expect(() => formatGovernmentExport(template, [{ sss: "1234567890", employeeName: "=HYPERLINK()", employeeShare: "250.00" }])).toThrow("unsupported");
    expect(() => formatGovernmentExport(template, [{ sss: "1234567890", employeeName: "  =HYPERLINK()", employeeShare: "250.00" }])).toThrow("unsupported");
  });
  it("formats fixed widths and never truncates identifiers", () => {
    const fixed = governmentTemplateSchema.parse({ ...template, format: "FIXED_WIDTH", header: false, columns: [{ label: "Member", field: "sss", digits: true, width: 10 }, { label: "Share", field: "employeeShare", width: 8, align: "RIGHT", padding: "0" }] });
    expect(formatGovernmentExport(fixed, [{ sss: "1234567890", employeeShare: "250.00" }])).toBe("123456789000250.00\r\n");
    expect(() => formatGovernmentExport(fixed, [{ sss: "12345678901", employeeShare: "250.00" }])).toThrow("length");
    const named = governmentTemplateSchema.parse({ ...fixed, columns: [{ label: "Name", field: "employeeName", width: 20 }] });
    expect(() => formatGovernmentExport(named, [{ employeeName: "Peña" }])).toThrow("ASCII");
  });
});
