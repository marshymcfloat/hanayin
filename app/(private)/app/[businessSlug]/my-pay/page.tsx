import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireTenantAccess } from "@/lib/auth/guards";
import { MyPay } from "@/components/payroll/MyPay";
import { z } from "zod";

type Props = { params: Promise<{ businessSlug: string }>; searchParams: Promise<{ statement?: string }> };
async function Content({ params, searchParams }: Props) {
  const { businessSlug } = await params;
  const auth = await requireTenantAccess(businessSlug);
  if (!auth.success) redirect("/app");
  if (auth.session.user.role !== "EMPLOYEE") redirect("/app/" + businessSlug + "/payroll");
  const query = await searchParams;
  return <MyPay businessSlug={businessSlug} userId={auth.session.user.id} initialStatementId={z.string().uuid().safeParse(query.statement).success ? query.statement : undefined} />;
}
export default function Page(props: Props) {
  return <main><header className="px-6 pt-8 print:hidden"><h1 className="text-2xl font-semibold">My Pay</h1><p className="text-sm text-muted-foreground">Earnings, payslips, and recorded payments.</p></header><Suspense fallback={<section className="min-h-72 p-8" aria-busy="true"><p role="status">Loading pay records…</p></section>}><Content {...props} /></Suspense></main>;
}
