"use server";

import {
  createSaleEvent,
  deleteSaleEvent,
  updateSaleEvent,
} from "@/features/catalog/actions/sale-event";
import type {
  CreateSaleEventParams,
  UpdateSaleEventParams,
} from "@/features/catalog/sale-event-types";

export async function createOwnerSaleEventPreviewAction(input: CreateSaleEventParams) {
  return createSaleEvent(input);
}

export async function updateOwnerSaleEventPreviewAction(input: UpdateSaleEventParams) {
  return updateSaleEvent(input);
}

export async function deleteOwnerSaleEventPreviewAction(id: number, businessSlug: string) {
  return deleteSaleEvent(id, businessSlug);
}
