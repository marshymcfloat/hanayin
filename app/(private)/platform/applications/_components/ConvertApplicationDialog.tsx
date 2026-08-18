"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Building2,
  CheckCircle2,
  Copy,
  Link2,
  Loader2,
  MessageSquare,
  Sparkles,
  X,
  AlertTriangle,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { convertOnboardingApplicationToBusinessAction } from "@/lib/server actions/platform-admin";

/**
 * ConvertApplicationDialog — replaces the old 7-input inline form on
 * the applications table with a focused modal. Same fields, more
 * breathing room, sensible defaults pre-filled from the application
 * itself. After a successful conversion the modal STAYS OPEN and
 * shows a result panel with the magic link, SMS delivery status, and
 * copy-to-clipboard buttons so the admin can hand off the new owner
 * with a single click.
 *
 * No password is ever shown by default — the magic link IS the
 * credential. The plaintext fallback password is hidden behind a
 * "show backup password" toggle for the rare case where SMS/status
 * delivery has failed.
 */

type StructureOption = {
  value: string;
  label: string;
  defaultAllowEmployeeSelfBooking: boolean;
  defaultManagerCanServe: boolean;
};

type PlanOption = {
  code: string;
  label: string;
  trialDays: number;
};

type ApplicationDefaults = {
  applicationId: string;
  businessName: string;
  ownerName: string;
  ownerPhone: string | null;
  requestedStructure: string;
  requestedAllowEmployeeSelfBooking: boolean | null;
  requestedManagerCanServe: boolean | null;
};

interface ConvertApplicationDialogProps {
  application: ApplicationDefaults;
  defaultPlanCode: string;
  planOptions: PlanOption[];
  structureOptions: StructureOption[];
  triggerClassName?: string;
}

type ConversionSuccess = {
  ownerContactNumber: string;
  ownerPassword: string;
  magicLink: string;
  smsDelivery: "sent" | "failed" | "skipped";
  businessSlug: string;
};

