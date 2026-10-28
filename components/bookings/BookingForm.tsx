"use client";
import { useBookingQuote } from "@/components/bookings/useBookingQuote";
import { BookingQuoteContext } from "@/components/bookings/BookingQuoteContext";
import { bookingSelections, bookingSelectionUnit } from "@/features/bookings/booking-selection";
import { quoteBookingAction } from "@/features/bookings/actions/booking-quote";

import {
  createBooking,
  CreateBookingResult,
} from "@/features/bookings/actions/booking";
import {
  getAvailableSlots,
  getAlternativeSlots,
  getAvailableProviders,
  getDayCapacityRange,
} from "@/features/bookings/actions/availability";
import { getBookingPolicy } from "@/features/bookings/actions/booking-policy";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import type {
  Service,
  ServicePackage,
  PackageItem,
} from "@/prisma/generated/prisma/client";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createBookingSchema,
  PaymentMethod,
  PaymentType,
  StaffSelectionMode,
} from "@/features/bookings/schemas";
import { toast } from "sonner";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { verifyVoucherAction } from "@/features/catalog/actions/vouchers";
import { findDuplicateCustomerForBooking } from "@/features/customers/actions/customer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";

import { getActiveSaleEvents } from "@/features/catalog/actions/sale-event";
import {
  calculateBookingTotal,
  getApplicableDiscount,
  type SaleEventForPricing,
} from "@/lib/utils/pricing";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Badge } from "../ui/badge";
import CustomerPicker, { type CustomerPickerValue } from "./CustomerPicker";
import ServicePicker from "./ServicePicker";
import SelectedServiceList from "./SelectedServiceList";
import BookingCheckoutReview from "./BookingCheckoutReview";
import DatePicker from "./DatePicker";
import TimeSlotPicker from "./TimeSlotPicker";
import EmployeeSelect from "./EmployeeSelect";
import ServiceClaimSelector from "./ServiceClaimSelector";
import { SegmentedToggle } from "../ui/segmented-toggle";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import { Switch } from "../ui/switch";
import ownerStyles from "./OwnerBookingForm.module.css";
import redesignStyles from "@/components/bookings/design-study/live-booking-sheet.module.css";
import designStyles from "@/components/bookings/design-study/booking-design-experiment.module.css";
import { OwnerBookingCatalogSkeleton } from "@/components/bookings/OwnerBookingFormLoading";
import { useOptionalViewer } from "@/lib/auth/viewer-context";
import staffTheme from "@/components/dashboard/employee/StaffWorkspaceTheme.module.css";

export type PackageWithItems = ServicePackage & {
  items: (PackageItem & { service: Service })[];
};

interface BookingFormProps {
  businessSlug?: string;
  bookingDesign?: "owner" | "redesign";
  onBookingStepChange?: (step: number) => void;
  services: Service[];
  packages?: PackageWithItems[];
  categories: string[];
  isEmployee?: boolean;
  allowServiceClaim?: boolean;
  currentEmployeeId?: number;
  isModal?: boolean;
  mobileActionBarMode?: "auto" | "fixed" | "sticky";
  presentation?: "default" | "owner";
  onSuccess?: () => void;
  onOwnerSubmit?: (payload: Parameters<typeof createBooking>[0]) => void;
  ownerSubmissionPending?: boolean;
  ownerFormOpen?: boolean;
  catalogPending?: boolean;
  gcash?: {
    accountName: string | null;
    mobileNumber: string | null;
    qrImageUrl: string | null;
    instructions: string | null;
  };
}

import { getCustomerPendingFlows } from "@/features/catalog/actions/flow-actions";
import type { PendingFlow } from "@/features/catalog/pending-flow-types";
import {
  resolveCustomerTrust,
  requestBookingOtp,
  verifyBookingOtp,
} from "@/features/bookings/actions/booking-otp";
import type { CustomerTrust } from "@/features/bookings/otp-types";
import { format } from "date-fns";
import {
  Sparkles,
  Calendar,
  CalendarCheck,
  Clock,
  Ticket,
  X,
  ShieldCheck,
  Phone,
  Loader2,
  User2,
  Download,
  ArrowLeft,
  ArrowRight,
  Check,
  Pencil,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BookingPolicy } from "@/lib/types/booking-policy";
import { getMaxBookingDate, getSlotEmptyState } from "./booking-form-utils";
import {
  buildServiceClaimUniqueId,
  capitalizeWords,
  toPHDateString,
} from "./booking-form-helpers";

type SelectedService = {
  packageInstanceId?: string; packageChoiceId?: string; selectionKey?: string;
  id: number;
  name: string;
  price: number;
  quantity?: number;
  duration?: number | null;
  originalPrice?: number;
  discount?: number;
  discountReason?: string | null;
  slotsRemaining?: number | null;
  packageId?: number;
  packageName?: string;
  category?: string | null;
  claimedByCurrentEmployee?: boolean;
};

function roundUpToInterval(date: Date, intervalMinutes: number) {
  const safeInterval = Math.max(1, Math.floor(intervalMinutes) || 1);
  const next = new Date(date);
  next.setSeconds(0, 0);
  const minutes = next.getMinutes();
  const remainder = minutes % safeInterval;
  if (remainder !== 0) {
    next.setMinutes(minutes + (safeInterval - remainder));
  }
  if (next.getTime() < date.getTime()) {
    next.setMinutes(next.getMinutes() + safeInterval);
  }
  return next;
}

/**
 * StepHeader — portal-language section header used at the top of each
 * booking step (Services / Date / Time / Details / Payment).
 *
 * Mirrors `PortalCardHeader` (icon chip + eyebrow + title + optional
 * count pill) but renders flat — no card chrome — so the steps don't
 * nest cards inside the form's outer PortalCard. A hairline above the
 * header replaces what would otherwise be nested borders.
 */
