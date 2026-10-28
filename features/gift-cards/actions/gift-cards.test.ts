import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  generate: vi.fn(),
  list: vi.fn(),
  preview: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/features/gift-cards/services/gift-cards", () => ({
  claimGiftCardBooking: mocks.claim,
  createGiftCard: mocks.create,
  deleteGiftCard: mocks.delete,
  generateGiftCardCode: mocks.generate,
  getGiftCards: mocks.list,
  previewGiftCardClaim: mocks.preview,
  updateGiftCard: mocks.update,
}));

import {
  createGiftCardAction,
  deleteGiftCardAction,
  getGiftCardsAction,
  updateGiftCardAction,
} from "./gift-cards";

const validInput = {
  code: " BF-ABCDE ",
  customer_name: " Ana ",
  customer_email: "ana@example.com",
  customer_phone: null,
  expires_at: "2030-01-01T00:00:00.000Z",
  service_ids: [1],
  package_ids: [],
};

describe("gift-card owner action boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.list.mockResolvedValue({ success: true, data: [] });
    mocks.create.mockResolvedValue({ success: true, data: { id: 1 } });
    mocks.update.mockResolvedValue({ success: true, data: { id: 1 } });
    mocks.delete.mockResolvedValue({ success: true });
  });

  it("validates a requested tenant before the authenticated service", async () => {
    await expect(getGiftCardsAction("../beautyfeel")).resolves.toEqual({
      success: false,
      error: "Invalid business slug",
    });
    expect(mocks.list).not.toHaveBeenCalled();

    await expect(getGiftCardsAction("beautyfeel")).resolves.toEqual({
      success: true,
      data: [],
    });
    expect(mocks.list).toHaveBeenCalledWith("beautyfeel");
  });

  it("normalizes bounded create input before delegation", async () => {
    await expect(createGiftCardAction(validInput)).resolves.toMatchObject({
      success: true,
    });
    expect(mocks.create).toHaveBeenCalledWith({
      ...validInput,
      code: "BF-ABCDE",
      customer_name: "Ana",
      expires_at: new Date("2030-01-01T00:00:00.000Z"),
    });
  });

  it("rejects missing delivery, empty items, duplicate ids, and invalid dates", async () => {
    const invalid = [
      { ...validInput, customer_email: null, customer_phone: null },
      { ...validInput, service_ids: [], package_ids: [] },
      { ...validInput, service_ids: [1, 1] },
      { ...validInput, expires_at: "not-a-date" },
    ];

    for (const input of invalid) {
      await expect(createGiftCardAction(input)).resolves.toEqual({
        success: false,
        error: "Invalid gift card input",
      });
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("validates update and delete identifiers before delegation", async () => {
    await expect(updateGiftCardAction(-1, validInput)).resolves.toEqual({
      success: false,
      error: "Invalid gift card input",
    });
    await expect(deleteGiftCardAction(0)).resolves.toEqual({
      success: false,
      error: "Invalid gift card input",
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();

    await updateGiftCardAction(7, validInput);
    await deleteGiftCardAction(7);
    expect(mocks.update).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ code: "BF-ABCDE" }),
    );
    expect(mocks.delete).toHaveBeenCalledWith(7);
  });
});