export function ConvertApplicationDialog({
  application,
  defaultPlanCode,
  planOptions,
  structureOptions,
  triggerClassName,
}: ConvertApplicationDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ConversionSuccess | null>(null);
  const [, setShowBackupPassword] = React.useState(false);

  // Form state. Defaults map from the application's requested values
  // so the admin doesn't have to re-pick everything.
  const [planCode, setPlanCode] = React.useState(defaultPlanCode);
  const [trialMonths, setTrialMonths] = React.useState(1);
  const [structure, setStructure] = React.useState(application.requestedStructure);
  const [allowEmployeeSelfBooking, setAllowEmployeeSelfBooking] = React.useState(
    application.requestedAllowEmployeeSelfBooking ?? true,
  );
  const [managerCanServe, setManagerCanServe] = React.useState(
    application.requestedManagerCanServe ?? true,
  );
  // Demo data ON by default — empty trial businesses lead to "what now?"
  // dashboards. Owners explore better with five sample services + a few
  // bookings that the seeder flags is_demo for one-click cleanup.
  const [seedDemoData, setSeedDemoData] = React.useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const action = await convertOnboardingApplicationToBusinessAction({
        applicationId: application.applicationId,
        // Owner password is now generated server-side as a backup —
        // we don't ask the admin to invent one.
        ownerPassword: generateBackupPassword(),
        // Cast: the parent provides a curated list of supported codes
        // / structure values so the strings always match the unions on
        // the server side.
        planCode: planCode as Parameters<
          typeof convertOnboardingApplicationToBusinessAction
        >[0]["planCode"],
        trialMonths,
        structure: structure as Parameters<
          typeof convertOnboardingApplicationToBusinessAction
        >[0]["structure"],
        allowEmployeeSelfBooking,
        managerCanServe,
        seedDemoData,
      });
      if (!action.success) {
        setError(action.error ?? "Could not convert application.");
        return;
      }
      setResult({
        ownerContactNumber: action.data.ownerContactNumber,
        ownerPassword: action.data.ownerPassword,
        magicLink: action.data.magicLink,
        smsDelivery: action.data.smsDelivery,
        businessSlug: action.data.business.slug,
      });
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unexpected error converting application.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setOpen(false);
    setError(null);
    setResult(null);
    setShowBackupPassword(false);
    setSubmitting(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && submitting) return;
        if (!next) reset();
        else setOpen(true);
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          className={cn("rounded-full", triggerClassName)}
        >
          Convert
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg rounded-3xl border-black/[0.06]">
        {result ? (
          <SuccessPanel result={result} onClose={reset} />
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
                  <Building2 className="size-4" />
                </span>
                <div className="min-w-0 leading-tight">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Convert application
                  </p>
                  <DialogTitle className="text-base font-semibold tracking-[-0.01em] sm:text-[17px]">
                    Provision {application.businessName}
                  </DialogTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Owner: {application.ownerName}
                    {application.ownerPhone
                      ? ` · ${application.ownerPhone}`
                      : ""}
                  </p>
                </div>
              </div>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="planCode" className="text-xs">
                    Plan
                  </Label>
                  <Select value={planCode} onValueChange={setPlanCode}>
                    <SelectTrigger id="planCode" className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {planOptions.map((option) => (
                        <SelectItem key={option.code} value={option.code}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="trialMonths" className="text-xs">
                    Trial months
                  </Label>
                  <Input
                    id="trialMonths"
                    type="number"
                    min={1}
                    max={12}
                    value={trialMonths}
                    onChange={(e) =>
                      setTrialMonths(
                        Math.max(1, Math.min(12, Number(e.target.value) || 1)),
                      )
                    }
                    className="h-9"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="structure" className="text-xs">
                  Business structure
                </Label>
                <Select value={structure} onValueChange={setStructure}>
                  <SelectTrigger id="structure" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {structureOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="selfBooking" className="text-xs">
                    Employees self-book?
                  </Label>
                  <Select
                    value={allowEmployeeSelfBooking ? "true" : "false"}
                    onValueChange={(v) =>
                      setAllowEmployeeSelfBooking(v === "true")
                    }
                  >
                    <SelectTrigger id="selfBooking" className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Yes</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="managerServe" className="text-xs">
                    Manager can serve?
                  </Label>
                  <Select
                    value={managerCanServe ? "true" : "false"}
                    onValueChange={(v) => setManagerCanServe(v === "true")}
                  >
                    <SelectTrigger id="managerServe" className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Yes</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs">
                <input
                  type="checkbox"
                  checked={seedDemoData}
                  onChange={(e) => setSeedDemoData(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-emerald-300 accent-emerald-700"
                />
                <span className="flex-1">
                  <span className="block font-semibold text-emerald-900">
                    Seed demo data
                  </span>
                  <span className="mt-0.5 block text-emerald-900/80">
                    Adds 5 sample services, business hours, 3 customers, and a
                    handful of past + upcoming bookings so the owner lands on
                    a working dashboard. All flagged demo so they can wipe it
                    in one click before going live.
                  </span>
                </span>
              </label>

              {error ? (
                <div className="flex items-start gap-2 rounded-2xl bg-rose-500/10 p-3 ring-1 ring-inset ring-rose-500/20">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-700 dark:text-rose-300" />
                  <p className="text-xs text-rose-700 dark:text-rose-300">
                    {error}
                  </p>
                </div>
              ) : null}

              <div className="rounded-2xl bg-muted/30 p-3 text-xs text-muted-foreground">
                <p className="flex items-center gap-1.5">
                  <Sparkles className="size-3 shrink-0 text-primary" />
                  We&rsquo;ll text the owner a one-time login link so they can
                  sign in without a password.
                  {!application.ownerPhone
                    ? " (No phone on file — copy the magic link after converting and send it to the owner directly.)"
                    : null}
                </p>
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={reset}
                  disabled={submitting}
                  className="rounded-full border-black/[0.06]"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting} className="rounded-full">
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Converting…
                    </>
                  ) : (
                    <>
                      <Building2 className="mr-2 size-4" />
                      Provision business
                    </>
                  )}
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SuccessPanel({
  result,
  onClose,
}: {
  result: ConversionSuccess;
  onClose: () => void;
}) {
  const [showBackupPassword, setShowBackupPassword] = React.useState(false);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const smsCopy = {
    sent: {
      icon: <CheckCircle2 className="size-4 text-primary" />,
      label: "SMS sent",
      tone: "primary" as const,
      detail:
        "The owner just received their login link. They can sign in immediately.",
    },
    failed: {
      icon: <AlertTriangle className="size-4 text-amber-700 dark:text-amber-300" />,
      label: "SMS delivery failed",
      tone: "amber" as const,
      detail:
        "Couldn't reach the owner by SMS. Copy the link below and share it via your preferred channel.",
    },
    skipped: {
      icon: <AlertTriangle className="size-4 text-amber-700 dark:text-amber-300" />,
      label: "No phone on file",
      tone: "amber" as const,
      detail:
        "Application had no phone number. Copy the link below and share it via email or another channel.",
    },
  }[result.smsDelivery];

  return (
    <>
      <DialogHeader>
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
            <CheckCircle2 className="size-4" />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Business provisioned
            </p>
            <DialogTitle className="text-base font-semibold tracking-[-0.01em] sm:text-[17px]">
              All set — owner can sign in now
            </DialogTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Slug:{" "}
              <span className="font-medium text-foreground">
                {result.businessSlug}
              </span>{" "}
              · Contact:{" "}
              <span className="tabular-nums font-medium text-foreground">
                {result.ownerContactNumber}
              </span>
            </p>
          </div>
        </div>
      </DialogHeader>

      {/* SMS delivery state */}
      <div
        className={cn(
          "flex items-start gap-2 rounded-2xl p-3 ring-1 ring-inset",
          smsCopy.tone === "primary" &&
            "bg-primary/10 ring-primary/15",
          smsCopy.tone === "amber" &&
            "bg-amber-500/10 ring-amber-500/20",
        )}
      >
        <span className="mt-0.5 shrink-0">{smsCopy.icon}</span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <MessageSquare className="-mt-0.5 mr-1 inline size-3" />
            {smsCopy.label}
          </p>
          <p className="mt-0.5 text-xs text-foreground">{smsCopy.detail}</p>
        </div>
      </div>

      {/* Magic link */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <Link2 className="-mt-0.5 mr-1 inline size-3" />
          Magic login link
        </p>
        <div className="flex items-center gap-2 rounded-2xl border border-black/[0.06] bg-muted/20 p-2.5">
          <code className="flex-1 truncate font-mono text-[11px] text-muted-foreground">
            {result.magicLink}
          </code>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => copy(result.magicLink, "Login link")}
            className="h-8 shrink-0 rounded-full border-black/[0.06]"
          >
            <Copy className="mr-1.5 size-3" />
            Copy
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Link expires in 1 hour. If it expires, the owner can request a fresh
          one from their application status page.
        </p>
      </div>

      {/* Backup password — hidden behind a toggle */}
      <div className="rounded-2xl border border-black/[0.06] bg-muted/30 p-3">
        <button
          type="button"
          onClick={() => setShowBackupPassword((v) => !v)}
          className="flex w-full items-center justify-between text-left text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <span>Backup password (only if magic link fails)</span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-primary">
            {showBackupPassword ? "Hide" : "Show"}
          </span>
        </button>
        {showBackupPassword ? (
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg bg-background px-2 py-1.5 font-mono text-xs text-foreground ring-1 ring-inset ring-black/[0.06]">
              {result.ownerPassword}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => copy(result.ownerPassword, "Password")}
              className="h-8 rounded-full border-black/[0.06]"
            >
              <Copy className="mr-1.5 size-3" />
              Copy
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex justify-end">
        <Button onClick={onClose} className="rounded-full">
          <X className="mr-2 size-4" />
          Done
        </Button>
      </div>
    </>
  );
}

/**
 * Generates a 16-char alphanumeric password as a backup credential. The
 * admin never has to type this — it's hidden in the modal and only
 * surfaces if SMS delivery failed AND the customer can't reach the
 * status page. Strong enough that no need to enforce complexity.
 */
function generateBackupPassword(): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}
