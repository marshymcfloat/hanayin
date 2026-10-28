export type EmployeePickerEntry = {
  id: number;
  name: string;
  profile: "STAFF" | "MANAGER" | "CASHIER";
};

export type EmployeePickerResult =
  | { success: true; employees: EmployeePickerEntry[] }
  | { success: false; error: string };
