"use client";

import * as React from "react";
import { Copy, ExternalLink, Loader2, ShieldAlert } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { impersonateBusinessOwnerAction } from "@/features/platform/actions/platform-admin";

/**
 * Owner-impersonation trigger. Lets a platform admin mint a short-lived
 * single-use sign-in link as the business owner so they can preview the
 * trial dashboard without password sharing.
 *
 * The action is audit-logged on the server. We deliberately do NOT auto-
 * navigate the admin's current tab into the owner session — that would
 * destroy their platform session. The button surfaces the link, the admin
 * opens it in an incognito window or a separate browser profile.
 */
export function ImpersonateOwnerButton({
  businessId,
  businessName,
  triggerClassName,
}: {
  businessId: string;
  businessName: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [link, setLink] = React.useState<string | null>(null);
  const [expiresInSeconds, setExpiresInSeconds] = React.useState<number | null>(
    null,
  );

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const result = await impersonateBusinessOwnerAction(businessId);
      if (!result.success) {
        setError(result.error ?? "Could not generate impersonation link.");
        return;
      }
      setLink(result.data.magicLink);
      setExpiresInSeconds(result.data.expiresInSeconds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }

  function copy() {
    if (!link) return;
    void navigator.clipboard.writeText(link);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setLink(null);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className={triggerClassName}>
          Preview as Owner
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Preview as {businessName}&rsquo;s owner</DialogTitle>
        </DialogHeader>
        <div className="mt-1 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            Audit-logged. Single-use link, expires in 15 minutes. Open in an
            incognito window so you don&rsquo;t replace your platform session.
          </p>
        </div>
        {!link ? (
          <Button
            type="button"
            onClick={generate}
            disabled={loading}
            className="mt-4 w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Generating&hellip;
              </>
            ) : (
              "Generate sign-in link"
            )}
          </Button>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="break-all text-xs text-emerald-900">{link}</p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={copy}
                className="flex-1"
              >
                <Copy className="mr-2 size-4" /> Copy
              </Button>
              <Button asChild className="flex-1">
                <a href={link} target="_blank" rel="noreferrer noopener">
                  <ExternalLink className="mr-2 size-4" /> Open
                </a>
              </Button>
            </div>
            {expiresInSeconds ? (
              <p className="text-[11px] text-muted-foreground">
                Expires in {Math.round(expiresInSeconds / 60)} minutes.
              </p>
            ) : null}
          </div>
        )}
        {error ? (
          <p className="mt-3 text-sm text-rose-700">{error}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
