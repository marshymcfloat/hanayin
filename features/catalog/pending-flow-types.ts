export type PendingFlow = {
  triggerServiceId: number;
  triggerServiceName: string;
  suggestedServiceId: number;
  suggestedServiceName: string;
  suggestedServicePrice: number;
  suggestedServiceDuration: number | null;
  suggestedServiceIdString: string;
  dueDate: Date;
  flowType: "REQUIRED" | "SUGGESTED";
  delayDuration: number;
  delayUnit: "DAYS" | "WEEKS" | "MONTHS";
  lastServiceDate: Date;
};
