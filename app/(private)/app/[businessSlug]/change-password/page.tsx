import { getServerSession } from "next-auth";
import { authOptions } from "@/features/auth/auth-options";
import { redirect } from "next/navigation";
import ChangePasswordClient from "./ChangePasswordClient";
import { Suspense } from "react";

type ChangePasswordPageProps = {
  params: Promise<{ businessSlug: string }>;
};

export default function ChangePasswordPage({ params }: ChangePasswordPageProps) {
  return (
    <Suspense fallback={<ChangePasswordPageSkeleton />}>
      <ChangePasswordContent params={params} />
    </Suspense>
  );
}

function ChangePasswordPageSkeleton() {
  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">Change Password</h1>
      <p className="mt-2 text-sm text-muted-foreground">Loading account security…</p>
    </div>
  );
}

async function ChangePasswordContent({
  params,
}: ChangePasswordPageProps) {
  const { businessSlug } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/");
  }

  if (!session.user.mustChangePassword) {
    redirect(`/app/${businessSlug}`);
  }

  return <ChangePasswordClient businessSlug={businessSlug} />;
}
