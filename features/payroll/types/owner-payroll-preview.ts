export type OwnerPayrollPreviewData =
  | { access: "restricted" }
  | {
      access: "granted";
      payrollMode?: string;
      calculationPolicy?: "SIMPLE" | "GOVERNMENT";
      businessName: string;
      month: string;
      paidThisMonth: number;
      paidPayslipsThisMonth: number;
      employees: Array<{
        id: number;
        name: string;
        profile: string;
        dailyRate: number;
        commissionPercentage: number;
        lastPaidAt: string | null;
        lastPaidAmount: number | null;
      }>;
      recentPayslips: Array<{
        id: number;
        employeeName: string;
        periodStart: string;
        periodEnd: string;
        paidAt: string | null;
        amount: number;
      }>;
    };
