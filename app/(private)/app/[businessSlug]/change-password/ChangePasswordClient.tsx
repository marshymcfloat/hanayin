"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck } from "lucide-react";

import { changePasswordAction } from "@/lib/server actions/password";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PasswordRule {
  label: string;
  test: (value: string) => boolean;
}

const RULES: PasswordRule[] = [
  { label: "At least 8 characters", test: (v) => v.length >= 8 },
  { label: "Has a number", test: (v) => /\d/.test(v) },
  { label: "Has a letter", test: (v) => /[a-zA-Z]/.test(v) },
];

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
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const ruleResults = useMemo(
    () => RULES.map((rule) => ({ ...rule, passed: rule.test(newPassword) })),
    [newPassword],
  );

  const passedCount = ruleResults.filter((r) => r.passed).length;
  const matches =
    confirmPassword.length > 0 && newPassword === confirmPassword;
  const allRulesPass = passedCount === RULES.length;
  const canSubmit =
    currentPassword.length > 0 && allRulesPass && matches && !isLoading;

  const strengthLabel =
    passedCount === 0
      ? "Too short"
      : passedCount === 1
        ? "Weak"
        : passedCount === 2
          ? "Okay"
          : "Strong";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Please fill in all fields.");
      return;
    }

    if (!allRulesPass) {
      toast.error("New password doesn't meet the requirements yet.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    if (newPassword === currentPassword) {
      toast.error("New password must differ from the current one.");
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
    <div className="min-h-screen bg-background flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md">
        {/* Brand band */}
        <div className="flex flex-col items-center text-center mb-6 sm:mb-8">
          <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3 sm:mb-4 shadow-sm">
            <ShieldCheck className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Set your password
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-xs">
            You&apos;re using a temporary password. Pick a new one before
            continuing.
          </p>
        </div>

        {/* Card */}
        <div className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5">
            <PasswordField
              id="currentPassword"
              label="Current temporary password"
              value={currentPassword}
              onChange={setCurrentPassword}
              show={showCurrent}
              onToggleShow={() => setShowCurrent((v) => !v)}
              autoComplete="current-password"
            />

            <PasswordField
              id="newPassword"
              label="New password"
              value={newPassword}
              onChange={setNewPassword}
              show={showNew}
              onToggleShow={() => setShowNew((v) => !v)}
              autoComplete="new-password"
            />

            {/* Strength meter */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1.5 flex-1 rounded-full transition-colors",
                      i < passedCount
                        ? passedCount >= 3
                          ? "bg-primary"
                          : passedCount === 2
                            ? "bg-amber-400"
                            : "bg-rose-400"
                        : "bg-muted",
                    )}
                  />
                ))}
                <span
                  className={cn(
                    "ml-2 text-[11px] font-semibold uppercase tracking-wider",
                    passedCount >= 3
                      ? "text-primary"
                      : passedCount === 2
                        ? "text-amber-600"
                        : "text-muted-foreground",
                  )}
                >
                  {strengthLabel}
                </span>
              </div>
              <ul className="grid grid-cols-1 gap-1">
                {ruleResults.map((rule) => (
                  <li
                    key={rule.label}
                    className={cn(
                      "flex items-center gap-2 text-xs",
                      rule.passed ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold",
                        rule.passed
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {rule.passed ? "✓" : "·"}
                    </span>
                    {rule.label}
                  </li>
                ))}
              </ul>
            </div>

            <PasswordField
              id="confirmPassword"
              label="Confirm new password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              show={showConfirm}
              onToggleShow={() => setShowConfirm((v) => !v)}
              autoComplete="new-password"
              hint={
                confirmPassword.length > 0 ? (
                  matches ? (
                    <span className="text-primary">Passwords match</span>
                  ) : (
                    <span className="text-destructive">
                      Passwords don&apos;t match
                    </span>
                  )
                ) : null
              }
            />

            <Button
              type="submit"
              disabled={!canSubmit}
              className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm cursor-pointer"
            >
              <KeyRound className="h-4 w-4 mr-2" />
              {isLoading ? "Updating..." : "Update password"}
            </Button>
          </form>

          <div className="px-5 sm:px-6 py-4 border-t border-border bg-muted/30 text-center">
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Sign out instead
            </button>
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Trouble signing in? Ask your owner to resend a temporary password to
          your contact number.
        </p>
      </div>
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  show,
  onToggleShow,
  autoComplete,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  autoComplete: string;
  hint?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-[13px] font-semibold text-foreground">
        {label}
      </Label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className="pl-10 pr-10 h-11 rounded-xl"
        />
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint ? <p className="text-xs">{hint}</p> : null}
    </div>
  );
}
