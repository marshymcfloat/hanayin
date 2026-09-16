"use client";

import { useQuery } from "@tanstack/react-query";
import {
  searchCustomer,
  type CustomerSearchHit,
} from "@/features/customers/actions/customer";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Mail,
  Phone,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  User,
  UserPlus,
  X,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

/**
 * Three explicit modes a CustomerPicker can be in:
 * - search: staff is looking for an existing customer
 * - new:    staff opted to create a new customer (filling name + contact)
 * - anonymous: staff opted to skip customer collection entirely
 */
export type CustomerPickerMode = "search" | "new" | "anonymous";

export type SelectedCustomer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

export type CustomerPickerValue =
  | { mode: "existing"; customer: SelectedCustomer }
  | { mode: "new"; name: string; email?: string; phone?: string }
  | { mode: "anonymous"; label: string };

export interface CustomerPickerProps {
  businessSlug: string;
  /**
   * Current value. The component supports being controlled or uncontrolled —
   * pass `value` + `onChange` to control it, or just `onChange` if you only
   * need to react to picks.
   */
  value?: CustomerPickerValue | null;
  onChange: (value: CustomerPickerValue | null) => void;
  /**
   * Disabled state — when the form is mid-submit, lock the picker so staff
   * can't change the customer and create a race.
   */
  disabled?: boolean;
}

function formatLastVisit(date: Date | null) {
  if (!date) return null;
  try {
    return format(new Date(date), "MMM d, yyyy");
  } catch {
    return null;
  }
}

function maskPhone(phone: string | null) {
  if (!phone) return null;
  // Light masking — show last 4 digits only ("•••• 4567")
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return phone;
  return `•••• ${digits.slice(-4)}`;
}

function trustBadgeClass(tier: string) {
  if (tier === "TRUSTED")
    return "border-primary/30 bg-primary/10 text-primary";
  if (tier === "RESTRICTED")
    return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-border bg-muted text-muted-foreground";
}