function StepHeader({
  step,
  eyebrow,
  title,
  icon: Icon,
  count,
  showDivider = true,
  owner = false,
}: {
  step: number;
  eyebrow: string;
  title: string;
  icon: LucideIcon;
  count?: number;
  /** Hide for the first step where the divider would sit at the top of the card. */
  showDivider?: boolean;
  owner?: boolean;
}) {
  return (
    <div className={cn("space-y-3", owner && "mb-2")}>
      {showDivider && !owner ? <div className="h-px bg-black/[0.06]" /> : null}
      <div className="flex items-start gap-3">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15", owner && "size-11 rounded-[14px] bg-[#EFF9E8] text-[#315E18] ring-0")}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 leading-tight">
          {!owner && <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Step {step} · {eyebrow}</p>}
          <div className="mt-0.5 flex items-center gap-2">
            <h3 className={cn("text-base font-semibold tracking-[-0.01em] text-foreground sm:text-[17px]", owner && "text-lg font-bold tracking-[-0.025em] sm:text-xl")}>
              {title}
            </h3>
            {count != null ? (
              <span className={cn("rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold tabular-nums text-primary ring-1 ring-inset ring-primary/15", owner && "bg-[#EFF9E8] text-[#315E18] ring-0")}>
                {count}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BookingForm({
  businessSlug: providedBusinessSlug,
  bookingDesign = "owner",
  onBookingStepChange,
  services,
  packages = [],
  categories,
  isEmployee = false,
  allowServiceClaim = true,
  currentEmployeeId,
  isModal = false,
  mobileActionBarMode = "auto",
  presentation = "default",
  onSuccess,
  onOwnerSubmit,
  ownerSubmissionPending = false,
  ownerFormOpen = true,
  catalogPending = false,
  gcash,
}: BookingFormProps) {
  const owner = presentation === "owner";
  const redesign = owner && bookingDesign === "redesign";
  const redesignFormRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const root = redesignFormRef.current;
    if (!redesign || !root) return;
    const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
    const onScroll = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.dataset.scrolling !== "true") target.dataset.scrolling = "true";
      clearTimeout(timers.get(target));
      timers.set(target, setTimeout(() => { delete target.dataset.scrolling; timers.delete(target); }, 800));
    };
    root.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll, true);
      timers.forEach((timer, target) => { clearTimeout(timer); delete target.dataset.scrolling; });
    };
  }, [redesign]);
  const staffDialogTheme = useOptionalViewer()?.actorType === "EMPLOYEE" ? staffTheme.workspace : "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const form = useForm({
    resolver: zodResolver(createBookingSchema),
    mode: "onChange",
    reValidateMode: "onChange",
    defaultValues: {
      customerId: "",
      customerName: "",
      services: [],
      scheduledAt: undefined,
      employeeId:
        isEmployee && currentEmployeeId ? currentEmployeeId : undefined,
      paymentMethod: isEmployee ? "CASH" : "ONLINE",

      paymentType: isEmployee ? "FULL" : "DOWNPAYMENT",
      staffSelectionMode: "ANY_AVAILABLE",
      email: "",
      phone: "",
    },
  });

  const params = useParams<{ businessSlug: string }>();
  const businessSlug = providedBusinessSlug ?? params.businessSlug;
  const canceled = searchParams.get("canceled");

  const { data: saleEventsResult } = useQuery({
    queryKey: ["activeSaleEvents", businessSlug],
    queryFn: () => getActiveSaleEvents(businessSlug),
    enabled: !!businessSlug,
  });
  const saleEvents = useMemo<SaleEventForPricing[]>(
    () => (saleEventsResult?.success && saleEventsResult.data) || [],
    [saleEventsResult],
  );

  const { data: bookingPolicy } = useQuery<BookingPolicy>({
    queryKey: ["bookingPolicy", businessSlug],
    queryFn: () => getBookingPolicy(businessSlug),
    enabled: !!businessSlug,
  });

  const selectedServices = useWatch({
    control: form.control,
    name: "services",
    defaultValue: [],
  }) as SelectedService[];

  const selectedDate = useWatch({
    control: form.control,
    name: "scheduledAt",
  }) as Date | undefined;
  const selectedTime = useWatch({
    control: form.control,
    name: "selectedTime",
  }) as Date | undefined;
  const paymentMethod = useWatch({
    control: form.control,
    name: "paymentMethod",
  }) as PaymentMethod;
  const paymentType = useWatch({
    control: form.control,
    name: "paymentType",
  }) as PaymentType;
  const customerId = useWatch({
    control: form.control,
    name: "customerId",
  }) as string;
  const selectedEmployeeId = useWatch({
    control: form.control,
    name: "employeeId",
  }) as number | undefined;
  const customerNameInput = useWatch({
    control: form.control,
    name: "customerName",
  }) as string;
  const customerEmailInput = useWatch({
    control: form.control,
    name: "email",
  }) as string;
  const customerPhoneInput = useWatch({
    control: form.control,
    name: "phone",
  }) as string;
  const customerNameValue = (customerNameInput || "").trim();

  const [, setExistingCustomerEmail] = useState<string | null>(null);
  const [, setExistingCustomerPhone] = useState<string | null>(null);
  const [pendingFlows, setPendingFlows] = useState<PendingFlow[]>([]);
  const [claimedUniqueIds, setClaimedUniqueIds] = useState<string[]>([]);

  // ─── Staff customer picker state ────────────────────────────────────────
  // Replaces the old name+email+phone pile for staff-created bookings.
  // Three modes: existing (linked profile), new (entering details), anonymous
  // (no contact info). Only used when isEmployee=true.
  const [pickerValue, setPickerValue] = useState<CustomerPickerValue | null>(
    null,
  );
  // The matched customer surfaced in the duplicate-confirmation dialog. When
  // non-null, the dialog is open and submission is paused.
  const [pendingDuplicate, setPendingDuplicate] = useState<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    matchedOn: "email" | "phone";
    nameMismatch: boolean;
  } | null>(null);
  // Set to true after staff explicitly confirms "create new anyway" so the
  // server skips its silent-link path and writes a fresh Customer row.
  const [forceCreateCustomer, setForceCreateCustomer] = useState(false);
  // Submission payload pending duplicate confirmation — pulled out of onSubmit
  // so we can re-fire createBookingAction once the dialog resolves.
  // Typed loosely; mirrors the shape passed to createBookingAction below.
  const [pendingSubmitPayload, setPendingSubmitPayload] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
  const duplicateLookupRef = useRef(false);
  const duplicateAttemptRef = useRef(0);
  const ownerFormOpenRef = useRef(ownerFormOpen);
  ownerFormOpenRef.current = ownerFormOpen;
  useEffect(() => {
    if (!ownerFormOpen) {
      duplicateAttemptRef.current += 1;
      duplicateLookupRef.current = false;
      setIsCheckingDuplicate(false);
      setPendingDuplicate(null);
      setPendingSubmitPayload(null);
    }
  }, [ownerFormOpen]);
  useEffect(() => () => {
    ownerFormOpenRef.current = false;
    duplicateAttemptRef.current += 1;
  }, []);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [activeWizardStep, setActiveWizardStep] = useState(0);
  useEffect(() => { onBookingStepChange?.(activeWizardStep); }, [activeWizardStep, onBookingStepChange]);
  const selectionSheetActive = redesign && activeWizardStep === 0;

  const revealWizardStep = useCallback((step: number, targetId?: string) => {
    setActiveWizardStep(step);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document
          .getElementById(targetId || "booking-wizard-progress")
          ?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
      });
    });
  }, []);

  // --- Phone-first OTP verification (public bookings only) ---
  const [otpPhone, setOtpPhone] = useState("");
  const [otpTier, setOtpTier] = useState<CustomerTrust | null>(null);
  const [otpCustomerName, setOtpCustomerName] = useState<string | undefined>(
    undefined,
  );
  const [otpCustomerEmail, setOtpCustomerEmail] = useState<string | undefined>(
    undefined,
  );
  const [otpPrefilled, setOtpPrefilled] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpVerificationId, setOtpVerificationId] = useState<
    number | undefined
  >(undefined);
  const [otpVerificationToken, setOtpVerificationToken] = useState<string | undefined>(undefined);
  const [isCheckingTrust, setIsCheckingTrust] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpCooldown, setOtpCooldown] = useState(0);

  // Start countdown timer when a cooldown is set
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setInterval(() => {
      setOtpCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCooldown]);

  const isOtpVerified = !!otpVerificationId && !!otpVerificationToken;
  // Public users must complete OTP before the rest of the form unlocks
  const isPublicVerified = isEmployee || isOtpVerified;

  const handleCheckTrust = useCallback(async () => {
    if (!otpPhone.trim() || !businessSlug) return;
    setIsCheckingTrust(true);
    setOtpError(null);
    setOtpTier(null);
    setOtpSent(false);
    setOtpVerificationId(undefined);
    setOtpVerificationToken(undefined);
    setOtpCode("");
    try {
      const result = await resolveCustomerTrust(otpPhone.trim(), businessSlug);
      setOtpTier(result.tier);
    } catch {
      setOtpError("Could not check your number. Please try again.");
    } finally {
      setIsCheckingTrust(false);
    }
  }, [otpPhone, businessSlug]);

  const handleSendOtp = useCallback(async () => {
    if (!otpPhone.trim() || !businessSlug || isSendingOtp) return;
    setIsSendingOtp(true);
    setOtpError(null);
    try {
      const result = await requestBookingOtp(otpPhone.trim(), businessSlug);
      if (result.success) {
        setOtpSent(true);
        setOtpCode("");
        if (result.cooldownSeconds) setOtpCooldown(result.cooldownSeconds);
      } else {
        setOtpError(result.error ?? "Failed to send code.");
        if (result.cooldownSeconds) setOtpCooldown(result.cooldownSeconds);
      }
    } catch {
      setOtpError("Failed to send verification code. Please try again.");
    } finally {
      setIsSendingOtp(false);
    }
  }, [otpPhone, businessSlug, isSendingOtp]);

  const handleVerifyOtp = useCallback(async () => {
    if (!otpPhone.trim() || !otpCode.trim() || !businessSlug || isVerifyingOtp)
      return;
    setIsVerifyingOtp(true);
    setOtpError(null);
    try {
      const result = await verifyBookingOtp(
        otpPhone.trim(),
        otpCode.trim(),
        businessSlug,
      );
      if (result.success && result.verificationId && result.verificationToken) {
        setOtpVerificationId(result.verificationId);
        setOtpVerificationToken(result.verificationToken);
        setOtpTier(result.customerTier ?? "NEW");
        form.setValue("phone", otpPhone.trim(), { shouldValidate: true });
        let prefilled = false;
        if (result.customerName) {
          setOtpCustomerName(result.customerName);
          form.setValue("customerName", result.customerName, {
            shouldValidate: true,
          });
          prefilled = true;
        }
        if (result.customerEmail) {
          setOtpCustomerEmail(result.customerEmail);
          form.setValue("email", result.customerEmail, {
            shouldValidate: true,
          });
          prefilled = true;
        }
        if (prefilled) setOtpPrefilled(true);
        revealWizardStep(1);
      } else {
        setOtpError(result.error ?? "Invalid code. Please try again.");
      }
    } catch {
      setOtpError("Verification failed. Please try again.");
    } finally {
      setIsVerifyingOtp(false);
    }
  }, [otpPhone, otpCode, businessSlug, form, isVerifyingOtp, revealWizardStep]);

  useEffect(() => {
    async function fetchFlows() {
      if (!customerId) {
        setPendingFlows([]);
        return;
      }
      const flows = await getCustomerPendingFlows(customerId);
      setPendingFlows(flows);
    }
    fetchFlows();
  }, [customerId]);

  useEffect(() => {
    if (saleEvents.length > 0 && selectedServices.length > 0) {
      const updatedServices = selectedServices.map((service) => {
        const discountInfo = getApplicableDiscount(
          service.id,
          service.packageId ? Number(service.packageId) : undefined,
          service.originalPrice || service.price,
          saleEvents,
        );

        if (discountInfo) {
          if (service.price !== discountInfo.finalPrice) {
            return {
              ...service,
              price: discountInfo.finalPrice,
              originalPrice: service.originalPrice || service.price,
              discount: discountInfo.discount,
              discountReason: discountInfo.reason,
              slotsRemaining: discountInfo.slotsRemaining,
            };
          }
        }
        return service;
      });

      const hasChanges = updatedServices.some(
        (s, i) => s.price !== selectedServices[i].price,
      );
      if (hasChanges) {
        form.setValue("services", updatedServices);
      }
    }
  }, [saleEvents, selectedServices, form]);

  /**
   * Picker → form bridge. Translates the three picker modes into the form's
   * existing customerId / customerName / email / phone shape so the rest of
   * the submission pipeline doesn't need to know about CustomerPicker.
   * Anonymous walk-ins are tracked separately via pickerValue.mode.
   *
   * (Replaces the legacy handleCustomerSelect callback that was wired to the
   * old CustomerSearchInput. existingCustomerEmail/Phone state stays so the
   * existing read-only "linked profile" notices below still surface when a
   * customer is picked.)
   */
  const handlePickerChange = useCallback(
    (value: CustomerPickerValue | null) => {
      setPickerValue(value);
      // Reset force-create whenever the picker target changes.
      setForceCreateCustomer(false);

      if (!value) {
        form.setValue("customerId", "", { shouldValidate: false });
        form.setValue("customerName", "", { shouldValidate: false });
        form.setValue("email", "", { shouldValidate: false });
        form.setValue("phone", "", { shouldValidate: false });
        setExistingCustomerEmail(null);
        setExistingCustomerPhone(null);
        return;
      }

      if (value.mode === "existing") {
        form.setValue("customerId", value.customer.id, {
          shouldValidate: true,
        });
        form.setValue("customerName", value.customer.name, {
          shouldValidate: true,
        });
        form.setValue("email", value.customer.email ?? "", {
          shouldValidate: true,
        });
        form.setValue("phone", value.customer.phone ?? "", {
          shouldValidate: true,
        });
        setExistingCustomerEmail(value.customer.email);
        setExistingCustomerPhone(value.customer.phone);
        return;
      }

      if (value.mode === "new") {
        form.setValue("customerId", "", { shouldValidate: true });
        form.setValue("customerName", value.name, { shouldValidate: true });
        form.setValue("email", value.email ?? "", { shouldValidate: true });
        form.setValue("phone", value.phone ?? "", { shouldValidate: true });
        setExistingCustomerEmail(null);
        setExistingCustomerPhone(null);
        return;
      }

      // anonymous
      form.setValue("customerId", "", { shouldValidate: false });
      form.setValue("customerName", value.label || "Anonymous walk-in", {
        shouldValidate: false,
      });
      form.setValue("email", "", { shouldValidate: false });
      form.setValue("phone", "", { shouldValidate: false });
      setExistingCustomerEmail(null);
      setExistingCustomerPhone(null);
    },
    [form],
  );

  const [isWalkIn, setIsWalkIn] = useState(false);

  // Slot-taken recovery: bumping this counter triggers a one-shot
  // shake on the time-slot section to draw the eye back to the
  // refreshed list. Reduced-motion users get a no-op (see below).
  const [slotTakenShakeKey, setSlotTakenShakeKey] = useState(0);
  const reducedMotion = useReducedMotion();
  const slotSectionRef = useRef<HTMLDivElement | null>(null);

  const claimStepEnabled = isEmployee && allowServiceClaim;
  const effectiveIsWalkIn = isEmployee && isWalkIn;
  const [requireSelectedStaff, setRequireSelectedStaff] = useState(false);
  const [hasReviewedDetails, setHasReviewedDetails] = useState(false);
  const [showReviewGuidance, setShowReviewGuidance] = useState(false);
  const reviewConfirmationRef = useRef<HTMLDivElement | null>(null);

  const guideToReviewConfirmation = useCallback(() => {
    setShowReviewGuidance(true);
    reviewConfirmationRef.current?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "center",
    });
    requestAnimationFrame(() => {
      document.getElementById("confirm-booking-details")?.focus({
        preventScroll: true,
      });
    });
  }, [reducedMotion]);

  useEffect(() => {
    if (canceled === "true") {
      toast.error("Payment was canceled or expired. Please try again.");
      if (businessSlug) {
        router.replace(`/${businessSlug}/booking`);
      }
    }
  }, [canceled, businessSlug, router]);

  const handleWalkInToggle = useCallback(() => {
    if (!isEmployee) return;
    const newState = !isWalkIn;
    setIsWalkIn(newState);

    if (newState) {
      const now = new Date();
      const intervalMinutes = bookingPolicy?.slotIntervalMinutes ?? 30;
      const roundedNow = roundUpToInterval(now, intervalMinutes);
      form.setValue("scheduledAt", roundedNow, { shouldValidate: true });
      form.setValue("selectedTime", roundedNow, {
        shouldValidate: true,
      });
      revealWizardStep(2);
    } else {
      form.setValue("scheduledAt", undefined);
      form.setValue("selectedTime", undefined);
    }
  }, [
    isWalkIn,
    form,
    isEmployee,
    bookingPolicy?.slotIntervalMinutes,
    revealWizardStep,
  ]);

  const { total } = useMemo(() => {
    const total = selectedServices.reduce((sum, s) => {
      return sum + s.price * (s.quantity || 1);
    }, 0);
    return { total };
  }, [selectedServices]);

  // Voucher State
  const [voucherCode, setVoucherCode] = useState("");
  const [appliedVoucher, setAppliedVoucher] = useState<{
    code: string;
    discountAmount: number;
    type: "PERCENTAGE" | "FLAT";
    value: number;
  } | null>(null);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [isVerifyingVoucher, setIsVerifyingVoucher] = useState(false);
  const hasActivePromos = true;

  const handleVerifyVoucher = useCallback(async () => {
    if (!voucherCode.trim()) return;
    setIsVerifyingVoucher(true);
    setVoucherError(null);

    const result = await verifyVoucherAction(voucherCode, businessSlug!, total);

    setIsVerifyingVoucher(false);

    if (result.success && result.data) {
      setAppliedVoucher({
        code: result.data.code,
        discountAmount: result.data.discountAmount,
        type: result.data.type,
        value: result.data.value,
      });
      toast.success("Voucher applied successfully!");
    } else {
      setAppliedVoucher(null);
      setVoucherError(result.error || "Invalid voucher code");
      toast.error(result.error || "Invalid voucher code");
    }
  }, [voucherCode, businessSlug, total]);

  const clearVoucher = useCallback(() => {
    setVoucherCode("");
    setAppliedVoucher(null);
    setVoucherError(null);
  }, []);

  // Re-verify voucher if total changes (e.g. added/removed services)
  useEffect(() => {
    if (appliedVoucher) {
      const revalidate = async () => {
        const result = await verifyVoucherAction(
          appliedVoucher.code,
          businessSlug!,
          total,
        );
        if (!result.success) {
          setAppliedVoucher(null);
          setVoucherError("Voucher removed: requirements no longer met");
          toast.error("Voucher removed: requirements no longer met");
        } else if (result.data) {
          // Update discount amount as it might have changed (percentage)
          setAppliedVoucher({
            code: result.data.code,
            discountAmount: result.data.discountAmount,
            type: result.data.type,
            value: result.data.value,
          });
        }
      };
      // Only run if total > 0
      if (total > 0) revalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, businessSlug]);

  const quoteDate = useMemo(() => effectiveIsWalkIn ? roundUpToInterval(new Date(), bookingPolicy?.slotIntervalMinutes ?? 30) : selectedTime ?? selectedDate ?? new Date(), [effectiveIsWalkIn, bookingPolicy?.slotIntervalMinutes, selectedTime, selectedDate]);
  const quotedSelections = useMemo(() => bookingSelections(selectedServices), [selectedServices]);
  const liveQuote = useBookingQuote({ businessSlug: businessSlug ?? "", scheduledAt: quoteDate, services: quotedSelections, paymentMethod, paymentType, voucherCode: appliedVoucher?.code });
  const requestRef = useRef<{ payload: string; key: string } | null>(null);
  const [quoteChecking, setQuoteChecking] = useState(false);
  const quoteLock = useRef(false);
  const finalTotal = useMemo(() => {
    if (liveQuote.data) return liveQuote.data.grandTotal;
    if (appliedVoucher) {
      return Math.max(0, total - appliedVoucher.discountAmount);
    }
    return total;
  }, [total, appliedVoucher, liveQuote.data]);

  const voucherDiscountAmount = liveQuote.data?.voucherDiscount ?? appliedVoucher?.discountAmount ?? 0;

  const finalAmountToPay = useMemo(() => {
    return calculateBookingTotal({
      subtotal: finalTotal,
      voucherDiscount: 0,
      paymentMethod: "CASH",
      paymentType,
      downpaymentPercentage: isEmployee
        ? (bookingPolicy?.downpaymentPercentage ?? 50)
        : 20,
    });
  }, [finalTotal, paymentType, isEmployee, bookingPolicy]);

  const totalDuration = useMemo(() => {
    return selectedServices.reduce((total, s) => {
      const duration = s.duration || 30;
      return total + duration * (s.quantity || 1);
    }, 0);
  }, [selectedServices]);

  const slotServiceInputs = useMemo(() => {
    const serviceMap = new Map<number, number>();
    selectedServices.forEach((service) => {
      const quantity = Math.max(1, Number(service.quantity) || 1);
      serviceMap.set(service.id, (serviceMap.get(service.id) || 0) + quantity);
    });
    return Array.from(serviceMap.entries()).map(([id, quantity]) => ({
      id,
      quantity,
    }));
  }, [selectedServices]);

  const slotServiceKey = useMemo(() => {
    return slotServiceInputs
      .slice()
      .sort((a, b) => a.id - b.id)
      .map((item) => `${item.id}:${item.quantity}`)
      .join("|");
  }, [slotServiceInputs]);

  const selectedServiceCategories = useMemo(() => {
    const categorySet = new Set<string>();
    selectedServices.forEach((service) => {
      const category =
        service.category || services.find((s) => s.id === service.id)?.category;
      if (category) categorySet.add(category);
    });
    return Array.from(categorySet);
  }, [selectedServices, services]);

  const selectedDatePHString = useMemo(
    () => (selectedDate ? toPHDateString(selectedDate) : null),
    [selectedDate],
  );
  const todayPHString = toPHDateString(new Date());
  const isSelectedDateInFuture =
    !!selectedDatePHString && selectedDatePHString > todayPHString;
  const bookingHorizonDays = bookingPolicy?.bookingHorizonDays ?? 14;
  const bookingMinLeadMinutes = bookingPolicy?.minLeadMinutes ?? 30;
  const bookingV2Enabled = bookingPolicy?.bookingV2Enabled ?? true;
  const maxBookingDate = useMemo(
    () =>
      getMaxBookingDate({
        bookingV2Enabled,
        bookingHorizonDays,
      }),
    [bookingHorizonDays, bookingV2Enabled],
  );

  const { data: timeSlots = [], isLoading: isLoadingSlots } = useQuery({
    queryKey: [
      "timeSlots",
      businessSlug,
      selectedDate?.toISOString(),
      slotServiceKey,
      bookingHorizonDays,
      bookingV2Enabled,
    ],
    queryFn: async () => {
      if (
        !selectedDate ||
        !businessSlug ||
        selectedServices.length === 0 ||
        effectiveIsWalkIn
      ) {
        return [];
      }
      return getAvailableSlots({
        businessSlug,
        date: selectedDate,
        services: slotServiceInputs,
        slotIntervalMinutes: bookingPolicy?.slotIntervalMinutes,
      });
    },
    enabled:
      !!selectedDate &&
      !!businessSlug &&
      selectedServices.length > 0 &&
      !effectiveIsWalkIn,
    // Stale-slot prevention while the user is filling out the form:
    // - Refetch on tab focus so coming back from another tab gets fresh capacity.
    // - 30s background poll while the tab is visible (pauses when hidden so
    //   we don't burn quota on backgrounded tabs). 30s is a tradeoff —
    //   shorter ⇒ better staleness guarantees but more load; longer ⇒
    //   more SLOT_JUST_TAKEN errors at submit time.
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  // Per-day slot counts for the booking horizon, so the DatePicker can
  // pre-color days by capacity. One server call covers the whole window;
  // 60s stale time keeps it cheap. Disabled on walk-in flows since they
  // bypass the calendar entirely.
  const { data: dayCapacity } = useQuery({
    queryKey: ["dayCapacity", businessSlug, slotServiceKey, bookingHorizonDays],
    queryFn: async () => {
      if (!businessSlug || selectedServices.length === 0 || effectiveIsWalkIn) {
        return {};
      }
      const fromDate = new Date();
      fromDate.setHours(0, 0, 0, 0);
      const toDate = new Date(
        fromDate.getTime() + bookingHorizonDays * 86400000,
      );
      return getDayCapacityRange({
        businessSlug,
        services: slotServiceInputs,
        fromDate,
        toDate,
      });
    },
    enabled:
      !!businessSlug && selectedServices.length > 0 && !effectiveIsWalkIn,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: alternativeSlots = [] } = useQuery({
    queryKey: [
      "alternativeSlots",
      businessSlug,
      selectedDate?.toISOString(),
      slotServiceKey,
      timeSlots.length,
    ],
    queryFn: async () => {
      if (!selectedDate || !businessSlug || slotServiceInputs.length === 0) {
        return [];
      }
      return getAlternativeSlots({
        businessSlug,
        scheduledAt: selectedTime || selectedDate,
        services: slotServiceInputs,
      });
    },
    enabled:
      !!selectedDate &&
      !!businessSlug &&
      !effectiveIsWalkIn &&
      slotServiceInputs.length > 0 &&
      !isLoadingSlots &&
      timeSlots.length === 0,
  });

  const totalWithFee = useMemo(() => {
    return calculateBookingTotal({
      subtotal: total,
      voucherDiscount: voucherDiscountAmount,
      paymentMethod,
      paymentType,
      downpaymentPercentage: isEmployee
        ? (bookingPolicy?.downpaymentPercentage ?? 50)
        : 20,
    });
  }, [
    total,
    voucherDiscountAmount,
    paymentMethod,
    paymentType,
    isEmployee,
    bookingPolicy,
  ]);

  const { data: employees = [], isLoading: isLoadingEmployees } = useQuery({
    queryKey: [
      "employees",
      businessSlug,
      selectedTime?.toISOString(),
      totalDuration,
      selectedServiceCategories.join("|"),
    ],
    queryFn: async () => {
      if (!selectedTime || !businessSlug) {
        return [];
      }
      const endTime = new Date(
        selectedTime.getTime() + totalDuration * 60 * 1000,
      );
      return getAvailableProviders({
        businessSlug,
        startTime: selectedTime,
        endTime,
        categories: selectedServiceCategories,
        category: selectedServiceCategories[0] || "GENERAL",
      });
    },
    enabled: !!selectedTime && !!businessSlug,
  });

  useEffect(() => {
    if (selectedServices.length === 0) {
      form.setValue("selectedTime", undefined);
      form.setValue("employeeId", undefined);
    }
  }, [selectedServices.length, form]);

  useEffect(() => {
    if (!effectiveIsWalkIn && selectedServices.length > 0) {
      form.setValue("selectedTime", undefined);
      form.setValue("employeeId", undefined);
    }
  }, [slotServiceKey, form, effectiveIsWalkIn, selectedServices.length]);

  useEffect(() => {
    if (!selectedDate && !effectiveIsWalkIn) {
      form.setValue("selectedTime", undefined);
      form.setValue("employeeId", undefined);
    }
  }, [selectedDate, form, effectiveIsWalkIn]);

  useEffect(() => {
    if (!selectedTime && !effectiveIsWalkIn) {
      form.setValue("employeeId", undefined);
    }
  }, [selectedTime, form, effectiveIsWalkIn]);

  const selectedTimeKey = selectedTime?.getTime() ?? 0;
  const claimedUniqueIdsKey = useMemo(
    () => claimedUniqueIds.join("|"),
    [claimedUniqueIds],
  );

  useEffect(() => {
    setHasReviewedDetails(false);
    setShowReviewGuidance(false);
  }, [
    effectiveIsWalkIn,
    slotServiceKey,
    selectedDatePHString,
    selectedTimeKey,
    selectedEmployeeId,
    claimedUniqueIdsKey,
    customerNameValue,
    customerEmailInput,
    customerPhoneInput,
    requireSelectedStaff,
  ]);

  const { mutate: createBookingAction, isPending } = useMutation({
    mutationFn: async (...args: Parameters<typeof createBooking>) => {
      const result = await createBooking(...args);
      // Expected server-side rejections are returned as data so Next.js does
      // not turn them into opaque production 500 responses. Re-throw locally
      // to retain the form's existing per-code recovery behavior.
      if (result.type === "error") {
        if (result.code === "QUOTE_CHANGED") {
          if (result.quote) queryClient.setQueryData(liveQuote.key, result.quote);
          else void liveQuote.refetch();
        }
        throw new Error(result.code);
      }
      return result;
    },
    onSuccess: (result: CreateBookingResult) => {
      if (!result) return;
      if (result.type === "error") return;
      if (result.warnings?.length) {
        result.warnings.forEach((warning) => toast.message(warning));
      }

      if (result.type === "redirect") {
        if (result.url && result.url.startsWith("http")) {
          window.location.href = result.url;
        }
        return;
      }

      if (result.type === "internal") {
        if (!isEmployee && result.url) {
          // Intercepted routes can retain their modal slot during a soft
          // transition. Reload the destination document to close it reliably.
          setIsRedirecting(true);
          window.location.replace(result.url);
          return;
        }

        form.reset();
        setIsWalkIn(false); // Reset walk-in toggle
        setHasReviewedDetails(false);
        setClaimedUniqueIds([]);
        setPendingFlows([]);
        setExistingCustomerEmail(null);
        setExistingCustomerPhone(null);
        toast.success(
          isEmployee
            ? "Booking successfully created"
            : "Slot held. Complete your GCash deposit to request confirmation.",
        );

        if (onSuccess) {
          // Modal-embedded flow (BookingDialog) — close the modal and
          // let the staff dashboard re-fetch.
          onSuccess();
        } else if (!isEmployee && result.url) {
          // Public booking — navigate to the customer-facing success
          // page. The server returns the URL with a signed token so
          // we don't generate one client-side.
          // Replace instead of push so Back cannot reopen the completed
          // intercepted booking modal. The @modal catch-all simultaneously
          // clears the parallel route slot on this soft navigation.
          router.replace(result.url);
        } else {
          router.back();
        }
        return;
      }
    },
    onError: (error) => {
      const code = error instanceof Error ? error.message : "";
      if (code === "OTP_REQUIRED" || code === "OTP_INVALID_OR_EXPIRED") {
        setOtpVerificationId(undefined);
        setOtpVerificationToken(undefined);
        setOtpTier("NEW");
        toast.error("Verification expired. Please re-verify your number.");
        return;
      }
      if (code === "CUSTOMER_RESTRICTED") {
        toast.error(
          "Your account has been restricted. Please contact the business to book.",
          { duration: 8000 },
        );
        return;
      }
      if (code === "DATE_OUTSIDE_HORIZON") {
        toast.error("Selected date is outside the booking window.");
        return;
      }
      if (code === "LEAD_TIME_VIOLATION") {
        toast.error(
          `Please choose a slot at least ${bookingMinLeadMinutes} minutes from now.`,
        );
        return;
      }
      if (code === "PAYMENT_TYPE_NOT_ALLOWED") {
        toast.error(
          "Selected payment type is not available for public booking.",
        );
        return;
      }
      if (code === "NO_CAPACITY_FOR_SELECTED_SERVICES") {
        toast.error(
          "No capacity left for the selected services. Try another day.",
        );
        return;
      }
      if (code === "REQUIRED_STAFF_UNAVAILABLE") {
        toast.error("Selected staff is unavailable for this booking time.");
        return;
      }
      if (code === "PREFERRED_STAFF_UNAVAILABLE") {
        toast.error("Preferred staff is unavailable for this slot.");
        return;
      }
      if (code === "WALK_IN_CAPACITY_EXCEEDED") {
        toast.error("No immediate walk-in capacity right now.");
        return;
      }
      if (code === "SLOT_JUST_TAKEN") {
        form.setValue("selectedTime", undefined);
        queryClient.invalidateQueries({
          queryKey: ["timeSlots", businessSlug],
        });
        // Inline recovery: bump the shake key so the slot section
        // animates, then scroll it into view. The picker itself has
        // already re-fetched a fresh list — the user just needs to
        // pick again. Reduced-motion users get the scroll without
        // the shake (handled by useReducedMotion in the framer
        // animate target below).
        setSlotTakenShakeKey((n) => n + 1);
        slotSectionRef.current?.scrollIntoView({
          behavior: reducedMotion ? "auto" : "smooth",
          block: "center",
        });
        toast.error(
          "That slot was just taken — pick from the refreshed times below.",
        );
        return;
      }
      if (code === "SALE_SLOT_LIMIT_REACHED") {
        toast.error(
          "This promo just filled up. You can still book at regular price.",
          {
            duration: 8000,
            action: {
              label: "Book at regular price",
              onClick: () => {
                const currentServices = form.getValues(
                  "services",
                ) as SelectedService[];
                form.setValue(
                  "services",
                  currentServices.map((s) => ({
                    ...s,
                    price: s.originalPrice ?? s.price,
                    discount: 0,
                    discountReason: undefined,
                    slotsRemaining: null,
                  })),
                );
              },
            },
          },
        );
        return;
      }
      if (code === "BOOKING_FAILED") {
        toast.error(
          "We couldn't create the booking. Please refresh the available times and try again.",
        );
        queryClient.invalidateQueries({
          queryKey: ["timeSlots", businessSlug],
        });
        return;
      }
      if (code === "QUOTE_CHANGED") { toast.info("Prices or offer availability changed. Review the refreshed total before confirming."); return; }
      // Free-form server errors get surfaced as-is so the operator
      // sees the actual reason ("Invalid or expired voucher code",
      // "Minimum spend of 500 required to use this voucher", etc.)
      // instead of a useless generic "Failed to create booking".
      // Typed codes (SCREAMING_SNAKE_CASE) that haven't matched a
      // branch above get a more informative fallback that includes
      // the code -- this is intentional opacity for codes whose
      // human-readable rendering would need its own design decision
      // (e.g. payments errors), but at least surfaces the symbol so
      // operators can grep the codebase for what went wrong.
      const fallbackMessage =
        code && /^[A-Z][A-Z0-9_]*$/.test(code)
          ? `Couldn't create booking: ${code.replaceAll("_", " ").toLowerCase()}.`
          : code || "Failed to create booking";
      toast.error(fallbackMessage);
    },
  });

  const dispatchBooking = useCallback(async (payload: Parameters<typeof createBooking>[0]) => {
    if (quoteLock.current) return;
    quoteLock.current = true; setQuoteChecking(true);
    try {
      const result = await quoteBookingAction(payload);
      if (!result.success) { toast.error(result.error); return; }
      if (!liveQuote.data || result.quote.fingerprint !== liveQuote.data.fingerprint) {
        queryClient.setQueryData(liveQuote.key, result.quote);
        toast.info("Prices were refreshed. Review the total and confirm again.");
        return;
      }
      if (result.quote.voucherOutcome === "BETTER_OFFER") toast.info("A better offer was applied. Your voucher has not been used.");
      const reviewed = { ...payload, expectedQuoteFingerprint: result.quote.fingerprint };
      const payloadKey = JSON.stringify(reviewed);
      if (requestRef.current?.payload !== payloadKey) requestRef.current = { payload: payloadKey, key: crypto.randomUUID() };
      const confirmed = { ...reviewed, requestKey: requestRef.current.key };
      if (owner && onOwnerSubmit) onOwnerSubmit(confirmed); else createBookingAction(confirmed);
    } finally { quoteLock.current = false; setQuoteChecking(false); }
  }, [owner, onOwnerSubmit, createBookingAction, liveQuote.data, liveQuote.key, queryClient]);

  const onSubmit = useCallback(
    (formData: unknown) => {
      const data = formData as {
        customerId?: string;
        customerName?: string;
        services: SelectedService[];
        scheduledAt?: Date;
        selectedTime?: Date;
        paymentMethod: PaymentMethod;
        paymentType: PaymentType;
        email?: string;
        phone?: string;
      };
      if (!businessSlug) {
        console.error("Business slug not found in URL");
        toast.error("Business info missing. Please refresh the page.");
        return;
      }
      if (owner && (catalogPending || ownerSubmissionPending || duplicateLookupRef.current || !ownerFormOpenRef.current)) return;
      if (owner && onOwnerSubmit && !hasReviewedDetails) {
        guideToReviewConfirmation();
        return;
      }

      // Log removed for privacy

      // Persist an exact slot time for scheduled bookings.
      const scheduledAt = effectiveIsWalkIn ? quoteDate : data.selectedTime;
      if (!scheduledAt) {
        toast.error("Please select a date and time.");
        return;
      }
      const normalizedScheduledAt = effectiveIsWalkIn
        ? roundUpToInterval(
            scheduledAt,
            bookingPolicy?.slotIntervalMinutes ?? 30,
          )
        : scheduledAt;

      const flatServicesPayload = data.services.flatMap((s: SelectedService, index: number) =>
        Array.from({ length: s.quantity || 1 }).map((_, i) => {
          const uniqueId = buildServiceClaimUniqueId(s, i);
          return {
            ...bookingSelectionUnit(s, index, i),
            claimedByCurrentEmployee:
              claimStepEnabled && claimedUniqueIds.includes(uniqueId),
            packageId: s.packageId,
          };
        }),
      );

      const normalizedCustomerName = (data.customerName || "").trim();
      const capitalizedCustomerName = capitalizeWords(normalizedCustomerName);
      const computedStaffSelectionMode: StaffSelectionMode = selectedEmployeeId
        ? requireSelectedStaff
          ? "REQUIRE_SELECTED"
          : "PREFER_SELECTED"
        : "ANY_AVAILABLE";
      const isAnonymousWalkIn = isEmployee && pickerValue?.mode === "anonymous";

      const submitPayload = {
        customerId: data.customerId || undefined,
        customerName: capitalizedCustomerName,
        businessSlug,
        scheduledAt: new Date(normalizedScheduledAt),
        currentEmployeeId: isEmployee ? currentEmployeeId : undefined,
        paymentMethod: data.paymentMethod,
        paymentType: data.paymentType,
        services: flatServicesPayload,
        email: isAnonymousWalkIn ? undefined : data.email,
        phone: isAnonymousWalkIn
          ? undefined
          : data.phone?.trim() || otpPhone.trim() || undefined,
        voucherCode: appliedVoucher?.code,
        isWalkIn: effectiveIsWalkIn || isAnonymousWalkIn,
        isAnonymousWalkIn,
        forceCreateCustomer,
        staffSelectionMode: computedStaffSelectionMode,
        otpVerificationId: isEmployee ? undefined : otpVerificationId,
        otpVerificationToken: isEmployee ? undefined : otpVerificationToken,
      } as const;

      // Staff "new customer" path: pre-flight duplicate check. If a record
      // with the same email/phone already exists, surface a confirmation
      // dialog before submitting. Skipped for: anonymous walk-ins, picks
      // against an existing customer, public bookings, and force-create.
      const shouldCheckDuplicate =
        isEmployee &&
        !isAnonymousWalkIn &&
        !forceCreateCustomer &&
        !data.customerId &&
        pickerValue?.mode === "new" &&
        ((data.email && data.email.trim().length > 0) ||
          (data.phone && data.phone.trim().length > 0));

      if (shouldCheckDuplicate) {
        const duplicateAttempt = ++duplicateAttemptRef.current;
        if (owner) duplicateLookupRef.current = true;
        setIsCheckingDuplicate(true);
        findDuplicateCustomerForBooking({
          name: capitalizedCustomerName,
          email: data.email?.trim() || undefined,
          phone: data.phone?.trim() || undefined,
        })
          .then((result) => {
            if (owner && (duplicateAttempt !== duplicateAttemptRef.current || !ownerFormOpenRef.current)) return;
            duplicateLookupRef.current = false;
            setIsCheckingDuplicate(false);
            if (owner && !result.success) {
              toast.error("Could not check for an existing customer. Please try again.");
              return;
            }
            if (result.success && result.data) {
              // Pause submission, show the dialog. Stash the payload so we
              // can re-fire it after staff resolves the dialog.
              setPendingDuplicate(result.data);
              setPendingSubmitPayload({ ...submitPayload });
              return;
            }
            // No duplicate (or lookup failed) — proceed.
            dispatchBooking(submitPayload);
          })
          .catch(() => {
            if (owner && (duplicateAttempt !== duplicateAttemptRef.current || !ownerFormOpenRef.current)) return;
            duplicateLookupRef.current = false;
            setIsCheckingDuplicate(false);
            if (owner) {
              if (ownerFormOpenRef.current) toast.error("Could not check for an existing customer. Please try again.");
              return;
            }
            // Don't block the booking on a dedup-check failure — the server
            // will fall through to its own silent-link logic which is the
            // pre-existing behavior.
            dispatchBooking(submitPayload);
          });
        return;
      }

      dispatchBooking(submitPayload);
    },
    [
      businessSlug,
      effectiveIsWalkIn,
      quoteDate,
      isEmployee,
      claimStepEnabled,
      claimedUniqueIds,
      currentEmployeeId,
      dispatchBooking,
      owner,
      ownerSubmissionPending,
      catalogPending,
      onOwnerSubmit,
      hasReviewedDetails,
      guideToReviewConfirmation,
      appliedVoucher,
      bookingPolicy?.slotIntervalMinutes,
      selectedEmployeeId,
      requireSelectedStaff,
      otpPhone,
      otpVerificationId,
      otpVerificationToken,
      pickerValue,
      forceCreateCustomer,
    ],
  );

  /**
   * Dialog action: staff confirms "use existing customer" — link this booking
   * to the matched record instead of creating a new one. Re-fires the pending
   * submission payload with customerId set to the duplicate's id.
   */
  const handleConfirmUseExisting = useCallback(() => {
    if (!pendingDuplicate || !pendingSubmitPayload) return;
    const payload = {
      ...pendingSubmitPayload,
      customerId: pendingDuplicate.id,
      // Use the existing record's name for the booking — staff can edit the
      // customer's name separately if it really needs to change.
      customerName: pendingDuplicate.name,
      forceCreateCustomer: false,
    };
    setPendingDuplicate(null);
    setPendingSubmitPayload(null);
    // Sync the picker into "existing" mode so the form reflects the choice.
    handlePickerChange({
      mode: "existing",
      customer: {
        id: pendingDuplicate.id,
        name: pendingDuplicate.name,
        email: pendingDuplicate.email,
        phone: pendingDuplicate.phone,
      },
    });
    dispatchBooking(payload as Parameters<typeof createBooking>[0]);
  }, [
    pendingDuplicate,
    pendingSubmitPayload,
    handlePickerChange,
    dispatchBooking,
  ]);

  /**
   * Dialog action: staff confirms "create new anyway" — even though a record
   * with this email/phone exists, staff insists this is a different person.
   * Re-fires submission with forceCreateCustomer set so the server skips its
   * silent-link path and writes a fresh Customer row.
   */
  const handleConfirmCreateAnyway = useCallback(() => {
    if (!pendingSubmitPayload) return;
    const payload = { ...pendingSubmitPayload, forceCreateCustomer: true };
    setForceCreateCustomer(true);
    setPendingDuplicate(null);
    setPendingSubmitPayload(null);
    dispatchBooking(payload as Parameters<typeof createBooking>[0]);
  }, [pendingSubmitPayload, dispatchBooking]);

  const isGcashConfigured =
    isEmployee || !!(gcash?.accountName?.trim() && gcash?.mobileNumber?.trim());
  const isSubmitDisabled =
    quoteChecking || isPending || ownerSubmissionPending || (owner && catalogPending) ||
    isRedirecting ||
    (!selectedTime && !effectiveIsWalkIn) ||
    selectedServices.length === 0 ||
    !hasReviewedDetails ||
    !isGcashConfigured;
  const isSubmissionBlockedBeforeReview =
    quoteChecking || isPending || ownerSubmissionPending || (owner && catalogPending) ||
    isRedirecting ||
    (!selectedTime && !effectiveIsWalkIn) ||
    selectedServices.length === 0 ||
    !isGcashConfigured;

  const isStep1Complete = selectedServices.length > 0;
  const isStep2Complete = effectiveIsWalkIn || !!selectedDate;
  const isStep3Complete = effectiveIsWalkIn || !!selectedTime;
  // Staff: anonymous walk-in is a complete customer step on its own; otherwise
  // require either a linked customer or a typed-in name (>=2 chars).
  const isCustomerDetailsComplete = isEmployee
    ? pickerValue?.mode === "anonymous" ||
      !!customerId ||
      customerNameValue.length >= 2
    : customerNameValue.length >= 2;
  const canAccessStep2 = isPublicVerified && isStep1Complete;
  const canAccessStep3 = canAccessStep2 && isStep2Complete;
  const canAccessStep4 = canAccessStep3 && isStep3Complete;
  const canAccessStep5 = canAccessStep4;
  const canReviewAndConfirm = canAccessStep5;
  const wizardSteps = useMemo(
    () =>
      isEmployee
        ? [
            { label: "Services", hint: "Choose treatments" },
            { label: "Schedule", hint: "Pick date and time" },
            { label: "Customer", hint: "Add booking details" },
            { label: "Review", hint: "Confirm booking" },
          ]
        : [
            { label: "Verify", hint: "Confirm your number" },
            { label: "Services", hint: "Choose treatments" },
            { label: "Schedule", hint: "Pick date and time" },
            { label: "Details", hint: "Staff and contact info" },
            { label: "Review", hint: "Confirm and pay" },
          ],
    [isEmployee],
  );
  const wizardStepComplete = useMemo(
    () =>
      isEmployee
        ? [
            isStep1Complete,
            isStep2Complete && isStep3Complete,
            isCustomerDetailsComplete,
            hasReviewedDetails,
          ]
        : [
            isOtpVerified,
            isStep1Complete,
            isStep2Complete && isStep3Complete,
            isCustomerDetailsComplete,
            hasReviewedDetails,
          ],
    [
      hasReviewedDetails,
      isCustomerDetailsComplete,
      isEmployee,
      isOtpVerified,
      isStep1Complete,
      isStep2Complete,
      isStep3Complete,
    ],
  );
  const isLastWizardStep = activeWizardStep === wizardSteps.length - 1;
  const canContinueWizard = !quoteChecking && !(owner && catalogPending) && (wizardStepComplete[activeWizardStep] ?? false);
  const goToNextWizardStep = useCallback(async () => {
    if (!canContinueWizard) {
      if (activeWizardStep === (isEmployee ? 2 : 3)) {
        await form.trigger(["customerName", "email", "phone"]);
      }
      return;
    }
    const nextStep = Math.min(
      activeWizardStep + 1,
      wizardSteps.length - 1,
    );
    revealWizardStep(
      nextStep,
      nextStep === wizardSteps.length - 1 ? "booking-review-step" : undefined,
    );
  }, [
    activeWizardStep,
    canContinueWizard,
    form,
    isEmployee,
    revealWizardStep,
    wizardSteps.length,
  ]);
  const handleInvalidSubmit = useCallback(
    (errors: typeof form.formState.errors) => {
      const detailsStep = isEmployee ? 2 : 3;
      const targetStep =
        errors.services
          ? isEmployee
            ? 0
            : 1
          : errors.scheduledAt || errors.selectedTime
            ? isEmployee
              ? 1
              : 2
            : detailsStep;

      revealWizardStep(targetStep);
      toast.error("Please complete the highlighted booking details.");
    },
    [form, isEmployee, revealWizardStep],
  );
  const selectedEmployeeName = useMemo(
    () =>
      employees.find((employee) => employee.id === selectedEmployeeId)?.name,
    [employees, selectedEmployeeId],
  );
  const totalSelectedServiceUnits = useMemo(
    () =>
      selectedServices.reduce(
        (sum, service) => sum + (service.quantity || 1),
        0,
      ),
    [selectedServices],
  );
  const scheduleSummary = useMemo(() => {
    if (effectiveIsWalkIn) return "Walk-in · starts now";
    if (!selectedDate || !selectedTime) return "Schedule not selected";
    return `${format(selectedDate, "MMM d")} · ${selectedTime.toLocaleTimeString(
      "en-US",
      {
        timeZone: "Asia/Manila",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      },
    )}`;
  }, [effectiveIsWalkIn, selectedDate, selectedTime]);
  const wizardStepSummaries = useMemo(
    () =>
      isEmployee
        ? [
            `${totalSelectedServiceUnits} service${totalSelectedServiceUnits === 1 ? "" : "s"}`,
            scheduleSummary,
            customerNameValue || "Customer details added",
            "Ready to confirm",
          ]
        : [
            otpPhone || "Mobile number verified",
            `${totalSelectedServiceUnits} service${totalSelectedServiceUnits === 1 ? "" : "s"}`,
            scheduleSummary,
            [selectedEmployeeName || "Any available staff", customerNameValue]
              .filter(Boolean)
              .join(" · "),
            "Ready to confirm",
          ],
    [
      customerNameValue,
      isEmployee,
      otpPhone,
      scheduleSummary,
      selectedEmployeeName,
      totalSelectedServiceUnits,
    ],
  );
  const slotEmptyState = getSlotEmptyState({
    isSelectedDateInFuture,
    bookingV2Enabled,
  });

  const resolvedMobileActionBarMode =
    mobileActionBarMode === "auto"
      ? isModal
        ? "sticky"
        : "fixed"
      : mobileActionBarMode;
  const usesFixedMobileActionBar = resolvedMobileActionBarMode === "fixed";

  const paymentMethodOptions = useMemo(() => {
    if (!isEmployee) {
      return [
        {
          value: "ONLINE" as const,
          label: "GCash deposit",
        },
      ];
    }
    return [
      {
        value: "CASH" as const,
        label: "Cash",
      },
      {
        value: "ONLINE" as const,
        label: owner ? "Online" : "Paid Online (GCash / Maya)",
      },
    ];
  }, [isEmployee, owner]);

  const paymentTypeOptions = useMemo(() => {
    if (isEmployee) {
      return [
        {
          value: "FULL" as const,
          label: "Full",
        },
        {
          value: "DOWNPAYMENT" as const,
          label: `${bookingPolicy?.downpaymentPercentage ?? 50}%`,
        },
      ];
    }

    return [
      {
        value: "DOWNPAYMENT" as const,
        label: "20% deposit",
      },
    ];
  }, [isEmployee, bookingPolicy]);

  useEffect(() => {
    if (isEmployee) return;
    form.setValue("paymentMethod", "ONLINE", { shouldValidate: true });
    form.setValue("paymentType", "DOWNPAYMENT", { shouldValidate: true });
  }, [bookingPolicy, form, isEmployee]);

  return (
    <BookingQuoteContext.Provider value={liveQuote.data}><Form {...form}>
      <form
        ref={redesignFormRef}
        data-selection-sheet={selectionSheetActive || undefined}
        onSubmit={form.handleSubmit(onSubmit, handleInvalidSubmit)}
        aria-busy={!isEmployee && (isPending || isRedirecting)}
        className={cn(
          "relative flex flex-col gap-4 lg:flex-row lg:gap-10",
          owner && ownerStyles.form,
          redesign && redesignStyles.form,
          owner && "gap-4 lg:gap-6",
          usesFixedMobileActionBar
            ? "pb-[calc(10rem+env(safe-area-inset-bottom))] sm:pb-[calc(11rem+env(safe-area-inset-bottom))] lg:pb-0"
            : "pb-0",
        )}
      >
        {selectedServices.length > 0 && <div className="col-span-full rounded-xl border border-[#E6DCF3] bg-[#FAF7FD] px-4 py-3 text-xs leading-5" role="status" aria-live="polite">{quoteChecking || liveQuote.isFetching ? "Confirming current prices…" : liveQuote.isError ? <><span>Prices could not be confirmed.</span> <button type="button" className="underline" onClick={() => { void liveQuote.refetch(); }}>Try again</button></> : liveQuote.data?.voucherOutcome === "BETTER_OFFER" ? "A better offer was applied. Your voucher has not been used." : liveQuote.data?.offers.length ? `Applied: ${liveQuote.data.offers.map(offer => offer.title).join(", ")}.` : "Prices are checked again before confirmation."}</div>}
        {!isEmployee && (isPending || isRedirecting) && (
          <div
            className="fixed inset-0 z-[100] grid place-items-center bg-background/90 px-6 backdrop-blur-sm"
            role="status"
            aria-live="polite"
          >
            <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-xl">
              <div className="mb-5 flex items-center gap-3">
                <span className="h-9 w-9 animate-pulse rounded-full bg-primary/15 motion-reduce:animate-none" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3 w-3/4 animate-pulse rounded bg-primary/20 motion-reduce:animate-none" />
                  <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted motion-reduce:animate-none" />
                </div>
              </div>
              <p className="font-semibold text-foreground">
                {isRedirecting
                  ? "Opening payment instructions…"
                  : "Reserving your appointment…"}
              </p>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                {isRedirecting
                  ? "Your slot is held. Please keep this page open."
                  : "We’re checking availability and creating your payment hold."}
              </p>
              <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-2/3 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
              </div>
            </div>
          </div>
        )}
        {selectionSheetActive && <div className={redesignStyles.selectionSurface}>
          <ServicePicker redesign presentation="owner" form={form} services={services} packages={packages} categories={categories} saleEvents={saleEvents} businessSlug={businessSlug!} selectedDate={selectedDate} disabled={catalogPending || ownerSubmissionPending}
            selectionSheet={{ total: finalTotal, canContinue: canContinueWizard, onContinue: goToNextWizardStep }} />
          {catalogPending && <p className={redesignStyles.catalogLoading} role="status">Loading service catalog…</p>}
        </div>}
        <div className={cn("min-w-0 flex flex-1 flex-col gap-4 pb-2 sm:gap-6 sm:pb-4", owner && "gap-4 sm:gap-5")} style={selectionSheetActive ? { display: "none" } : undefined}>
          {/* Hidden Fields & Identification */}
          <FormField
            control={form.control}
            name="customerId"
            render={({ field }) => (
              <input type="hidden" {...field} value={field.value || ""} />
            )}
          />

          <div
            id="booking-wizard-progress"
            data-redesign-progress={redesign || undefined}
            className={cn("order-0 sticky top-[calc(var(--bf-header-h,0px)+0.5rem)] z-20 -mx-1 rounded-xl border border-primary/15 bg-background/95 px-3 py-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85", owner && "top-0 mx-0 rounded-[16px] border-[#E7E9E4] bg-[#FAFBF8] px-2 py-1.5 shadow-none backdrop-blur-none supports-[backdrop-filter]:bg-[#FAFBF8] sm:px-3 sm:py-2")}
          >
            {!owner && <div className="mb-1 flex min-h-6 items-center justify-between gap-3 px-1">
              <p className={cn("min-w-0 truncate text-xs font-semibold text-foreground", owner && "text-sm text-[#20211F]")}>
                <span className={cn("mr-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-primary", owner && "text-[#4D8F24]")}>
                  Step {activeWizardStep + 1}/{wizardSteps.length}
                </span>
                {wizardSteps[activeWizardStep].hint}
              </p>
              <span className="shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground">
                {Math.round(
                  ((activeWizardStep + 1) / wizardSteps.length) * 100,
                )}
                %
              </span>
            </div>}
            <div
              className="grid gap-1.5"
              style={{
                gridTemplateColumns: `repeat(${wizardSteps.length}, minmax(0, 1fr))`,
              }}
              role="list"
              aria-label="Booking progress"
            >
              {wizardSteps.map((item, index) => {
                const completed =
                  wizardStepComplete[index] && index < activeWizardStep;
                const accessible =
                  !(owner && catalogPending) &&
                  (index <= activeWizardStep || wizardStepComplete[index - 1]);
                return (
                  <button
                    key={item.label}
                    type="button"
                    disabled={!accessible}
                    onClick={() =>
                      accessible &&
                      revealWizardStep(
                        index,
                        index === wizardSteps.length - 1
                          ? "booking-review-step"
                          : undefined,
                      )
                    }
                    aria-current={
                      index === activeWizardStep ? "step" : undefined
                    }
                    className={cn(
                      "group min-h-11 min-w-0 cursor-pointer rounded-lg px-0.5 py-1 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed",
                      owner && "flex min-h-12 flex-col items-center justify-center py-0.5",
                      index === activeWizardStep && (owner ? "bg-[#EFF9E8]" : "bg-primary/8"),
                    )}
                  >
                    <span
                      className={cn(
                        "mx-auto mb-0.5 flex size-5 items-center justify-center rounded-full border text-[10px] font-bold transition-colors",
                        index === activeWizardStep
                          ? owner ? "border-[#20211F] bg-[#20211F] text-[#B9F379]" : "border-primary bg-primary text-primary-foreground"
                          : completed
                            ? owner ? "border-[#72CF35] bg-[#EFF9E8] text-[#315E18]" : "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground",
                      )}
                    >
                      {completed ? <Check className="size-3" /> : index + 1}
                    </span>
                    <span className={cn("block truncate text-[9px] font-semibold leading-3 text-muted-foreground sm:text-[10px]", owner && "text-[#343633]")}>
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {activeWizardStep > 0 && (!owner || !isLastWizardStep) && (
            <div
              className={cn("order-[1] space-y-2", owner && "flex flex-col gap-x-4 gap-y-0 space-y-0 border-b border-[#E7E9E4] px-1 sm:flex-row")}
              aria-label="Completed booking steps"
            >
              {wizardSteps.slice(0, activeWizardStep).map((step, index) => (
                <button
                  key={step.label}
                  type="button"
                  onClick={() => revealWizardStep(index)}
                  className={cn("group flex min-h-11 w-full cursor-pointer items-center gap-3 border-b border-border/60 px-1 py-2.5 text-left transition-colors hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2", owner && "min-w-0 flex-1 border-0 px-0 focus-visible:ring-[#72CF35] sm:w-auto")}
                >
                  <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary", owner && "size-5 bg-[#EFF9E8] text-[#315E18]")}>
                    <Check className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      {step.label}
                    </span>
                    <span className={cn("block truncate text-sm font-medium text-foreground", owner && "text-xs text-[#343633] sm:max-w-40")}>
                      {wizardStepSummaries[index]}
                    </span>
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground transition-colors group-hover:text-primary">
                    Edit
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Phone OTP Verification — public users only */}
          {!isEmployee && (
            <div
              className={cn(
                "order-[5] transition-all duration-300",
                activeWizardStep !== 0 && "hidden",
                isOtpVerified
                  ? "border-l-2 border-primary/30 pl-3"
                  : "border-border",
              )}
            >
              {/* Header */}
              <div className="mb-2 flex items-center gap-2">
                <div
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full transition-all duration-300",
                    isOtpVerified ? "bg-primary/15" : "bg-primary/10",
                  )}
                >
                  <ShieldCheck
                    className={cn(
                      "size-3.5",
                      isOtpVerified ? "text-primary" : "text-primary",
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold leading-none tracking-tight">
                    {isOtpVerified ? "Identity Verified" : "Verify Your Number"}
                  </h3>
                  <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                    {isOtpVerified
                      ? "One-time verification complete"
                      : "Required to confirm your booking"}
                  </p>
                </div>
                {isOtpVerified && (
                  <span className="shrink-0 text-[10px] font-bold text-primary bg-primary/15 border border-primary/20 px-2 py-1 rounded-full uppercase tracking-wide">
                    Verified
                  </span>
                )}
              </div>

              {isOtpVerified ? (
                <div className="space-y-3 animate-in fade-in duration-200">
                  {/* Verified identity card */}
                  <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-white/70 p-3">
                    <div className="flex items-center justify-center w-9 h-9 rounded-full bg-primary/15 shrink-0">
                      {otpCustomerName ? (
                        <span className="text-sm font-bold text-primary">
                          {otpCustomerName.charAt(0).toUpperCase()}
                        </span>
                      ) : (
                        <Phone className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {otpCustomerName && (
                        <p className="text-sm font-semibold text-foreground truncate">
                          {otpCustomerName}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {otpPhone}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setOtpTier(null);
                        setOtpVerificationId(undefined);
                        setOtpVerificationToken(undefined);
                        setOtpSent(false);
                        setOtpCode("");
                        setOtpError(null);
                        setOtpPhone("");
                        setOtpCustomerName(undefined);
                        setOtpCustomerEmail(undefined);
                        setOtpPrefilled(false);
                        form.setValue("customerName", "", {
                          shouldValidate: false,
                        });
                        form.setValue("email", "", { shouldValidate: false });
                        form.setValue("phone", "", { shouldValidate: false });
                      }}
                      className="shrink-0 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 cursor-pointer transition-colors"
                    >
                      Change
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {!otpTier && (
                    <>
                      <p className="text-xs leading-5 text-muted-foreground">
                        Enter your mobile number to receive a verification code.
                      </p>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium select-none pointer-events-none">
                            +63
                          </span>
                          <input
                            type="tel"
                            value={otpPhone}
                            onChange={(e) => {
                              setOtpPhone(e.target.value);
                              setOtpError(null);
                            }}
                            onKeyDown={(e) =>
                              e.key === "Enter" && handleCheckTrust()
                            }
                            placeholder="9XX XXX XXXX"
                            className="flex h-11 w-full rounded-lg border border-input bg-background pl-11 pr-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-manipulation"
                          />
                        </div>
                        <Button
                          type="button"
                          onClick={handleCheckTrust}
                          disabled={!otpPhone.trim() || isCheckingTrust}
                          className="h-11 px-5 shrink-0 cursor-pointer"
                        >
                          {isCheckingTrust ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Continue"
                          )}
                        </Button>
                      </div>
                    </>
                  )}

                  {otpTier === "RESTRICTED" && (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-1">
                      <p className="text-sm font-semibold text-destructive">
                        Account Restricted
                      </p>
                      <p className="text-sm text-destructive/80">
                        Your account has been flagged due to missed
                        appointments. Please contact the business directly to
                        book.
                      </p>
                    </div>
                  )}

                  {otpTier && otpTier !== "RESTRICTED" && (
                    <div className="space-y-2 animate-in fade-in duration-200">
                      <div className="flex min-h-9 items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm text-muted-foreground">
                          Sending to{" "}
                          <span className="font-semibold text-foreground">
                            {otpPhone}
                          </span>
                        </span>
                      </div>

                      {!otpSent ? (
                        <Button
                          type="button"
                          onClick={handleSendOtp}
                          disabled={isSendingOtp || otpCooldown > 0}
                          className="w-full h-11 cursor-pointer"
                        >
                          {isSendingOtp ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Sending code…
                            </>
                          ) : otpCooldown > 0 ? (
                            `Resend in ${otpCooldown}s`
                          ) : (
                            "Send verification code"
                          )}
                        </Button>
                      ) : (
                        <div className="space-y-1.5">
                          <p className="text-[11px] leading-4 text-muted-foreground">
                            Enter the 6-digit code we sent you:
                          </p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={6}
                              value={otpCode}
                              onChange={(e) => {
                                setOtpCode(e.target.value.replace(/\D/g, ""));
                                setOtpError(null);
                              }}
                              onKeyDown={(e) =>
                                e.key === "Enter" && handleVerifyOtp()
                              }
                              placeholder="· · · · · ·"
                              className="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-center font-mono text-base tracking-[0.35em] ring-offset-background placeholder:text-muted-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-manipulation"
                            />
                            <Button
                              type="button"
                              onClick={handleVerifyOtp}
                              disabled={otpCode.length < 6 || isVerifyingOtp}
                              className="h-11 shrink-0 cursor-pointer px-4"
                            >
                              {isVerifyingOtp ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                "Verify"
                              )}
                            </Button>
                          </div>
                          <button
                            type="button"
                            onClick={handleSendOtp}
                            disabled={isSendingOtp || otpCooldown > 0}
                            className="text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {otpCooldown > 0
                              ? `Resend in ${otpCooldown}s`
                              : "Didn't receive it? Resend"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {otpError && (
                    <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
                      <p className="text-xs text-destructive">{otpError}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {canAccessStep5 && (
            <div
              className={cn(
                "order-50 space-y-4 py-1 sm:py-2 animate-in fade-in duration-200",
                activeWizardStep !== (isEmployee ? 2 : 3) && "hidden",
              )}
            >
              {owner ? <StepHeader step={3} eyebrow="Who" title="Customer details" icon={User2} owner /> : <div className="flex items-center gap-2.5 mb-3 sm:mb-4">
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 shrink-0">
                  <span className="text-xs font-bold text-primary">
                    {isEmployee ? 3 : 4}
                  </span>
                </div>
                <h3 className="font-semibold text-lg tracking-tight flex-1">
                  {isEmployee ? "Customer Details" : "Your Details"}
                </h3>
                {!isEmployee && otpPrefilled && (
                  <span className="text-[10px] font-semibold text-primary/80 bg-primary/8 border border-primary/20 px-2 py-0.5 rounded-full uppercase tracking-wide">
                    Auto-filled
                  </span>
                )}
              </div>}

              {isEmployee ? (
                // Staff path: single CustomerPicker handles all three modes
                // (existing / new / anonymous walk-in). The picker writes back
                // into form fields via handlePickerChange so submission stays
                // unchanged downstream.
                <div className={cn("space-y-2", owner && "rounded-[20px] border border-[#E7E9E4] bg-[#FAFBF8] p-3 sm:p-5")}>
                  <FormLabel className={cn(owner && "text-xs font-bold uppercase tracking-[0.1em] text-[#696C67]")}>Customer</FormLabel>
                  <CustomerPicker
                    presentation={presentation}
                    businessSlug={businessSlug!}
                    value={pickerValue}
                    onChange={handlePickerChange}
                  />
                  {/* Surface the form's customerName error if the picker is
                      empty when the user tries to advance/submit. */}
                  <FormField
                    control={form.control}
                    name="customerName"
                    render={() => (
                      <FormItem>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ) : (
                // Public path: unchanged. Name input here, plus the email/phone
                // FormFields below.
                <FormField
                  control={form.control}
                  name="customerName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        Full Name
                        {otpPrefilled && otpCustomerName && (
                          <span className="text-[9px] font-semibold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                            Pre-filled
                          </span>
                        )}
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter your full name"
                          className={cn(
                            otpPrefilled && otpCustomerName && field.value
                              ? "border-primary/30 bg-primary/[0.04] focus-visible:ring-primary/30"
                              : "",
                          )}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Email + Phone fields — public-only. Staff fields are inside
                  the CustomerPicker for the "new" mode. */}
              {!isEmployee && (
                <>
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => {
                      const isPrefilled = otpPrefilled && !!otpCustomerEmail;
                      return (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1.5">
                            Email
                            {isPrefilled && (
                              <span className="text-[9px] font-semibold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                                Pre-filled
                              </span>
                            )}
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="email@example.com"
                              className={cn(
                                isPrefilled && field.value
                                  ? "border-primary/30 bg-primary/[0.04] focus-visible:ring-primary/30"
                                  : "",
                              )}
                              {...field}
                            />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">
                            Optional — we&apos;ll send your booking confirmation
                            here.
                          </p>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Number</FormLabel>
                        {isOtpVerified ? (
                          <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-2.5">
                            <Phone className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span className="text-sm font-medium text-primary">
                              {otpPhone}
                            </span>
                            <span className="ml-auto text-[10px] font-semibold text-primary bg-primary/15 px-1.5 py-0.5 rounded-full">
                              Verified
                            </span>
                          </div>
                        ) : (
                          <>
                            <FormControl>
                              <Input
                                type="tel"
                                placeholder="+63 9XX XXX XXXX"
                                {...field}
                              />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              Optional — so we can contact you if we need to
                              clarify your booking.
                            </p>
                            <FormMessage />
                          </>
                        )}
                      </FormItem>
                    )}
                  />
                </>
              )}
            </div>
          )}

          {/* Pending Flows / Upsells */}
          {canAccessStep5 && pendingFlows.length > 0 && (
            <div
              className={cn(
                "order-[55] space-y-3 animate-in fade-in duration-200",
                activeWizardStep !== (isEmployee ? 2 : 3) && "hidden",
              )}
            >
              {pendingFlows.map((flow, idx) => (
                <div
                  key={idx}
                  className="bg-primary/[0.04] hover:bg-primary/[0.06] transition-colors border border-primary/20 rounded-xl p-4 relative overflow-hidden group"
                >
                  <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                    <Sparkles className="w-20 h-20 text-primary" />
                  </div>

                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-3">
                      <Badge
                        variant="outline"
                        className="bg-white/80 text-primary border-primary/20 shadow-sm backdrop-blur-sm"
                      >
                        Recommendation
                      </Badge>
                      <span className="text-xs text-primary/80 font-medium">
                        Based on visit{" "}
                        {format(new Date(flow.lastServiceDate), "MMM d")}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-sm mb-4">
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-primary/70 mb-0.5">
                          Suggested Service
                        </span>
                        <span className="font-bold text-foreground text-lg leading-tight">
                          {flow.suggestedServiceName}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium">
                        {(() => {
                          const today = new Date();
                          const dueDate = new Date(flow.dueDate);
                          today.setHours(0, 0, 0, 0);
                          dueDate.setHours(0, 0, 0, 0);

                          const diffDays = Math.floor(
                            (today.getTime() - dueDate.getTime()) /
                              (1000 * 60 * 60 * 24),
                          );
                          const isOverdue = diffDays > 0;

                          return isOverdue ? (
                            <span className="text-amber-700 flex items-center gap-1.5 bg-amber-50 px-2.5 py-1.5 rounded-md border border-amber-200/60 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/40">
                              <Calendar className="w-3.5 h-3.5" />
                              Overdue by {diffDays}{" "}
                              {diffDays === 1 ? "day" : "days"}
                            </span>
                          ) : (
                            <span className="text-primary flex items-center gap-1.5 bg-primary/10 px-2.5 py-1.5 rounded-md">
                              <Calendar className="w-3.5 h-3.5" />
                              Due {format(dueDate, "MMMM d")}
                            </span>
                          );
                        })()}
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-primary/20 shadow-lg transition-all active:scale-95"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const currentServices =
                            form.getValues("services") || [];
                          const serviceToAdd = {
                            id: flow.suggestedServiceId,
                            name: flow.suggestedServiceName,
                            price: flow.suggestedServicePrice,
                            duration: flow.suggestedServiceDuration,
                            quantity: 1,
                          };

                          if (
                            !currentServices.some(
                              (s: SelectedService) => s.id === serviceToAdd.id,
                            )
                          ) {
                            form.setValue("services", [
                              ...currentServices,
                              serviceToAdd,
                            ]);
                            toast.success(`Added ${flow.suggestedServiceName}`);
                          } else {
                            toast.info("Already selected");
                          }
                        }}
                      >
                        Add to Booking
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div
            className={cn(
              "order-20 space-y-6 py-1 sm:py-2 transition-all",
              activeWizardStep !== (isEmployee ? 1 : 2) && "hidden",
              !canAccessStep2 && "pointer-events-none opacity-50",
            )}
          >
            <div className={cn("space-y-4", owner && "rounded-[20px] border border-[#E7E9E4] bg-[#FAFBF8] p-3 sm:p-5")}>
              <StepHeader
                step={isEmployee ? 2 : 3}
                eyebrow="When"
                title="Choose date and time"
                icon={CalendarCheck}
                owner={owner}
              />

              {!canAccessStep2 && (
                <p className="rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Select at least one service first to unlock date selection.
                </p>
              )}

              {canAccessStep2 ? (
                <FormField
                  control={form.control}
                  name="scheduledAt"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormControl>
                        <div className={cn("space-y-2", owner && "space-y-3")}>
                          {(() => {
                            const today = new Date();
                            const tomorrow = new Date(today);
                            tomorrow.setDate(tomorrow.getDate() + 1);
                            const isCustomDate =
                              !effectiveIsWalkIn &&
                              !!selectedDate &&
                              toPHDateString(selectedDate) !==
                                toPHDateString(today) &&
                              toPHDateString(selectedDate) !==
                                toPHDateString(tomorrow);

                            return (
                              <DatePicker
                                active={!owner || ownerFormOpen}
                                presentation={presentation}
                                value={field.value as Date | undefined}
                                onChange={(date: Date | undefined) => {
                                  if (effectiveIsWalkIn) handleWalkInToggle();
                                  field.onChange(date);
                                  form.setValue("selectedTime", undefined);
                                }}
                                minDate={new Date()}
                                maxDate={maxBookingDate}
                                dayCapacity={dayCapacity}
                                triggerLabel={
                                  isCustomDate && selectedDate
                                    ? format(selectedDate, "EEE, MMM d")
                                    : "Other date"
                                }
                                triggerAriaLabel={
                                  isCustomDate && selectedDate
                                    ? `Change date, currently ${format(selectedDate, "MMMM d, yyyy")}`
                                    : "Choose another date within the booking window"
                                }
                                triggerClassName={cn(
                                  "h-11 text-sm",
                                  owner && "h-14 text-sm font-semibold",
                                  isCustomDate &&
                                    (owner ? "border-[#72CF35] bg-[#EFF9E8] text-[#20211F] hover:bg-[#E4F5D8]" : "border-primary bg-primary/[0.06] text-primary hover:bg-primary/10 hover:text-primary"),
                                )}
                              />
                            );
                          })()}
                          <div
                            className={cn(
                              "grid overflow-hidden rounded-lg border border-border/60 bg-muted/40 p-0.5",
                              owner && "gap-1.5 rounded-[14px] border-0 bg-[#F1F2EF] p-1.5",
                              isEmployee
                                ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                                : "grid-cols-2",
                            )}
                          >
                            {["today", "tomorrow"].map((quickDate) => {
                              const date = new Date();
                              if (quickDate === "tomorrow") {
                                date.setDate(date.getDate() + 1);
                              }
                              const isSelected =
                                !effectiveIsWalkIn &&
                                selectedDate &&
                                toPHDateString(selectedDate) ===
                                  toPHDateString(date);
                              const isOutsideBookingWindow =
                                date.getTime() > maxBookingDate.getTime();

                              return (
                                <Button
                                  key={quickDate}
                                  type="button"
                                  variant="ghost"
                                  disabled={isOutsideBookingWindow}
                                  aria-pressed={!!isSelected}
                                  className={cn(
                                    "h-9 rounded-md px-2 text-xs font-medium shadow-none sm:text-sm",
                                    owner && "h-11 rounded-[10px] font-semibold focus-visible:ring-[#72CF35]",
                                    isSelected
                                      ? owner ? "bg-[#20211F] text-white hover:bg-[#343633] hover:text-white" : "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                                      : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
                                  )}
                                  onClick={() => {
                                    if (effectiveIsWalkIn) handleWalkInToggle();
                                    field.onChange(date);
                                    form.setValue("selectedTime", undefined);
                                  }}
                                >
                                  {quickDate === "today" ? "Today" : "Tomorrow"}
                                </Button>
                              );
                            })}
                            {isEmployee ? (
                              <label
                                className={cn(
                                  "ml-0.5 flex h-9 cursor-pointer items-center gap-2 border-l border-border/70 px-2.5 transition-colors",
                                  owner && "h-11 rounded-[10px] border-l-0 px-2 text-xs font-semibold",
                                  effectiveIsWalkIn
                                    ? owner ? "bg-[#20211F] text-white" : "bg-primary/[0.08] text-primary"
                                    : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
                                )}
                              >
                                <span className="whitespace-nowrap text-xs font-medium">
                                  Walk-in
                                </span>
                                <Switch
                                  checked={effectiveIsWalkIn}
                                  onCheckedChange={handleWalkInToggle}
                                  aria-label="Walk-in booking"
                                />
                              </label>
                            ) : null}
                          </div>
                        </div>
                      </FormControl>
                      {effectiveIsWalkIn ? (
                        <p className="text-xs font-medium text-primary">
                          Starts now. No date or time needed.
                        </p>
                      ) : null}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <div className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
                  Date selection is locked until services are selected.
                </div>
              )}
            </div>
          </div>

          {/* Service Selection */}
          <div
            className={cn(
              "order-10 space-y-4 py-1 sm:py-2",
              activeWizardStep !== (isEmployee ? 0 : 1) && "hidden",
            )}
          >
            {redesign ? <div className={redesignStyles.intro}><h3>Choose services</h3><p>Select treatments for this appointment.</p></div> : <StepHeader
              step={isEmployee ? 1 : 2}
              eyebrow="What"
              title="Choose services"
              icon={Sparkles}
              count={selectedServices.length || undefined}
              showDivider={false}
              owner={owner}
            />}
            <FormField
              control={form.control}
              name="services"
              render={() => (
                <FormItem>
                  <FormControl>
                    {selectionSheetActive ? <span /> : owner && catalogPending ? <OwnerBookingCatalogSkeleton /> : <ServicePicker
                      redesign={redesign}
                      presentation={presentation}
                      form={form}
                      services={services}
                      packages={packages}
                      categories={categories}
                      saleEvents={saleEvents}
                      businessSlug={businessSlug!}
                      selectedDate={selectedDate}
                    />}
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {owner && selectedServices.length > 0 && (
              <section aria-label="Selected treatments" className="space-y-2 border-t border-[#E7E9E4] pt-3 lg:hidden">
                <div className="flex items-baseline justify-between gap-3"><h4 className="text-sm font-bold text-[#20211F]">Selected treatments</h4><span className="font-mono text-xs text-[#696C67]">{totalSelectedServiceUnits} units</span></div>
                <SelectedServiceList form={form} services={selectedServices} presentation="owner" />
              </section>
            )}
          </div>

          {canAccessStep3 && !effectiveIsWalkIn && selectedDate && (
            <>
              <motion.div
                ref={slotSectionRef}
                // Key drives a one-shot horizontal shake when SLOT_JUST_TAKEN
                // fires. Reduced-motion users see no movement (animate target
                // collapses to a static x:0). The animate object is recreated
                // on every shake bump so framer replays it.
                animate={
                  slotTakenShakeKey === 0 || reducedMotion
                    ? { x: 0 }
                    : { x: [0, -6, 6, -4, 4, -2, 2, 0] }
                }
                transition={{ duration: 0.45, ease: "easeOut" }}
                className={cn(
                  "order-30 space-y-4 py-1 sm:py-2 animate-in fade-in duration-200",
                  activeWizardStep !== (isEmployee ? 1 : 2) && "hidden",
                )}
              >
                <div className={cn("flex items-center justify-between gap-3 border-t border-border/60 pt-5", owner && "border-[#E7E9E4]")}>
                  <div className="flex items-center gap-2">
                    <Clock className={cn("size-4 text-primary", owner && "text-[#315E18]")} />
                    <h3 className={cn("font-semibold text-foreground", owner && "text-[#20211F]")}>
                      Available times
                    </h3>
                  </div>
                  <Badge
                    variant="secondary"
                    className={cn("bg-primary/10 text-primary", owner && "bg-[#EFF9E8] text-[#315E18]")}
                  >
                    {timeSlots.filter((slot) => slot.available).length} open
                  </Badge>
                </div>

                <FormField
                  control={form.control}
                  name="selectedTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                        Available Slots
                      </FormLabel>
                      <FormControl>
                        <TimeSlotPicker
                          presentation={presentation}
                          slots={timeSlots}
                          alternativeSlots={alternativeSlots}
                          value={field.value}
                          onChange={(time: Date) => {
                            field.onChange(time);
                            revealWizardStep(isEmployee ? 2 : 3);
                          }}
                          isLoading={isLoadingSlots}
                          disabled={selectedServices.length === 0}
                          emptyTitle={slotEmptyState.title}
                          emptyDescription={slotEmptyState.description}
                          timezone={bookingPolicy?.timezone}
                          isPublic={!isEmployee}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </motion.div>
            </>
          )}

          {canAccessStep3 && effectiveIsWalkIn && (
            <div
              className={cn(
                "order-30 py-1 text-sm text-muted-foreground sm:py-2",
                activeWizardStep !== (isEmployee ? 1 : 2) && "hidden",
              )}
            >
              <p className="font-medium text-foreground">Walk-in appointment</p>
              <p>Walk-in mode uses immediate start time automatically.</p>
            </div>
          )}

          {canAccessStep4 &&
            (effectiveIsWalkIn || selectedTime) &&
            !isEmployee && (
              <div
                className={cn(
                  "order-40 space-y-4 py-1 animate-in fade-in duration-200 sm:py-2",
                  activeWizardStep !== 3 && "hidden",
                )}
              >
                <StepHeader
                  step={4}
                  eyebrow="Who"
                  title="Preferred staff"
                  icon={User2}
                />

                <FormField
                  control={form.control}
                  name="employeeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <EmployeeSelect
                          employees={employees}
                          value={field.value}
                          onChange={field.onChange}
                          isLoading={isLoadingEmployees}
                          serviceCategories={selectedServiceCategories}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {selectedEmployeeId && (
                  <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-3 text-sm">
                    <div>
                      <p className="font-medium text-foreground">
                        Require selected staff
                      </p>
                      <p className="text-xs text-muted-foreground">
                        If enabled, booking fails when this staff member is
                        unavailable.
                      </p>
                    </div>
                    <Checkbox
                      checked={requireSelectedStaff}
                      onCheckedChange={(checked) =>
                        setRequireSelectedStaff(checked === true)
                      }
                    />
                  </div>
                )}
              </div>
            )}

          {canAccessStep4 &&
            (effectiveIsWalkIn || selectedTime) &&
            claimStepEnabled &&
            selectedServices.length > 0 && (
              <div
                className={cn(
                  "order-40 space-y-2 py-1 animate-in fade-in duration-200 sm:py-2",
                  owner && "order-[55]",
                  activeWizardStep !== (isEmployee ? 2 : 3) && "hidden",
                )}
              >
                <div className={cn("flex items-center justify-between gap-2", owner && "border-t border-[#E7E9E4] pt-5")}>
                  <div className="flex items-center gap-2">
                    <div className={cn("flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10", owner && "size-9 rounded-xl bg-[#EFF9E8]")}>
                      <span className="text-[11px] font-bold text-primary">
                        {isEmployee ? 3 : 4}
                      </span>
                    </div>
                    <h3 className={cn("text-base font-semibold tracking-tight", owner && "text-[#20211F]")}>
                      Claim Services
                    </h3>
                  </div>
                  <Badge
                    variant={
                      claimedUniqueIds.length > 0 ? "default" : "secondary"
                    }
                    className="h-5 px-2 text-[10px] font-semibold"
                  >
                    {claimedUniqueIds.length}/{totalSelectedServiceUnits}{" "}
                    claimed
                  </Badge>
                </div>

                <ServiceClaimSelector
                  presentation={presentation}
                  services={selectedServices.flatMap((s) =>
                    Array.from({
                      length: Math.floor(Number(s.quantity) || 1),
                    }).map((_, i) => ({
                      id: s.id,
                      uniqueId: buildServiceClaimUniqueId(s, i),
                      name: s.name,
                      price: s.price,
                      duration: s.duration ?? null,
                      quantity: 1,
                    })),
                  )}
                  claimedUniqueIds={claimedUniqueIds}
                  onChange={setClaimedUniqueIds}
                />
              </div>
            )}

          {canReviewAndConfirm && (
            <div
              id="booking-review-step"
              className={cn(
                "order-[60] scroll-mt-[calc(var(--bf-header-h,0px)+10rem)] space-y-3 py-1 animate-in fade-in duration-200 sm:py-2",
                activeWizardStep !== wizardSteps.length - 1 && "hidden",
              )}
            >
              <BookingCheckoutReview
                presentation={presentation}
                key={activeWizardStep}
                serviceCount={totalSelectedServiceUnits}
                schedule={scheduleSummary}
                staff={selectedEmployeeName || "Any available staff"}
                customer={customerNameValue || "Customer details"}
                contact={
                  [customerPhoneInput?.trim() || otpPhone.trim(), customerEmailInput?.trim()]
                    .filter(Boolean)
                    .join(" · ") ||
                  (pickerValue?.mode === "anonymous"
                    ? "Anonymous walk-in"
                    : "No contact details")
                }
                onEdit={(target) =>
                  revealWizardStep(
                    target === "services"
                      ? isEmployee
                        ? 0
                        : 1
                      : target === "schedule"
                        ? isEmployee
                          ? 1
                          : 2
                        : isEmployee
                          ? 2
                          : 3,
                  )
                }
                servicesContent={
                  <SelectedServiceList form={form} services={selectedServices} presentation={presentation} />
                }
                paymentControls={
                  <div className="space-y-3">
                    {!isGcashConfigured && (
                      <div
                        className="flex gap-2 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-xs leading-5 text-destructive"
                        role="alert"
                      >
                        <AlertCircle className="mt-0.5 size-4 shrink-0" />
                        <span>
                          Online booking is temporarily unavailable because
                          this salon has not configured its GCash account.
                        </span>
                      </div>
                    )}
                    {isEmployee && (
                      <>
                        <FormField
                          control={form.control}
                          name="paymentMethod"
                          render={({ field }) => (
                            <FormItem className="space-y-1">
                              <FormLabel className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                Payment
                              </FormLabel>
                              <FormControl>
                                <SegmentedToggle options={paymentMethodOptions} value={field.value} onChange={field.onChange} className="w-full" />
                              </FormControl>
                              {owner && <p className="text-[11px] text-[#696C67]">Online payments use GCash or Maya.</p>}
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="paymentType"
                          render={({ field }) => (
                            <FormItem className="space-y-1">
                              <FormLabel className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                Amount
                              </FormLabel>
                              <FormControl>
                                <SegmentedToggle options={paymentTypeOptions} value={field.value} onChange={field.onChange} className="w-full" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    )}
                    {hasActivePromos && (
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                          Voucher
                        </label>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Code"
                            value={voucherCode}
                            onChange={(event) =>
                              setVoucherCode(event.target.value.toUpperCase())
                            }
                            disabled={
                              !!appliedVoucher ||
                              isVerifyingVoucher ||
                              !hasReviewedDetails
                            }
                            className="h-9 uppercase"
                          />
                          {appliedVoucher ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={clearVoucher}
                              className="size-9 shrink-0"
                            >
                              <X className="size-3.5" />
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              onClick={handleVerifyVoucher}
                              disabled={
                                isVerifyingVoucher ||
                                !voucherCode.trim() ||
                                !hasReviewedDetails
                              }
                              className="h-9 shrink-0 px-3 text-xs"
                            >
                              {isVerifyingVoucher ? "…" : "Apply"}
                            </Button>
                          )}
                        </div>
                        {voucherError && (
                          <p className="text-xs text-destructive">{voucherError}</p>
                        )}
                        {appliedVoucher && (
                          <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                            <Ticket className="size-3.5" />
                            {appliedVoucher.code} · −₱
                            {appliedVoucher.discountAmount.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                }
                subtotal={total}
                discount={voucherDiscountAmount}
                balance={
                  paymentType === "DOWNPAYMENT"
                    ? finalTotal - finalAmountToPay
                    : undefined
                }
                dueNow={totalWithFee}
                totalLabel={paymentType === "DOWNPAYMENT" ? "Due now" : "Total"}
                action={
                  <Button
                    disabled={isSubmitDisabled || isCheckingDuplicate}
                    type="submit"
                    className="hidden h-11 w-full font-semibold lg:flex"
                  >
                    {isPending || isCheckingDuplicate
                      ? "Processing..."
                      : paymentMethod === "CASH"
                        ? "Confirm Booking"
                        : "Reserve & Pay"}
                  </Button>
                }
                confirmation={
                  <div
                    ref={reviewConfirmationRef}
                    className={cn(
                      "scroll-mb-28 scroll-mt-28 border-t border-border/70 pt-3 transition-colors",
                      showReviewGuidance &&
                        !hasReviewedDetails &&
                        "border-amber-400",
                    )}
                  >
                    <label
                      htmlFor="confirm-booking-details"
                      className="flex min-h-10 cursor-pointer items-center gap-2.5"
                    >
                      <Checkbox
                        id="confirm-booking-details"
                        checked={hasReviewedDetails}
                        onCheckedChange={(checked) => {
                          const confirmed = checked === true;
                          setHasReviewedDetails(confirmed);
                          if (confirmed) setShowReviewGuidance(false);
                        }}
                        aria-describedby="confirm-booking-help"
                        className="size-5 shrink-0"
                      />
                      <span>
                        <span className="block text-xs font-semibold">Details are correct</span>
                        <span id="confirm-booking-help" className="block text-[10px] text-muted-foreground">
                          Ready to submit
                        </span>
                      </span>
                    </label>
                    {showReviewGuidance && !hasReviewedDetails && (
                      <p className="mt-1.5 pl-8 text-xs text-amber-800" role="alert">
                        Confirm these details to continue.
                      </p>
                    )}
                  </div>
                }
              />

              <div className="hidden overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex min-h-10 items-center justify-between border-b bg-muted/25 px-3 py-2">
                  <p className="text-sm font-semibold">Booking details</p>
                  <Badge variant="secondary" className="h-5 px-2 text-[10px]">{totalSelectedServiceUnits} selected</Badge>
                </div>

                <div className="divide-y divide-border/70">
                  <section className="px-3 py-2" aria-labelledby="review-services-heading">
                    <div className="flex min-h-9 items-center justify-between gap-3">
                      <h4 id="review-services-heading" className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Services</h4>
                      <Button type="button" variant="ghost" size="icon" onClick={() => revealWizardStep(isEmployee ? 0 : 1)} aria-label="Edit services" title="Edit services" className="-mr-2 size-11 cursor-pointer text-muted-foreground hover:text-foreground"><Pencil className="size-3.5" /></Button>
                    </div>
                    <ul className="space-y-1">
                      {selectedServices.map((service, index) => (
                        <li key={`${service.id}-${service.packageId ?? "service"}-${index}`} className="flex items-start justify-between gap-3 text-xs leading-5">
                          <span className="min-w-0 truncate font-medium">{service.name}<span className="ml-1 text-muted-foreground">×{service.quantity || 1}</span></span>
                          <span className="shrink-0 tabular-nums">₱{((service.price || 0) * (service.quantity || 1)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section className="px-3 py-2" aria-labelledby="review-schedule-heading">
                    <div className="flex min-h-11 items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h4 id="review-schedule-heading" className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Schedule</h4>
                        <p className="mt-0.5 truncate text-xs font-medium">{effectiveIsWalkIn ? "Walk-in · now" : selectedDate && selectedTime ? `${format(selectedDate, "EEE, MMM d, yyyy")} · ${selectedTime.toLocaleTimeString("en-US", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", hour12: true })}` : "Not selected"}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{selectedEmployeeName || "Any available staff"}</p>
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => revealWizardStep(isEmployee ? 1 : 2)} aria-label="Edit schedule" title="Edit schedule" className="-mr-2 size-11 cursor-pointer text-muted-foreground hover:text-foreground"><Pencil className="size-3.5" /></Button>
                    </div>
                  </section>

                  <section className="px-3 py-2" aria-labelledby="review-customer-heading">
                    <div className="flex min-h-11 items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h4 id="review-customer-heading" className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Customer</h4>
                        <p className="mt-0.5 truncate text-xs font-medium">{customerNameValue || "Customer details"}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{[customerPhoneInput?.trim() || otpPhone.trim(), customerEmailInput?.trim()].filter(Boolean).join(" · ") || (pickerValue?.mode === "anonymous" ? "Anonymous walk-in" : "No contact details")}</p>
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => revealWizardStep(isEmployee ? 2 : 3)} aria-label="Edit customer details" title="Edit customer details" className="-mr-2 size-11 cursor-pointer text-muted-foreground hover:text-foreground"><Pencil className="size-3.5" /></Button>
                    </div>
                  </section>

                  <section className="flex items-center justify-between gap-4 bg-muted/30 px-3 py-2.5" aria-label="Payment summary">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{paymentType === "DOWNPAYMENT" ? "Due now" : "Total"}</p>
                      <p className="text-[11px] text-muted-foreground">{paymentMethod === "CASH" ? "Cash" : "Online"}</p>
                    </div>
                    <p className="text-xl font-bold tabular-nums text-primary">₱{totalWithFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </section>
                </div>
              </div>

              {isEmployee && selectedEmployeeId && (
                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-3 text-sm">
                  <div>
                    <p className="font-medium text-foreground">
                      Require selected staff
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Keep off to allow fallback to any available provider.
                    </p>
                  </div>
                  <Checkbox
                    checked={requireSelectedStaff}
                    onCheckedChange={(checked) =>
                      setRequireSelectedStaff(checked === true)
                    }
                  />
                </div>
              )}

              <div
                className={cn(
                  "hidden scroll-mb-28 scroll-mt-28 rounded-2xl border-2 bg-card transition-colors duration-200 motion-reduce:transition-none",
                  hasReviewedDetails
                    ? "border-primary bg-primary/[0.05]"
                    : showReviewGuidance
                      ? "border-amber-500 bg-amber-50 ring-4 ring-amber-500/15"
                      : "border-primary/35 bg-primary/[0.03]",
                )}
              >
                <label htmlFor="legacy-confirm-booking-details" className="flex min-h-14 cursor-pointer items-start gap-2.5 p-3">
                  <Checkbox
                    id="legacy-confirm-booking-details"
                    checked={hasReviewedDetails}
                    onCheckedChange={(checked) => {
                      const confirmed = checked === true;
                      setHasReviewedDetails(confirmed);
                      if (confirmed) setShowReviewGuidance(false);
                    }}
                    aria-describedby="confirm-booking-help"
                    className="mt-0.5 size-5 shrink-0 focus-visible:ring-4 focus-visible:ring-primary/30"
                  />
                  <span>
                    <span className="block text-sm font-semibold leading-5">Details are correct</span>
                    <span id="confirm-booking-help" className="block text-xs leading-4 text-muted-foreground">Services, schedule, customer, and payment confirmed.</span>
                  </span>
                </label>
                {showReviewGuidance && !hasReviewedDetails && (
                  <p className="border-t border-amber-300 px-4 py-3 text-sm font-medium text-amber-900" role="alert">Check this box to continue with your booking.</p>
                )}
              </div>
              <p className="sr-only" aria-live="polite">{showReviewGuidance && !hasReviewedDetails ? "Review confirmation is required before booking." : hasReviewedDetails ? "Booking details confirmed. Final submission is ready." : ""}</p>
            </div>
          )}

          <div className={cn("order-[70] hidden items-end justify-between gap-3 border-t border-border/70 pt-5 lg:flex", owner && "sticky bottom-0 z-20 -mx-1 border-[#E7E9E4] bg-white/95 px-1 pb-2 backdrop-blur") }>
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                setActiveWizardStep((step) => Math.max(0, step - 1))
              }
              disabled={activeWizardStep === 0}
              className="h-11 cursor-pointer px-3 disabled:invisible"
            >
              <ArrowLeft className="mr-2 size-4" />
              Back
            </Button>
            {!isLastWizardStep && !redesign && (
              <div className="text-right">
                {!canContinueWizard && (
                  <p
                    className="mb-1.5 text-xs text-muted-foreground"
                    aria-live="polite"
                  >
                    {activeWizardStep === 0 && !isEmployee
                      ? "Verify your mobile number to continue."
                      : activeWizardStep === (isEmployee ? 0 : 1)
                        ? "Select at least one service to continue."
                        : activeWizardStep === (isEmployee ? 1 : 2)
                          ? "Choose both a date and an available time."
                          : "Complete the required customer details."}
                  </p>
                )}
                <Button
                  type="button"
                  size="lg"
                  onClick={goToNextWizardStep}
                  disabled={!canContinueWizard}
                  className={cn("h-11 min-w-32 cursor-pointer shadow-sm", owner && "min-w-40 rounded-full bg-[#20211F] text-white shadow-none hover:bg-[#343633] focus-visible:ring-3 focus-visible:ring-[#72CF35]")}
                >
                  Continue
                  <ArrowRight className="ml-2 size-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {selectionSheetActive ? null : redesign && !isLastWizardStep ? (
          <aside aria-label="Booking summary" className={redesignStyles.summary}>
            <div className={designStyles.summaryTop}>
              <div><h2>Your selection</h2><p>Everything for this visit.</p></div>
              <Image src="/hanaylo/hero-nail-polish-v1.png" width={1254} height={1254} sizes="95px" alt="" aria-hidden="true" className={designStyles.polish} />
            </div>
            <div className={redesignStyles.summaryBody}>
              <div className={designStyles.summaryLabel}><span>Treatments</span><span>{totalSelectedServiceUnits} items</span></div>
              <div className={redesignStyles.selected}>
                {selectedServices.length ? <SelectedServiceList form={form} services={selectedServices} presentation="owner" /> : <div className={designStyles.empty}><Sparkles size={25} aria-hidden="true" /><h3>No services selected</h3><p>Add a treatment to begin.</p></div>}
              </div>
              <div className={designStyles.nextDetails}>
                <div><span><Calendar size={15} aria-hidden="true" /> Schedule</span><small>{scheduleSummary}</small></div>
                <div><span><User2 size={15} aria-hidden="true" /> Customer</span><small>{pickerValue?.mode === "anonymous" ? pickerValue.label || "Anonymous walk-in" : customerNameValue || "Add later"}</small></div>
              </div>
              {voucherDiscountAmount > 0 && <p>Voucher discount: ₱{voucherDiscountAmount.toLocaleString()}</p>}
              <div className={designStyles.total}><div><span>Estimated total</span><small>{totalSelectedServiceUnits} items selected</small></div><strong>₱{finalTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
              <button type="button" className={designStyles.continue} disabled={!canContinueWizard} onClick={goToNextWizardStep}>Continue to {wizardSteps[activeWizardStep + 1].label.toLowerCase()} <ArrowRight size={18} aria-hidden="true" /></button>
            </div>
          </aside>
        ) : owner && !isLastWizardStep && (
          <aside aria-label="Booking summary" className="hidden min-w-0 lg:block lg:w-[272px] lg:shrink-0 xl:w-[300px]">
            <div className="sticky top-3 overflow-hidden rounded-[20px] border border-[#DDE2D7] bg-[#F7F8F4] shadow-[0_10px_28px_rgba(32,33,31,0.06)]">
              <div className="flex items-center gap-2.5 bg-[#20211F] px-3.5 py-3 text-white"><span className="grid size-8 place-items-center rounded-lg bg-[#B9F379] text-[#20211F]"><Sparkles className="size-4" aria-hidden="true" /></span><div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60">In progress</p><h3 className="text-base font-bold tracking-[-0.025em]">Booking summary</h3></div></div>
              <div className="space-y-3 p-3">
                <section>
                  <div className="mb-1.5 flex items-center justify-between gap-2"><p className="flex items-center gap-1.5 text-xs font-bold text-[#343633]"><Sparkles className="size-3.5 text-[#4D842D]" aria-hidden="true" />Treatments</p><span className="font-mono text-[11px] text-[#696C67]">{totalSelectedServiceUnits} units</span></div>
                  {selectedServices.length ? <div className="max-h-[min(42dvh,380px)] space-y-1.5 overflow-y-auto pr-0.5"><SelectedServiceList form={form} services={selectedServices} presentation="owner" /></div> : <p className="rounded-xl border border-dashed border-[#DDE0D9] bg-white px-3 py-3 text-xs text-[#81847E]">Choose a treatment to begin.</p>}
                </section>
                <section className="border-t border-[#E1E5DC] pt-2.5"><p className="flex items-center gap-1.5 text-xs font-bold text-[#343633]"><Calendar className="size-3.5 text-[#4D842D]" aria-hidden="true" />Schedule</p><p className="mt-1 break-words text-xs text-[#5E625B]">{scheduleSummary}</p></section>
                <section className="border-t border-[#E1E5DC] pt-2.5"><p className="flex items-center gap-1.5 text-xs font-bold text-[#343633]"><User2 className="size-3.5 text-[#4D842D]" aria-hidden="true" />Customer</p><p className="mt-1 break-words text-xs text-[#5E625B]">{pickerValue?.mode === "anonymous" ? pickerValue.label || "Anonymous walk-in" : customerNameValue || "Add customer details"}</p></section>
                {voucherDiscountAmount > 0 && <div className="flex items-center justify-between gap-2 border-t border-[#E1E5DC] pt-2.5 text-xs text-[#315E18]"><span className="flex items-center gap-1.5"><Ticket className="size-3.5" aria-hidden="true" />Voucher discount</span><span className="font-mono tabular-nums">−₱{voucherDiscountAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>}
              </div>
              <div className="flex items-baseline justify-between gap-2 border-t border-[#D5E5C9] bg-[#EEF7E7] px-3.5 py-3 text-[#20211F]"><span className="text-xs font-semibold">Estimated total</span><strong className="font-mono text-lg tabular-nums">₱{finalTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            </div>
          </aside>
        )}

        {!owner && !isLastWizardStep && (
        <aside className="w-full lg:w-[320px] lg:shrink-0 xl:w-[360px]" aria-label="Booking summary">
          <div className="lg:sticky lg:top-[calc(var(--bf-header-h,0px)+1rem)] lg:self-start">
            <div className="border-y border-border/70 bg-transparent lg:flex lg:max-h-[calc(100dvh-var(--bf-header-h,0px)-2rem)] lg:flex-col lg:overflow-hidden lg:rounded-2xl lg:border lg:bg-card lg:shadow-sm">
              <div className="border-b border-border/70 py-3 lg:shrink-0 lg:px-4">
                <div className="flex items-center justify-between text-base">
                  <span className="font-bold">Booking Summary</span>
                  {selectedServices.length > 0 && (
                    <Badge
                      variant="secondary"
                      className="font-medium text-xs bg-primary/10 text-primary border-primary/20"
                    >
                      {selectedServices.length}{" "}
                      {selectedServices.length === 1 ? "service" : "services"}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="space-y-4 py-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-4 lg:py-4">
                <div className="max-h-[180px] overflow-y-auto pr-1 sm:max-h-[240px] lg:max-h-none lg:overflow-visible lg:pr-0">
                  <SelectedServiceList
                    form={form}
                    services={selectedServices}
                  />
                </div>

                {selectedServices.length > 0 && (
                  <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
                    {selectedServices.some(
                      (s) =>
                        s.slotsRemaining !== null &&
                        s.slotsRemaining !== undefined &&
                        s.slotsRemaining > 0 &&
                        s.slotsRemaining <= 3,
                    ) && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
                        <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>
                          Limited promo slots remaining — complete your booking
                          to secure the sale price.
                        </span>
                      </div>
                    )}

                    {canReviewAndConfirm && isLastWizardStep && (
                      <div className="space-y-3 border-t border-border/60 pt-3">
                        <FormField
                          control={form.control}
                          name="paymentMethod"
                          render={({ field }) => (
                            <FormItem className="space-y-1.5">
                              <FormLabel className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                Payment Method
                              </FormLabel>
                              <FormControl>
                                <SegmentedToggle
                                  options={paymentMethodOptions}
                                  value={field.value}
                                  onChange={field.onChange}
                                  className="w-full"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {!isEmployee &&
                          (gcash?.accountName && gcash.mobileNumber ? (
                            <div className="border-y border-primary/15 bg-primary/[0.035] py-3 lg:rounded-xl lg:border lg:p-3">
                              <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-3 lg:grid-cols-1">
                                {gcash.qrImageUrl ? (
                                  <div className="w-full space-y-2 lg:mx-auto lg:max-w-[180px]">
                                    <div className="overflow-hidden rounded-xl border border-border/70 bg-white p-2">
                                      <Image
                                        src={gcash.qrImageUrl}
                                        alt={`GCash QR code for ${gcash.accountName}`}
                                        width={720}
                                        height={720}
                                        unoptimized
                                        className="aspect-square w-full object-contain"
                                      />
                                    </div>
                                    <Button
                                      asChild
                                      type="button"
                                      variant="outline"
                                      className="h-9 w-full rounded-lg bg-white px-2 text-xs"
                                    >
                                      <a
                                        href={`/api/public/gcash-qr?businessSlug=${encodeURIComponent(businessSlug)}`}
                                        download
                                      >
                                        <Download className="mr-1.5 size-3.5" />
                                        Save QR
                                      </a>
                                    </Button>
                                  </div>
                                ) : null}
                                <div className="min-w-0 space-y-2 pt-0.5">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                                    20% GCash deposit
                                  </p>
                                  <div>
                                    <p className="text-sm font-semibold text-foreground">
                                      {gcash.accountName}
                                    </p>
                                    <p className="font-mono text-xs text-muted-foreground">
                                      {gcash.mobileNumber}
                                    </p>
                                  </div>
                                  {gcash.instructions ? (
                                    <p className="text-xs leading-5 text-muted-foreground">
                                      {gcash.instructions}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                              Online booking is temporarily unavailable because
                              this salon has not configured its GCash account.
                            </div>
                          ))}

                        {isEmployee && (
                          <FormField
                            control={form.control}
                            name="paymentType"
                            render={({ field }) => (
                              <FormItem className="space-y-1.5">
                                <FormLabel className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                  Payment Type
                                </FormLabel>
                                <FormControl>
                                  <SegmentedToggle
                                    options={paymentTypeOptions}
                                    value={field.value}
                                    onChange={field.onChange}
                                    className="w-full"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}

                        {hasActivePromos && (
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                              Voucher Code
                            </label>
                            <div className="flex gap-2">
                              <Input
                                placeholder="Enter code"
                                value={voucherCode}
                                onChange={(e) =>
                                  setVoucherCode(e.target.value.toUpperCase())
                                }
                                disabled={
                                  !!appliedVoucher ||
                                  isVerifyingVoucher ||
                                  !hasReviewedDetails
                                }
                                className="uppercase bg-background h-9 font-medium tracking-wide"
                              />
                              {appliedVoucher ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  onClick={clearVoucher}
                                  disabled={!hasReviewedDetails}
                                  className="shrink-0 h-9 w-9 text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600 transition-colors"
                                >
                                  <X className="size-4" />
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  onClick={handleVerifyVoucher}
                                  disabled={
                                    isVerifyingVoucher ||
                                    !voucherCode.trim() ||
                                    !hasReviewedDetails
                                  }
                                  className="shrink-0 h-9 px-4 font-medium"
                                >
                                  {isVerifyingVoucher ? "..." : "Apply"}
                                </Button>
                              )}
                            </div>

                            {voucherError && (
                              <p className="text-xs text-red-500 font-medium animate-in slide-in-from-left-1">
                                {voucherError}
                              </p>
                            )}

                            {appliedVoucher && (
                              <div className="flex items-center gap-2 text-xs text-primary bg-primary/10 px-2.5 py-1.5 rounded-md border border-primary/20">
                                <Ticket className="size-3.5 shrink-0" />
                                <span className="font-semibold tracking-wide">
                                  {appliedVoucher.code}
                                </span>
                                <span className="ml-auto font-bold tabular-nums">
                                  -₱
                                  {appliedVoucher.discountAmount.toLocaleString(
                                    undefined,
                                    {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    },
                                  )}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-2 border-t border-border/60 pt-3">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-medium tabular-nums">
                          ₱
                          {total.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>

                      {appliedVoucher && (
                        <div className="flex justify-between items-center text-sm text-primary">
                          <span className="flex items-center gap-1.5">
                            <Ticket className="w-3.5 h-3.5" /> Voucher Discount
                          </span>
                          <span className="font-medium tabular-nums">
                            -₱
                            {appliedVoucher.discountAmount.toLocaleString(
                              undefined,
                              {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              },
                            )}
                          </span>
                        </div>
                      )}

                      {paymentType === "DOWNPAYMENT" &&
                        (effectiveIsWalkIn || selectedTime) && (
                          <>
                            <div className="flex justify-between items-center text-xs text-muted-foreground">
                              <span>Balance (pay later)</span>
                              <span className="tabular-nums">
                                ₱
                                {(finalTotal - finalAmountToPay).toLocaleString(
                                  undefined,
                                  {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  },
                                )}
                              </span>
                            </div>
                          </>
                        )}

                      <div className="flex justify-between items-baseline pt-3 mt-1 border-t border-border/60">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                          {paymentType === "DOWNPAYMENT" ? "Due Now" : "Total"}
                        </span>
                        <span className="text-2xl font-bold text-primary tabular-nums tracking-tight">
                          ₱
                          {totalWithFee.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>

                      <Button
                        disabled={isSubmitDisabled || isCheckingDuplicate}
                        type="submit"
                        size="lg"
                        className="hidden w-full font-semibold shadow-lg shadow-primary/20 transition-all hover:shadow-primary/30 active:scale-[0.98] lg:flex mt-3"
                      >
                        {isPending || isCheckingDuplicate
                          ? "Processing..."
                          : paymentMethod === "CASH"
                            ? "Confirm Booking"
                            : "Reserve & Pay"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>
        )}

        <div
          style={selectionSheetActive ? { display: "none" } : undefined}
          className={cn(
            "z-40 border-t bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-sm supports-[backdrop-filter]:bg-background/80 lg:hidden",
            owner && "-mx-5 rounded-t-[18px] border-[#E7E9E4] bg-[#FAFBF8] px-5 pt-2 supports-[backdrop-filter]:bg-[#FAFBF8] md:-mx-6 md:px-6",
            usesFixedMobileActionBar
              ? "fixed inset-x-0 bottom-0"
              : "sticky bottom-0",
          )}
        >
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            {activeWizardStep > 0 && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() =>
                  setActiveWizardStep((step) => Math.max(0, step - 1))
                }
                aria-label="Go to previous booking step"
                className={cn("size-11 shrink-0", owner && "rounded-full border-[#DDE0D9] bg-white focus-visible:ring-[#72CF35]")}
              >
                <ArrowLeft className="size-4" />
              </Button>
            )}
            <div className={cn("min-w-0", owner && "flex-1")}>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {owner && !isLastWizardStep
                  ? `${totalSelectedServiceUnits} treatment unit${totalSelectedServiceUnits === 1 ? "" : "s"}`
                  : owner && isLastWizardStep
                  ? `${totalSelectedServiceUnits} treatment unit${totalSelectedServiceUnits === 1 ? "" : "s"} · Due now`
                  : isLastWizardStep
                  ? "Due Now"
                  : `Step ${activeWizardStep + 1} of ${wizardSteps.length}`}
              </p>
              <p className={cn("truncate text-base font-bold tabular-nums text-primary", owner && "text-[#20211F]")}>
                {owner && !isLastWizardStep
                  ? `₱${finalTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : isLastWizardStep
                  ? `₱${totalWithFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : wizardSteps[activeWizardStep].label}
              </p>
            </div>
            {isLastWizardStep ? (
              <Button
                disabled={
                  isSubmissionBlockedBeforeReview || isCheckingDuplicate
                }
                type={hasReviewedDetails ? "submit" : "button"}
                onClick={
                  hasReviewedDetails ? undefined : guideToReviewConfirmation
                }
                size="lg"
                className={cn("h-11 flex-1 font-semibold shadow-lg shadow-primary/20 transition-all hover:shadow-primary/30 active:scale-[0.98]", owner && "rounded-full bg-[#20211F] text-white shadow-none hover:bg-[#343633] focus-visible:ring-3 focus-visible:ring-[#72CF35]")}
              >
                {isPending || isCheckingDuplicate
                  ? "Processing..."
                  : !hasReviewedDetails
                    ? "Review & confirm"
                  : paymentMethod === "CASH"
                    ? "Confirm Booking"
                    : "Reserve & Pay"}
              </Button>
            ) : (
              <Button
                type="button"
                size="lg"
                onClick={goToNextWizardStep}
                disabled={!canContinueWizard}
                className={cn("h-11 flex-1 font-semibold", owner && "min-w-28 flex-none rounded-full bg-[#20211F] text-white hover:bg-[#343633] focus-visible:ring-3 focus-visible:ring-[#72CF35]")}
              >
                Continue
                <ArrowRight className="ml-2 size-4" />
              </Button>
            )}
          </div>
        </div>
      </form>

      {/* Duplicate-customer confirmation — staff-only. Defaults to "use existing"
          (safer for data quality); "create anyway" is the explicit override. */}
      <AlertDialog
        open={!!pendingDuplicate}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDuplicate(null);
            setPendingSubmitPayload(null);
          }
        }}
      >
        <AlertDialogContent className={cn("sm:max-w-md", owner && ownerStyles.form, owner && "rounded-[20px] border-[#E7E9E4] bg-white p-5 shadow-[0_24px_70px_rgba(23,24,23,0.2)] sm:p-6", staffDialogTheme)}>
          <AlertDialogHeader>
            <AlertDialogTitle>Possible duplicate customer</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {pendingDuplicate?.matchedOn === "phone"
                    ? "We found a customer with this phone number:"
                    : "We found a customer with this email:"}
                </p>
                {pendingDuplicate && (
                  <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      {pendingDuplicate.name}
                    </p>
                    {pendingDuplicate.phone && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Phone className="h-3 w-3" />
                        {pendingDuplicate.phone}
                      </p>
                    )}
                    {pendingDuplicate.email && (
                      <p className="text-xs text-muted-foreground truncate">
                        {pendingDuplicate.email}
                      </p>
                    )}
                  </div>
                )}
                {pendingDuplicate?.nameMismatch && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-2 leading-relaxed">
                    Heads-up: the name you typed doesn&apos;t match this record.
                    Double-check before linking.
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  Link this booking to the existing customer, or create a new
                  separate record anyway?
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="sm:order-1">Cancel</AlertDialogCancel>
            <button
              type="button"
              onClick={handleConfirmCreateAnyway}
              className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer sm:order-2"
            >
              Create new anyway
            </button>
            <AlertDialogAction
              onClick={handleConfirmUseExisting}
              className="sm:order-3"
            >
              Use existing customer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Form></BookingQuoteContext.Provider>
  );
}
