import { getServerSession } from "next-auth";
import { authOptions } from "@/features/auth/auth-options";
import { redirect } from "next/navigation";
import ChangePasswordClient from "./ChangePasswordClient";

export default async function ChangePasswordPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
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