export default function CustomerPicker({
  businessSlug,
  value,
  onChange,
  disabled,
}: CustomerPickerProps) {
  // Local controlled-input state for the search query — separate from the
  // form's customerName so picking-then-clearing doesn't blow away typed data.
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 250);
  const [showResults, setShowResults] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Local fields for the "new customer" mode. The parent can still drive
  // these via the form; the picker just surfaces them inline so staff has one
  // contiguous customer step.
  const [newName, setNewName] = useState(
    value?.mode === "new" ? value.name : "",
  );
  const [newPhone, setNewPhone] = useState(
    value?.mode === "new" ? value.phone ?? "" : "",
  );
  const [newEmail, setNewEmail] = useState(
    value?.mode === "new" ? value.email ?? "" : "",
  );
  const [anonLabel, setAnonLabel] = useState(
    value?.mode === "anonymous" ? value.label : "",
  );

  // Sync internal state when the parent resets the value (e.g. after submit).
  //
  // Wave G2: this used to live in a useEffect, which trips
  // react-hooks/set-state-in-effect (the "reset state on prop change"
  // anti-pattern). The supported alternative — comparing prev-value
  // during render and calling setState if it changed — is documented in
  // the React docs under "Adjusting state on prop change" and is the
  // canonical fix. React schedules a re-render to converge, so this is
  // safe and lint-clean.
  const valueIsSet = value !== null && value !== undefined;
  const [prevValueIsSet, setPrevValueIsSet] = useState(valueIsSet);
  if (valueIsSet !== prevValueIsSet) {
    setPrevValueIsSet(valueIsSet);
    if (!valueIsSet) {
      setNewName("");
      setNewPhone("");
      setNewEmail("");
      setAnonLabel("");
      setQuery("");
    }
  }

  const { data, isFetching } = useQuery({
    queryKey: ["customerPicker", debouncedQuery, businessSlug],
    queryFn: () => searchCustomer(debouncedQuery, businessSlug),
    enabled: debouncedQuery.length > 0 && !!businessSlug && !value,
    staleTime: 30_000,
  });

  const hits: CustomerSearchHit[] = useMemo(() => {
    if (!data?.success) return [];
    return Array.isArray(data.data) ? data.data : [];
  }, [data]);

  // Close result popover on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handlePickExisting = (customer: CustomerSearchHit) => {
    onChange({
      mode: "existing",
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      },
    });
    setShowResults(false);
    setQuery("");
  };

  const handleStartNew = () => {
    setShowResults(false);
    // Pre-seed the new-customer name from whatever they typed in search.
    const seed = query.trim();
    setNewName(seed);
    onChange({
      mode: "new",
      name: seed,
      email: undefined,
      phone: undefined,
    });
  };

  const handleStartAnonymous = () => {
    setShowResults(false);
    onChange({ mode: "anonymous", label: anonLabel });
  };

  const handleClear = () => {
    onChange(null);
    setNewName("");
    setNewPhone("");
    setNewEmail("");
    setAnonLabel("");
    setQuery("");
  };

  // ─── Render: existing-customer card ──────────────────────────────────────
  if (value?.mode === "existing") {
    const c = value.customer;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] to-card p-3.5 shadow-sm">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/15 shrink-0">
            <CheckCircle2 className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground truncate">
                {c.name}
              </p>
              <Badge
                variant="outline"
                className="text-[9px] px-1.5 py-0 rounded-md border-primary/30 bg-primary/15 text-primary uppercase tracking-wide"
              >
                Linked
              </Badge>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              {c.phone && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {c.phone}
                </span>
              )}
              {c.email && (
                <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate">{c.email}</span>
                </span>
              )}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={disabled}
            className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
          >
            Change
          </Button>
        </div>
      </div>
    );
  }

  // ─── Render: new-customer mode ───────────────────────────────────────────
  if (value?.mode === "new") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">
              New customer
            </p>
            <Badge
              variant="outline"
              className="text-[9px] px-1.5 py-0 rounded-md border-primary/20 bg-primary/8 text-primary uppercase tracking-wide"
            >
              Will be saved
            </Badge>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={disabled}
            className="cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Cancel
          </Button>
        </div>

        <div className="space-y-2.5">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Full name <span className="text-destructive">*</span>
            </label>
            <Input
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                onChange({
                  mode: "new",
                  name: e.target.value,
                  email: newEmail || undefined,
                  phone: newPhone || undefined,
                });
              }}
              autoComplete="off"
              disabled={disabled}
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Phone number
            </label>
            <Input
              type="tel"
              value={newPhone}
              onChange={(e) => {
                setNewPhone(e.target.value);
                onChange({
                  mode: "new",
                  name: newName,
                  email: newEmail || undefined,
                  phone: e.target.value || undefined,
                });
              }}
              autoComplete="off"
              disabled={disabled}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Email <span className="text-muted-foreground/70">(optional)</span>
            </label>
            <Input
              type="email"
              value={newEmail}
              onChange={(e) => {
                setNewEmail(e.target.value);
                onChange({
                  mode: "new",
                  name: newName,
                  email: e.target.value || undefined,
                  phone: newPhone || undefined,
                });
              }}
              autoComplete="off"
              disabled={disabled}
            />
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: anonymous walk-in ───────────────────────────────────────────
  if (value?.mode === "anonymous") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            <p className="text-sm font-semibold text-foreground">
              Anonymous walk-in
            </p>
            <Badge
              variant="outline"
              className="text-[9px] px-1.5 py-0 rounded-md border-amber-200 bg-amber-50 text-amber-700 uppercase tracking-wide"
            >
              Not tracked
            </Badge>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={disabled}
            className="cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Cancel
          </Button>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 space-y-2.5">
          <div className="space-y-1">
            <label className="text-xs font-medium text-amber-900">
              Label for this booking{" "}
              <span className="text-amber-900/70">(optional)</span>
            </label>
            <Input
              value={anonLabel}
              onChange={(e) => {
                setAnonLabel(e.target.value);
                onChange({ mode: "anonymous", label: e.target.value });
              }}
              placeholder='e.g. "Walk-in #3", "Guy in red shirt"'
              disabled={disabled}
              className="bg-white"
            />
            <p className="text-[11px] text-amber-900/80 leading-relaxed">
              Helps you find this booking in lists later.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: search mode (default) ───────────────────────────────────────
  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          placeholder="Search by name, phone, or email…"
          className="pl-9 h-11"
          disabled={disabled}
          autoComplete="off"
        />
      </div>

      {showResults && (query.trim().length > 0 || hits.length > 0) && (
        <div className="absolute top-full left-0 right-0 z-20 mt-1.5 rounded-xl border border-border bg-popover shadow-lg overflow-hidden">
          {isFetching && (
            <div className="px-3 py-2.5 text-xs text-muted-foreground">
              Searching…
            </div>
          )}

          {!isFetching && hits.length > 0 && (
            <div className="max-h-72 overflow-y-auto">
              {hits.map((hit) => {
                const lastVisit = formatLastVisit(hit.lastBookingAt);
                return (
                  <button
                    key={hit.id}
                    type="button"
                    onClick={() => handlePickExisting(hit)}
                    className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors border-b border-border/40 last:border-b-0 cursor-pointer"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted shrink-0">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground truncate">
                            {hit.name}
                          </p>
                          {hit.trust_tier !== "NEW" && (
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[9px] px-1.5 py-0 rounded-md uppercase tracking-wide",
                                trustBadgeClass(hit.trust_tier),
                              )}
                            >
                              {hit.trust_tier === "TRUSTED" ? (
                                <span className="flex items-center gap-1">
                                  <ShieldCheck className="h-2.5 w-2.5" />
                                  Trusted
                                </span>
                              ) : (
                                hit.trust_tier
                              )}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                          {hit.phone && (
                            <span className="flex items-center gap-0.5">
                              <Phone className="h-2.5 w-2.5" />
                              {hit.phone}
                            </span>
                          )}
                          {hit.email && (
                            <span className="flex items-center gap-0.5 truncate">
                              <Mail className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">{hit.email}</span>
                            </span>
                          )}
                        </div>
                        {lastVisit && (
                          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                            Last visit: {lastVisit}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {!isFetching && hits.length === 0 && query.trim().length > 0 && (
            <div className="px-3 py-2.5 text-xs text-muted-foreground border-b border-border/40">
              No matching customers.
            </div>
          )}

          {/* Always-visible "create new" + anonymous affordances */}
          <div className="border-t border-border bg-muted/30">
            <button
              type="button"
              onClick={handleStartNew}
              className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors flex items-center gap-2.5 cursor-pointer"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 shrink-0">
                <Plus className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  Add new customer
                  {query.trim() && (
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      &ldquo;{query.trim()}&rdquo;
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Create a profile we can track over time
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={handleStartAnonymous}
              className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors flex items-center gap-2.5 border-t border-border/40 cursor-pointer"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 shrink-0">
                <ShieldAlert className="h-4 w-4 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  Anonymous walk-in
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Skip contact info — won&apos;t be tracked
                </p>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Suppress unused warning on the local helper for environments where it's
// imported but not yet used by callers.
void maskPhone;
