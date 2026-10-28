import type { BusinessHourInput } from "@/features/businesses/types/business-hours";

export type OwnerBusinessHoursPreviewData = {
  businessName: string;
  hours: BusinessHourInput[];
  serviceCategories: string[];
};
