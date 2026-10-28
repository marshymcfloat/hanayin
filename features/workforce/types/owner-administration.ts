export type OwnerAdministrationResult = { success: true } | { success: false; error: string };
export type OwnerAdministrationOutcome = { result: OwnerAdministrationResult; changed: boolean };
