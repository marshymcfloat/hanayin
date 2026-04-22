"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { changePasswordAction } from "@/lib/server actions/password";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ChangePasswordClient({
  businessSlug,
}: {
  businessSlug: string;
}) {
  const router = useRouter();
  const { update } = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Please fill in all fields.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    const result = await changePasswordAction({
      currentPassword,
      newPassword,
    });
    setIsLoading(false);

    if (result.success) {
      await update({
        user: {
          mustChangePassword: false,
          tempPasswordExpiresAt: null,
        },
      });
      toast.success("Password updated successfully.");
      router.replace(`/app/${businessSlug}`);
      router.refresh();
    } else {
      toast.error(result.error || "Failed to change password.");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50/50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg rounded-3xl border border-zinc-100 shadow-lg shadow-zinc-200/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-2xl font-bold text-foreground">
            Change Password
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Please update your password before continuing.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="currentPassword">Current Password</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="newPassword">New Password</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
            className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/15"
          >
            {isLoading ? "Updating..." : "Update Password"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
