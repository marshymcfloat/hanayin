import { describe, it, expect, vi } from "vitest";
vi.mock("crypto", () => ({ default: { randomInt: vi.fn(() => 0) } }));
import crypto from "crypto";
import { generateVoucherSuffix, VOUCHER_CODE_ALPHABET, VOUCHER_CODE_MAX_ATTEMPTS } from "./voucher-code";
describe("voucher suffix generation", () => {
  it("uses six independent cryptographic alphabet draws", () => { vi.mocked(crypto.randomInt).mockClear(); expect(generateVoucherSuffix()).toBe("AAAAAA"); expect(crypto.randomInt).toHaveBeenCalledTimes(6); expect(crypto.randomInt).toHaveBeenCalledWith(VOUCHER_CODE_ALPHABET.length); });
  it("supports last nonambiguous alphabet character", () => { vi.mocked(crypto.randomInt).mockImplementation((() => VOUCHER_CODE_ALPHABET.length - 1) as typeof crypto.randomInt); expect(generateVoucherSuffix()).toBe("999999"); expect(VOUCHER_CODE_ALPHABET).not.toMatch(/[IO01]/); expect(VOUCHER_CODE_MAX_ATTEMPTS).toBe(10); });
});
