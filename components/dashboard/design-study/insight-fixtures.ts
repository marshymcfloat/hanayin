export type InsightSpan = "Week" | "Month" | "Year";
export const insightRanges: Record<InsightSpan, string> = { Week: "Oct 1–7", Month: "Oct 2026", Year: "2026" };

export const serviceInsights: Record<InsightSpan, { name: string; revenue: number }[]> = {
  Week: [{ name: "Gel manicure", revenue: 1960 }, { name: "Soft gel extensions", revenue: 2097 }, { name: "Lash lift", revenue: 1350 }],
  Month: [{ name: "Gel manicure", revenue: 8400 }, { name: "Soft gel extensions", revenue: 6291 }, { name: "Lash lift", revenue: 4950 }],
  Year: [{ name: "Gel manicure", revenue: 92400 }, { name: "Soft gel extensions", revenue: 75492 }, { name: "Lash lift", revenue: 64350 }],
};
export const staffInsights: Record<InsightSpan, { name: string; count: number; revenue: number; usage: number }[]> = {
  Week: [{ name: "Alex", count: 12, revenue: 3600, usage: 78 }, { name: "Jules", count: 14, revenue: 4100, usage: 86 }, { name: "Rae", count: 8, revenue: 2450, usage: 65 }],
  Month: [{ name: "Alex", count: 52, revenue: 15800, usage: 84 }, { name: "Jules", count: 48, revenue: 14600, usage: 78 }, { name: "Rae", count: 36, revenue: 10250, usage: 68 }],
  Year: [{ name: "Alex", count: 580, revenue: 172000, usage: 81 }, { name: "Jules", count: 552, revenue: 164500, usage: 79 }, { name: "Rae", count: 428, revenue: 124800, usage: 72 }],
};
export const customerInsights: Record<InsightSpan, { name: string; visits: number; amount: number }[]> = {
  Week: [{ name: "Sofia M.", visits: 1, amount: 280 }, { name: "Camille D.", visits: 2, amount: 750 }],
  Month: [{ name: "Sofia M.", visits: 6, amount: 2840 }, { name: "Camille D.", visits: 5, amount: 2450 }],
  Year: [{ name: "Sofia M.", visits: 42, amount: 21800 }, { name: "Camille D.", visits: 38, amount: 19250 }],
};
