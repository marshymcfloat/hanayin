import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { PayrollRulesAdmin } from "@/components/payroll/PayrollRulesAdmin";

async function Content() {
  const auth = await requirePlatformAdmin();
  if (!auth.success) redirect("/login");
  return <PayrollRulesAdmin />;
}
export default function Page() {
  return <main><header className="px-8 pt-8"><h1 className="text-2xl font-semibold">Philippine payroll rules</h1><p className="text-sm text-muted-foreground">Versioned calculations, official sources, and independent review.</p></header><Suspense fallback={<section className="min-h-72 p-8"><p role="status">Verifying administrator access…</p></section>}><Content /></Suspense></main>;
}
