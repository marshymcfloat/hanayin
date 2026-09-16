import { getServerSession } from "next-auth";
import { authOptions } from "@/features/auth/auth-options";
import EmployeeDashboardDataContainer from "@/components/dashboard/employee/EmployeeDashboardDataContainer";
import OwnerDashboardDataContainer from "@/components/dashboard/owner/OwnerDashboardDataContainer";
import { LoaderCircle } from "lucide-react";
import { redirect } from "next/navigation";

export default async function DashboardDispatcher() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return (
      <main className="w-screen h-screen backdrop-blur-sm flex items-center justify-center">
        <LoaderCircle className="animate-spin" />
      </main>
    );
  }

  if (session?.user.role === "EMPLOYEE") {
    return (
      <EmployeeDashboardDataContainer
        businessSlug={session.user.businessSlug!}
      />
    );
  }

  if (session?.user.role === "OWNER") {
    return (
      <OwnerDashboardDataContainer businessSlug={session.user.businessSlug!} />
    );
  }

  if (session?.user.role === "PLATFORM_ADMIN") {
    redirect("/platform");
  }

  return <div>page</div>;
}
