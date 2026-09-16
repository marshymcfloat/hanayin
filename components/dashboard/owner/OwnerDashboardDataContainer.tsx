import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/features/auth/auth-options";
import { getOwnerDashboardData } from "@/features/dashboard/queries/owner-dashboard";
import OwnerDashboard from "./OwnerDashboard";

export default async function OwnerDashboardDataContainer({
  businessSlug,
}: {
  businessSlug: string;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/");
  const data = await getOwnerDashboardData({ businessSlug });
  if (!data) return <div>Error loading dashboard</div>;
  return <OwnerDashboard {...data} />;
}
