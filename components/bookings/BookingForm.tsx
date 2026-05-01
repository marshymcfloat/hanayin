"use client";

import {
  createBooking,
  CreateBookingResult,
} from "@/lib/server actions/booking";
import {
  getAvailableSlots,
  getAlternativeSlots,
  getAvailableProviders,
} from "@/lib/server actions/availability";
import { getBookingPolicy } from "@/lib/server actions/booking-policy";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type {
  Service,
  ServicePackage,
  PackageItem,
} from "@/prisma/generated/prisma/client";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createBookingSchema,
  CapacityOverrideReason,
  PaymentMethod,
  PaymentType,
  StaffSelectionMode,
} from "@/lib/zod schemas/bookings";
import { toast } from "sonner";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { verifyVoucherAction } from "@/lib/server actions/vouchers";
import { findDuplicateCustomerForBooking } from "@/lib/server actions/customer";
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

import { getActiveSaleEvents } from "@/lib/server actions/sale-event";
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
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Separator } from "../ui/separator";
import { Badge } from "../ui/badge";
import CustomerPicker, {
  type CustomerPickerValue,
} from "./CustomerPicker";
import ServiceSelect from "./ServiceSelect";
import SelectedServiceList from "./SelectedServiceList";
import DatePicker from "./DatePicker";
import TimeSlotPicker from "./TimeSlotPicker";
import EmployeeSelect from "./EmployeeSelect";
import ServiceClaimSelector from "./ServiceClaimSelector";
import { SegmentedToggle } from "../ui/segmented-toggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Checkbox } from "../ui/checkbox";

export type PackageWithItems = ServicePackage & {
  items: (PackageItem & { service: Service })[];
};

interface BookingFormProps {
  services: Service[];
  packages?: PackageWithItems[];
  categories: string[];
  isEmployee?: boolean;
  allowServiceClaim?: boolean;
  currentEmployeeId?: number;
  isModal?: boolean;
  mobileActionBarMode?: "auto" | "fixed" | "sticky";
  onSuccess?: () => void;
}

import {
  getCustomerPendingFlows,
  PendingFlow,
} from "@/lib/server actions/flow-actions";
import {
  resolveCustomerTrust,
  requestBookingOtp,
  verifyBookingOtp,
  type CustomerTrust,
} from "@/lib/server actions/booking-otp";
import { format } from "date-fns";
import { Sparkles, Calendar, Ticket, X, ShieldCheck, Phone, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BookingPolicy } from "@/lib/types/booking-policy";
import { getMaxBookingDate, getSlotEmptyState } from "./booking-form-utils";
import {
  buildServiceClaimUniqueId,
  capitalizeWords,
  maskEmail,
  toPHDateString,
} from "./booking-form-helpers";

type SelectedService = {
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

export default function BookingForm({
  services,
  packages = [],
  categories,
  isEmployee = false,
  allowServiceClaim = true,
  currentEmployeeId,
  isModal = false,
  mobileActionBarMode = "auto",
  onSuccess,
}: BookingFormProps) {
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
      paymentMethod: "CASH",

      paymentType: "FULL",
      staffSelectionMode: "ANY_AVAILABLE",
      email: "",
      phone: "",
    },
  });

  const params = useParams<{ businessSlug: string }>();
  const businessSlug = params.businessSlug;
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

  const [existingCustomerEmail, setExistingCustomerEmail] = useState<
    string | null
  >(null);
  const [existingCustomerPhone, setExistingCustomerPhone] = useState<
    string | null
  >(null);
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
  const [pendingSubmitPayload, setPendingSubmitPayload] = useState<
    Record<string, unknown> | null
  >(null);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);

  // --- Phone-first OTP verification (public bookings only) ---
  const [otpPhone, setOtpPhone] = useState("");
  const [otpTier, setOtpTier] = useState<CustomerTrust | null>(null);
  const [otpCustomerName, setOtpCustomerName] = useState<string | undefined>(undefined);
  const [otpCustomerEmail, setOtpCustomerEmail] = useState<string | undefined>(undefined);
  const [otpPrefilled, setOtpPrefilled] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpVerificationId, setOtpVerificationId] = useState<number | undefined>(undefined);
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
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCooldown]);

  const isOtpVerified = !!otpVerificationId || otpTier === "TRUSTED";
  // Public users must complete OTP before the rest of the form unlocks
  const isPublicVerified = isEmployee || isOtpVerified;

  const handleCheckTrust = useCallback(async () => {
    if (!otpPhone.trim() || !businessSlug) return;
    setIsCheckingTrust(true);
    setOtpError(null);
    setOtpTier(null);
    setOtpSent(false);
    setOtpVerificationId(undefined);
    setOtpCode("");
    try {
      const result = await resolveCustomerTrust(otpPhone.trim(), businessSlug);
      setOtpTier(result.tier);
      setOtpCustomerName(result.customerName);
      setOtpCustomerEmail(result.customerEmail);
      if (result.tier === "TRUSTED") {
        let prefilled = false;
        if (result.customerName) {
          form.setValue("customerName", result.customerName, { shouldValidate: true });
          prefilled = true;
        }
        if (result.customerEmail) {
          form.setValue("email", result.customerEmail, { shouldValidate: true });
          prefilled = true;
        }
        form.setValue("phone", otpPhone.trim(), { shouldValidate: true });
        if (prefilled) setOtpPrefilled(true);
      }
    } catch {
      setOtpError("Could not check your number. Please try again.");
    } finally {
      setIsCheckingTrust(false);
    }
  }, [otpPhone, businessSlug, form]);

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
    if (!otpPhone.trim() || !otpCode.trim() || !businessSlug || isVerifyingOtp) return;
    setIsVerifyingOtp(true);
    setOtpError(null);
    try {
      const result = await verifyBookingOtp(otpPhone.trim(), otpCode.trim(), businessSlug);
      if (result.success && result.verificationId) {
        setOtpVerificationId(result.verificationId);
        setOtpTier(result.customerTier ?? "NEW");
        form.setValue("phone", otpPhone.trim(), { shouldValidate: true });
        let prefilled = false;
        if (result.customerName) {
          setOtpCustomerName(result.customerName);
          form.setValue("customerName", result.customerName, { shouldValidate: true });
          prefilled = true;
        }
        if (result.customerEmail) {
          setOtpCustomerEmail(result.customerEmail);
          form.setValue("email", result.customerEmail, { shouldValidate: true });
          prefilled = true;
        }
        if (prefilled) setOtpPrefilled(true);
      } else {
        setOtpError(result.error ?? "Invalid code. Please try again.");
      }
    } catch {
      setOtpError("Verification failed. Please try again.");
    } finally {
      setIsVerifyingOtp(false);
    }
  }, [otpPhone, otpCode, businessSlug, form, isVerifyingOtp]);

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
        form.setValue("customerId", value.customer.id, { shouldValidate: true });
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
  const claimStepEnabled = isEmployee && allowServiceClaim;
  const effectiveIsWalkIn = isEmployee && isWalkIn;
  const [requireSelectedStaff, setRequireSelectedStaff] = useState(false);
  const [showCapacityOverrideForm, setShowCapacityOverrideForm] =
    useState(false);
  const [capacityOverrideReason, setCapacityOverrideReason] = useState<
    CapacityOverrideReason | ""
  >("");
  const [capacityOverrideNote, setCapacityOverrideNote] = useState("");
  const [hasReviewedDetails, setHasReviewedDetails] = useState(false);

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
      setShowCapacityOverrideForm(false);
      setCapacityOverrideReason("");
      setCapacityOverrideNote("");
    } else {
      form.setValue("scheduledAt", undefined);
      form.setValue("selectedTime", undefined);
      setShowCapacityOverrideForm(false);
      setCapacityOverrideReason("");
      setCapacityOverrideNote("");
    }
  }, [isWalkIn, form, isEmployee, bookingPolicy?.slotIntervalMinutes]);

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

  const finalTotal = useMemo(() => {
    if (appliedVoucher) {
      return Math.max(0, total - appliedVoucher.discountAmount);
    }
    return total;
  }, [total, appliedVoucher]);

  const voucherDiscountAmount = appliedVoucher?.discountAmount ?? 0;

  const finalAmountToPay = useMemo(() => {
    return calculateBookingTotal({
      subtotal: total,
      voucherDiscount: voucherDiscountAmount,
      paymentMethod: "CASH",
      paymentType,
    });
  }, [total, voucherDiscountAmount, paymentType]);

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
    });
  }, [total, voucherDiscountAmount, paymentMethod, paymentType]);

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
  }, [
    effectiveIsWalkIn,
    slotServiceKey,
    selectedDatePHString,
    selectedTimeKey,
    selectedEmployeeId,
    claimedUniqueIdsKey,
  ]);

  useEffect(() => {
    if (!effectiveIsWalkIn) {
      setShowCapacityOverrideForm(false);
      setCapacityOverrideReason("");
      setCapacityOverrideNote("");
    }
  }, [effectiveIsWalkIn]);

  const { mutate: createBookingAction, isPending } = useMutation({
    mutationFn: createBooking,
    onSuccess: (result: CreateBookingResult) => {
      if (!result) return;
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
        form.reset();
        setIsWalkIn(false); // Reset walk-in toggle
        setHasReviewedDetails(false);
        setClaimedUniqueIds([]);
        setPendingFlows([]);
        setExistingCustomerEmail(null);
        setExistingCustomerPhone(null);
        toast.success("Booking successfully created");

        if (onSuccess) {
          onSuccess();
        } else {
          router.back();
        }
        setShowCapacityOverrideForm(false);
        setCapacityOverrideReason("");
        setCapacityOverrideNote("");
        return;
      }

    },
    onError: (error) => {
      const code = error instanceof Error ? error.message : "";
      if (code === "OTP_REQUIRED" || code === "OTP_INVALID_OR_EXPIRED") {
        setOtpVerificationId(undefined);
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
        if (effectiveIsWalkIn && isEmployee) {
          setShowCapacityOverrideForm(true);
          toast.error(
            "No immediate walk-in capacity. Add an override reason to proceed if permitted.",
          );
          return;
        }
        toast.error("No immediate walk-in capacity right now.");
        return;
      }
      if (code === "CAPACITY_OVERRIDE_NOT_ALLOWED") {
        toast.error("You do not have permission to override walk-in capacity.");
        return;
      }
      if (code === "CAPACITY_OVERRIDE_REASON_REQUIRED") {
        toast.error(
          "Override reason is required to continue this walk-in booking.",
        );
        return;
      }
      if (code === "SLOT_JUST_TAKEN") {
        form.setValue("selectedTime", undefined);
        queryClient.invalidateQueries({
          queryKey: ["timeSlots", businessSlug],
        });
        toast.error(
          "That slot was just taken. We refreshed the latest available times.",
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
                const currentServices = form.getValues("services") as SelectedService[];
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
      toast.error("Failed to create booking");
      console.error("Booking creation failed:", error);
    },
  });

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

      // Log removed for privacy

      // Persist an exact slot time for scheduled bookings.
      const scheduledAt = effectiveIsWalkIn ? new Date() : data.selectedTime;
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

      const flatServicesPayload = data.services.flatMap((s: SelectedService) =>
        Array.from({ length: s.quantity || 1 }).map((_, i) => {
          const uniqueId = buildServiceClaimUniqueId(s, i);
          return {
            id: s.id,
            quantity: 1,
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
      const normalizedCapacityOverride =
        showCapacityOverrideForm && capacityOverrideReason
          ? {
              reason: capacityOverrideReason,
              note: capacityOverrideNote.trim() || undefined,
            }
          : undefined;

      const isAnonymousWalkIn =
        isEmployee && pickerValue?.mode === "anonymous";

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
        capacityOverride: normalizedCapacityOverride,
        otpVerificationId: isEmployee ? undefined : otpVerificationId,
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
        setIsCheckingDuplicate(true);
        findDuplicateCustomerForBooking({
          name: capitalizedCustomerName,
          email: data.email?.trim() || undefined,
          phone: data.phone?.trim() || undefined,
        })
          .then((result) => {
            setIsCheckingDuplicate(false);
            if (result.success && result.data) {
              // Pause submission, show the dialog. Stash the payload so we
              // can re-fire it after staff resolves the dialog.
              setPendingDuplicate(result.data);
              setPendingSubmitPayload({ ...submitPayload });
              return;
            }
            // No duplicate (or lookup failed) — proceed.
            createBookingAction(submitPayload);
          })
          .catch(() => {
            setIsCheckingDuplicate(false);
            // Don't block the booking on a dedup-check failure — the server
            // will fall through to its own silent-link logic which is the
            // pre-existing behavior.
            createBookingAction(submitPayload);
          });
        return;
      }

      createBookingAction(submitPayload);
    },
    [
      businessSlug,
      effectiveIsWalkIn,
      isEmployee,
      claimStepEnabled,
      claimedUniqueIds,
      currentEmployeeId,
      createBookingAction,
      appliedVoucher,
      bookingPolicy?.slotIntervalMinutes,
      selectedEmployeeId,
      requireSelectedStaff,
      showCapacityOverrideForm,
      capacityOverrideReason,
      capacityOverrideNote,
      otpPhone,
      otpVerificationId,
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
    createBookingAction(payload as Parameters<typeof createBookingAction>[0]);
  }, [
    pendingDuplicate,
    pendingSubmitPayload,
    handlePickerChange,
    createBookingAction,
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
    createBookingAction(payload as Parameters<typeof createBookingAction>[0]);
  }, [pendingSubmitPayload, createBookingAction]);

  const isSubmitDisabled =
    isPending ||
    !form.formState.isValid ||
    (!selectedTime && !effectiveIsWalkIn) ||
    selectedServices.length === 0 ||
    !hasReviewedDetails ||
    (showCapacityOverrideForm && !capacityOverrideReason);

  const isStep1Complete = selectedServices.length > 0;
  const isStep2Complete = effectiveIsWalkIn || !!selectedDate;
  const isStep3Complete = effectiveIsWalkIn || !!selectedTime;
  const customerNameValue = (customerNameInput || "").trim();
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
  const currentStep = !isStep1Complete
    ? 1
    : !isStep2Complete
      ? 2
      : !isStep3Complete
        ? 3
        : !canAccessStep4
          ? 4
          : !isCustomerDetailsComplete
            ? 5
            : 6;
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
    // Public customers always pay at the salon (CASH); no online payment
    if (!isEmployee) {
      return [
        {
          value: "CASH" as const,
          label: "Pay at salon",
          disabled: !hasReviewedDetails,
        },
      ];
    }
    return [
      {
        value: "CASH" as const,
        label: "Cash",
        disabled: !hasReviewedDetails,
      },
      {
        value: "ONLINE" as const,
        label: "Paid Online (GCash / Maya)",
        disabled: !hasReviewedDetails,
      },
    ];
  }, [isEmployee, hasReviewedDetails]);

  const paymentTypeOptions = useMemo(() => {
    if (isEmployee) {
      return [
        {
          value: "FULL" as const,
          label: "Full",
          disabled: !hasReviewedDetails,
        },
        {
          value: "DOWNPAYMENT" as const,
          label: `${bookingPolicy?.downpaymentPercentage ?? 50}%`,
          disabled: !hasReviewedDetails,
        },
      ];
    }

    const allowsFull = bookingPolicy?.allowPublicFullPayment ?? true;
    const allowsDownpayment = bookingPolicy?.allowPublicDownpayment ?? true;
    return [
      {
        value: "FULL" as const,
        label: "Full",
        disabled: !hasReviewedDetails || !allowsFull,
      },
      {
        value: "DOWNPAYMENT" as const,
        label: `${bookingPolicy?.downpaymentPercentage ?? 50}%`,
        disabled: !hasReviewedDetails || !allowsDownpayment,
      },
    ];
  }, [hasReviewedDetails, isEmployee, bookingPolicy]);

  useEffect(() => {
    if (isEmployee || !bookingPolicy) return;
    const currentType = form.getValues("paymentType") as PaymentType;
    const allowsFull = bookingPolicy.allowPublicFullPayment;
    const allowsDownpayment = bookingPolicy.allowPublicDownpayment;

    if (
      (currentType === "FULL" && allowsFull) ||
      (currentType === "DOWNPAYMENT" && allowsDownpayment)
    ) {
      return;
    }

    const fallback =
      bookingPolicy.defaultPublicPaymentType === "DOWNPAYMENT" &&
      allowsDownpayment
        ? "DOWNPAYMENT"
        : allowsFull
          ? "FULL"
          : allowsDownpayment
            ? "DOWNPAYMENT"
            : "FULL";

    form.setValue("paymentType", fallback, { shouldValidate: true });
  }, [bookingPolicy, form, isEmployee]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn(
          "relative flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8",
          usesFixedMobileActionBar
            ? "pb-[calc(10rem+env(safe-area-inset-bottom))] sm:pb-[calc(11rem+env(safe-area-inset-bottom))] lg:pb-0"
            : "pb-0",
        )}
      >
        <div className={cn("flex flex-col gap-4 pb-4 sm:pb-4 lg:pb-4")}>
          {/* Hidden Fields & Identification */}
          <FormField
            control={form.control}
            name="customerId"
            render={({ field }) => (
              <input type="hidden" {...field} value={field.value || ""} />
            )}
          />

          <div className="order-0 rounded-2xl border bg-card/90 p-4 shadow-sm sm:p-5">
            {/* Step progress bar */}
            {(() => {
              const steps = [
                ...(!isEmployee ? [{ step: 0, label: "Verify", done: isOtpVerified }] : []),
                { step: 1, label: "Services", done: isStep1Complete },
                { step: 2, label: "Date & Time", done: isStep3Complete },
                { step: 3, label: claimStepEnabled ? "Claim" : "Staff", done: canAccessStep4 },
                { step: 4, label: "Details", done: isCustomerDetailsComplete },
                { step: 5, label: "Confirm", done: hasReviewedDetails },
              ];
              const doneCount = steps.filter((s) => s.done).length;
              const pct = Math.round((doneCount / steps.length) * 100);
              return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Booking Progress
                    </span>
                    <span className="text-xs font-bold text-primary">{pct}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {steps.map((item) => (
                      <span
                        key={item.step}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition-all duration-200",
                          item.done
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : currentStep === item.step
                              ? "border-primary/40 bg-primary/10 text-primary shadow-sm"
                              : "border-zinc-200 bg-white text-zinc-400",
                        )}
                      >
                        {item.done && (
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 12 12">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                        {item.step === 0 ? item.label : `${item.step}. ${item.label}`}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Phone OTP Verification — public users only */}
          {!isEmployee && (
            <div
              className={cn(
                "order-[5] rounded-2xl border bg-card/90 p-4 shadow-sm sm:p-5 transition-all duration-300",
                isOtpVerified
                  ? "border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-card"
                  : "border-border",
              )}
            >
              {/* Header */}
              <div className="flex items-center gap-2.5 mb-4">
                <div className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-full shrink-0 transition-all duration-300",
                  isOtpVerified ? "bg-emerald-100" : "bg-primary/10",
                )}>
                  <ShieldCheck className={cn("h-4 w-4", isOtpVerified ? "text-emerald-600" : "text-primary")} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base tracking-tight leading-none">
                    {isOtpVerified ? "Identity Verified" : "Verify Your Number"}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isOtpVerified
                      ? otpTier === "TRUSTED" ? "Returning customer — no code needed" : "One-time verification complete"
                      : "Required to confirm your booking"}
                  </p>
                </div>
                {isOtpVerified && (
                  <span className="shrink-0 text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-1 rounded-full uppercase tracking-wide">
                    {otpTier === "TRUSTED" ? "Trusted" : "Verified"}
                  </span>
                )}
              </div>

              {isOtpVerified ? (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  {/* Verified identity card */}
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-white/70 p-3">
                    <div className="flex items-center justify-center w-9 h-9 rounded-full bg-emerald-100 shrink-0">
                      {otpCustomerName ? (
                        <span className="text-sm font-bold text-emerald-700">
                          {otpCustomerName.charAt(0).toUpperCase()}
                        </span>
                      ) : (
                        <Phone className="h-4 w-4 text-emerald-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {otpCustomerName && (
                        <p className="text-sm font-semibold text-foreground truncate">{otpCustomerName}</p>
                      )}
                      <p className="text-xs text-muted-foreground">{otpPhone}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setOtpTier(null);
                        setOtpVerificationId(undefined);
                        setOtpSent(false);
                        setOtpCode("");
                        setOtpError(null);
                        setOtpPhone("");
                        setOtpCustomerName(undefined);
                        setOtpCustomerEmail(undefined);
                        setOtpPrefilled(false);
                        form.setValue("customerName", "", { shouldValidate: false });
                        form.setValue("email", "", { shouldValidate: false });
                        form.setValue("phone", "", { shouldValidate: false });
                      }}
                      className="shrink-0 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 cursor-pointer transition-colors"
                    >
                      Change
                    </button>
                  </div>
                  {otpCustomerName && (
                    <p className="text-xs text-emerald-700 font-medium pl-0.5">
                      Welcome back, {otpCustomerName.split(" ")[0]}! Your details have been pre-filled below.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {!otpTier && (
                    <>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Enter your mobile number to continue. Returning customers skip verification automatically.
                      </p>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium select-none pointer-events-none">
                            +63
                          </span>
                          <input
                            type="tel"
                            value={otpPhone}
                            onChange={(e) => { setOtpPhone(e.target.value); setOtpError(null); }}
                            onKeyDown={(e) => e.key === "Enter" && handleCheckTrust()}
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
                      <p className="text-sm font-semibold text-destructive">Account Restricted</p>
                      <p className="text-sm text-destructive/80">
                        Your account has been flagged due to missed appointments.
                        Please contact the business directly to book.
                      </p>
                    </div>
                  )}

                  {otpTier === "NEW" && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="flex items-center gap-2 rounded-lg bg-muted/40 border px-3 py-2">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm text-muted-foreground">
                          Sending to <span className="font-semibold text-foreground">{otpPhone}</span>
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
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending code…</>
                          ) : otpCooldown > 0 ? (
                            `Resend in ${otpCooldown}s`
                          ) : (
                            "Send verification code"
                          )}
                        </Button>
                      ) : (
                        <div className="space-y-2.5">
                          <p className="text-xs text-muted-foreground">Enter the 6-digit code we sent you:</p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={6}
                              value={otpCode}
                              onChange={(e) => { setOtpCode(e.target.value.replace(/\D/g, "")); setOtpError(null); }}
                              onKeyDown={(e) => e.key === "Enter" && handleVerifyOtp()}
                              placeholder="· · · · · ·"
                              className="flex h-12 w-full rounded-lg border border-input bg-background px-4 py-2 text-center text-lg tracking-[0.5em] font-mono ring-offset-background placeholder:text-muted-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-manipulation"
                            />
                            <Button
                              type="button"
                              onClick={handleVerifyOtp}
                              disabled={otpCode.length < 6 || isVerifyingOtp}
                              className="h-12 px-5 shrink-0 cursor-pointer"
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
                            {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : "Didn't receive it? Resend"}
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
            <div className="order-50 space-y-4 rounded-2xl border bg-card/90 p-4 shadow-sm sm:p-5 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 shrink-0">
                  <span className="text-xs font-bold text-primary">4</span>
                </div>
                <h3 className="font-semibold text-lg tracking-tight flex-1">
                  Your Details
                </h3>
                {!isEmployee && otpPrefilled && (
                  <span className="text-[10px] font-semibold text-primary/80 bg-primary/8 border border-primary/20 px-2 py-0.5 rounded-full uppercase tracking-wide">
                    Auto-filled
                  </span>
                )}
              </div>

              {!isEmployee && otpPrefilled && (
                <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <p className="text-xs text-primary/80 leading-relaxed">
                    We pre-filled your details from a previous booking. Feel free to update anything that&apos;s changed.
                  </p>
                </div>
              )}

              {isEmployee ? (
                // Staff path: single CustomerPicker handles all three modes
                // (existing / new / anonymous walk-in). The picker writes back
                // into form fields via handlePickerChange so submission stays
                // unchanged downstream.
                <div className="space-y-2">
                  <FormLabel>Customer</FormLabel>
                  <CustomerPicker
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
                          <span className="text-[9px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                            Pre-filled
                          </span>
                        )}
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter your full name"
                          className={cn(
                            otpPrefilled && otpCustomerName && field.value
                              ? "border-emerald-300 bg-emerald-50/30 focus-visible:ring-emerald-400/50"
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
                              <span className="text-[9px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                                Pre-filled
                              </span>
                            )}
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="email@example.com"
                              className={cn(
                                isPrefilled && field.value
                                  ? "border-emerald-300 bg-emerald-50/30 focus-visible:ring-emerald-400/50"
                                  : "",
                              )}
                              {...field}
                            />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">
                            Optional — we&apos;ll send your booking confirmation here.
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
                          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/40 px-3 py-2.5">
                            <Phone className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            <span className="text-sm font-medium text-emerald-800">{otpPhone}</span>
                            <span className="ml-auto text-[10px] font-semibold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                              Verified
                            </span>
                          </div>
                        ) : (
                          <>
                            <FormControl>
                              <Input type="tel" placeholder="+63 9XX XXX XXXX" {...field} />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              Optional — so we can contact you if we need to clarify your booking.
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
            <div className="order-[55] space-y-3 animate-in fade-in slide-in-from-top-4 duration-500">
              {pendingFlows.map((flow, idx) => (
                <div
                  key={idx}
                  className="bg-indigo-50/50 hover:bg-indigo-50/80 transition-colors border border-indigo-200/60 rounded-xl p-4 relative overflow-hidden group"
                >
                  <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                    <Sparkles className="w-20 h-20 text-indigo-900" />
                  </div>

                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-3">
                      <Badge
                        variant="outline"
                        className="bg-white/80 text-indigo-700 border-indigo-200 shadow-sm backdrop-blur-sm"
                      >
                        Recommendation
                      </Badge>
                      <span className="text-xs text-indigo-600/80 font-medium">
                        Based on visit{" "}
                        {format(new Date(flow.lastServiceDate), "MMM d")}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-sm mb-4">
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-indigo-700/70 mb-0.5">
                          Suggested Service
                        </span>
                        <span className="font-bold text-indigo-950 text-lg leading-tight">
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
                            <span className="text-orange-600 flex items-center gap-1.5 bg-orange-50 px-2.5 py-1.5 rounded-md border border-orange-100/50">
                              <Calendar className="w-3.5 h-3.5" />
                              Overdue by {diffDays}{" "}
                              {diffDays === 1 ? "day" : "days"}
                            </span>
                          ) : (
                            <span className="text-indigo-600 flex items-center gap-1.5 bg-indigo-100/50 px-2.5 py-1.5 rounded-md">
                              <Calendar className="w-3.5 h-3.5" />
                              Due {format(dueDate, "MMMM d")}
                            </span>
                          );
                        })()}
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200/50 shadow-lg transition-all active:scale-95"
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
              "order-20 space-y-6 rounded-2xl border bg-card/90 p-4 shadow-sm transition-all duration-300 sm:p-5",
              !canAccessStep2 && "pointer-events-none opacity-50",
            )}
          >
            <div className="space-y-4">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 shrink-0">
                  <span className="text-xs font-bold text-primary">2</span>
                </div>
                <h3 className="font-semibold text-lg tracking-tight">
                  Date
                </h3>
              </div>

              {!canAccessStep2 && (
                <p className="rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Select at least one service first to unlock date selection.
                </p>
              )}

              {isEmployee && (
                <div className="flex items-center justify-between rounded-2xl border bg-secondary/20 p-4 shadow-sm">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-semibold text-foreground">
                      Book for right now
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      Time-shortcut for walk-ins — skips date/time picker.
                      Customer info is still collected above.
                    </p>
                  </div>
                  <div
                    role="switch"
                    aria-checked={effectiveIsWalkIn}
                    aria-label="Book for right now"
                    tabIndex={0}
                    className={cn(
                      "w-12 h-7 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300",
                      effectiveIsWalkIn
                        ? "bg-primary"
                        : "bg-muted-foreground/30",
                    )}
                    onClick={handleWalkInToggle}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        handleWalkInToggle();
                      }
                    }}
                  >
                    <div
                      className={cn(
                        "bg-white w-5 h-5 rounded-full shadow-sm transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]",
                        effectiveIsWalkIn ? "translate-x-5" : "translate-x-0",
                      )}
                    />
                  </div>
                </div>
              )}

              {!effectiveIsWalkIn && canAccessStep2 ? (
                <>
                  <FormField
                    control={form.control}
                    name="scheduledAt"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                          Date
                        </FormLabel>
                        <FormControl>
                          <DatePicker
                            value={field.value as Date | undefined}
                            onChange={(date: Date | undefined) => {
                                field.onChange(date);
                                form.setValue("selectedTime", undefined);
                              }}
                            minDate={new Date()}
                            maxDate={maxBookingDate}
                            placeholder="Pick a date"
                          />
                        </FormControl>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {Array.from({
                            length: bookingV2Enabled
                              ? Math.min(5, bookingHorizonDays)
                              : 1,
                          }).map((_, index) => {
                            const date = new Date();
                            date.setDate(date.getDate() + index);
                            return (
                              <Button
                                key={date.toISOString()}
                                type="button"
                                variant={
                                  selectedDate &&
                                  toPHDateString(selectedDate) ===
                                    toPHDateString(date)
                                    ? "default"
                                    : "outline"
                                }
                                size="sm"
                                className="h-8 px-3 text-xs"
                                onClick={() => {
                                  field.onChange(date);
                                  form.setValue("selectedTime", undefined);
                                }}
                              >
                                {index === 0
                                  ? "Today"
                                  : index === 1
                                    ? "Tomorrow"
                                    : format(date, "EEE, MMM d")}
                              </Button>
                            );
                          })}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {bookingV2Enabled
                            ? `Booking window: up to ${bookingHorizonDays} day${bookingHorizonDays > 1 ? "s" : ""} ahead.`
                            : "Booking window: today only for this business."}
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              ) : effectiveIsWalkIn ? (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
                  Booking will start immediately at the next available slot.
                </div>
              ) : (
                <div className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
                  Date selection is locked until services are selected.
                </div>
              )}
            </div>
          </div>

          {/* Service Selection */}
          <div className="order-10 space-y-4 rounded-2xl border bg-card/90 p-4 shadow-sm sm:p-5">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 shrink-0">
                <span className="text-xs font-bold text-primary">1</span>
              </div>
              <h3 className="font-semibold text-lg tracking-tight">
                Services
              </h3>
            </div>

            <FormField
              control={form.control}
              name="services"
              render={() => (
                <FormItem>
                  <FormControl>
                    <ServiceSelect
                      form={form}
                      services={services}
                      packages={packages}
                      categories={categories}
                      saleEvents={saleEvents}
                      businessSlug={businessSlug!}
                      selectedDate={selectedDate}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {canAccessStep3 && !effectiveIsWalkIn && selectedDate && (
            <>
              <div className="order-30 space-y-4 rounded-2xl border bg-card/90 p-4 shadow-sm sm:p-5 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 shrink-0">
                    <span className="text-xs font-bold text-primary">3</span>
                  </div>
                  <h3 className="font-semibold text-lg tracking-tight">
                    Time Slot
                  </h3>
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
                          slots={timeSlots}
                          alternativeSlots={alternativeSlots}
                          value={field.value}
                          onChange={(time: Date) => {
                              field.onChange(time);
                            }}
                          isLoading={isLoadingSlots}
                          disabled={selectedServices.length === 0}
                          emptyTitle={slotEmptyState.title}
                          emptyDescription={slotEmptyState.description}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </>
          )}

          {canAccessStep3 && effectiveIsWalkIn && (
            <div className="order-30 rounded-2xl border bg-card/90 p-4 text-sm text-muted-foreground shadow-sm sm:p-5">
              <p className="font-medium text-foreground">3. Time Slot</p>
              <p>Walk-in mode uses immediate start time automatically.</p>
            </div>
          )}

          {canAccessStep4 &&
            (effectiveIsWalkIn || selectedTime) &&
            !isEmployee && (
              <div className="order-40 space-y-4 rounded-2xl border bg-card/90 p-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300 sm:p-5">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 shrink-0">
                    <span className="text-xs font-bold text-primary">4</span>
                  </div>
                  <h3 className="font-semibold text-lg tracking-tight">
                    Preferred Staff
                  </h3>
                </div>

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
              <div className="order-40 space-y-3 rounded-2xl border bg-card/90 p-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300 sm:space-y-4 sm:p-5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 shrink-0">
                      <span className="text-xs font-bold text-primary">4</span>
                    </div>
                    <h3 className="font-semibold text-lg tracking-tight">
                      Claim Services
                    </h3>
                  </div>
                  <Badge
                    variant={
                      claimedUniqueIds.length > 0 ? "default" : "secondary"
                    }
                    className="font-medium"
                  >
                    {claimedUniqueIds.length}/{totalSelectedServiceUnits}{" "}
                    claimed
                  </Badge>
                </div>

                <p className="text-sm text-muted-foreground">
                  Claimed services are assigned to you immediately. Unclaimed
                  services stay open for other staff.
                </p>

                <Card className="border bg-card/60 shadow-inner">
                  <CardContent className="px-3 pb-3 pt-3 sm:px-5 sm:pb-5 sm:pt-5">
                    <ServiceClaimSelector
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
                  </CardContent>
                </Card>
              </div>
            )}

          {canReviewAndConfirm && (
            <div className="order-[60] space-y-4 rounded-2xl border bg-card/90 p-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300 sm:p-5">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 shrink-0">
                  <span className="text-xs font-bold text-primary">5</span>
                </div>
                <h3 className="font-semibold text-lg tracking-tight">
                  Review &amp; Confirm
                </h3>
              </div>

              <div className="rounded-xl border bg-muted/30 p-3 text-sm space-y-2">
                <p>
                  <span className="font-semibold">Booking type:</span>{" "}
                  {effectiveIsWalkIn ? "Walk-in / Immediate" : "Scheduled"}
                </p>
                {!effectiveIsWalkIn && selectedDate && (
                  <p>
                    <span className="font-semibold">Date:</span>{" "}
                    {format(selectedDate, "EEEE, MMMM d, yyyy")}
                  </p>
                )}
                {!effectiveIsWalkIn && selectedTime && (
                  <p>
                    <span className="font-semibold">Time:</span>{" "}
                    {selectedTime.toLocaleTimeString("en-US", {
                      timeZone: "Asia/Manila",
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </p>
                )}
                <p>
                  <span className="font-semibold">Services:</span>{" "}
                  {totalSelectedServiceUnits} selected
                </p>
                {!isEmployee && (
                  <p>
                    <span className="font-semibold">Preferred staff:</span>{" "}
                    {selectedEmployeeName || "Any available"}
                  </p>
                )}
                {claimStepEnabled && (
                  <p>
                    <span className="font-semibold">Claimed services:</span>{" "}
                    {claimedUniqueIds.length}
                  </p>
                )}
                {isEmployee && selectedEmployeeId && (
                  <p>
                    <span className="font-semibold">Staff requirement:</span>{" "}
                    {requireSelectedStaff
                      ? "Required selected staff"
                      : "Prefer selected staff"}
                  </p>
                )}
                {showCapacityOverrideForm && capacityOverrideReason && (
                  <p className="text-amber-700">
                    <span className="font-semibold">Capacity override:</span>{" "}
                    {capacityOverrideReason.replaceAll("_", " ")}
                  </p>
                )}
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

              {effectiveIsWalkIn && isEmployee && showCapacityOverrideForm && (
                <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
                  <p className="text-sm font-semibold text-amber-900">
                    Walk-in capacity override
                  </p>
                  <p className="text-xs text-amber-800">
                    Provide a reason to proceed if your role has override
                    access.
                  </p>
                  <Select
                    value={capacityOverrideReason}
                    onValueChange={(value: string) =>
                      setCapacityOverrideReason(value as CapacityOverrideReason)
                    }
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select override reason" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LATE_CUSTOMER">
                        Late Customer
                      </SelectItem>
                      <SelectItem value="VIP">VIP</SelectItem>
                      <SelectItem value="MANUAL_EXCEPTION">
                        Manual Exception
                      </SelectItem>
                      <SelectItem value="SYSTEM_RECOVERY">
                        System Recovery
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Textarea
                    value={capacityOverrideNote}
                    onChange={(event) =>
                      setCapacityOverrideNote(event.target.value)
                    }
                    placeholder="Add context (optional)"
                    className="min-h-20 bg-white"
                    maxLength={240}
                  />
                </div>
              )}

              <div className="flex items-start gap-3 rounded-xl border p-3">
                <Checkbox
                  id="confirm-booking-details"
                  checked={hasReviewedDetails}
                  onCheckedChange={(checked) =>
                    setHasReviewedDetails(checked === true)
                  }
                  className="mt-0.5"
                />
                <label
                  htmlFor="confirm-booking-details"
                  className="text-sm leading-relaxed cursor-pointer"
                >
                  I reviewed the booking details and confirm they are correct.
                </label>
              </div>

              {!hasReviewedDetails && (
                <p className="text-xs text-muted-foreground">
                  Confirm Step 6 to unlock payment and final submission.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="w-full lg:w-[360px] lg:shrink-0">
          <div className="space-y-4 lg:sticky lg:top-4">
            <Card className="overflow-hidden border shadow-lg shadow-black/5">
              <CardHeader className="border-b bg-muted/20 pb-4">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="font-bold">Booking Summary</span>
                  {selectedServices.length > 0 && (
                    <Badge variant="secondary" className="font-medium text-xs bg-primary/10 text-primary border-primary/20">
                      {selectedServices.length} {selectedServices.length === 1 ? "service" : "services"}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-6 pt-5 sm:pt-6">
                <div className="max-h-[220px] overflow-y-auto pr-1 -mr-2 sm:max-h-[300px]">
                  <SelectedServiceList
                    form={form}
                    services={selectedServices}
                  />
                </div>

                {selectedServices.length > 0 && (
                  <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                    {selectedServices.some(
                      (s) => s.slotsRemaining !== null && s.slotsRemaining !== undefined && s.slotsRemaining > 0 && s.slotsRemaining <= 3,
                    ) && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 flex items-start gap-2">
                        <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>
                          Limited promo slots remaining — complete your booking to
                          secure the sale price.
                        </span>
                      </div>
                    )}

                    <Separator />

                    {canReviewAndConfirm && (
                      <div className="space-y-4">
                        {!hasReviewedDetails && (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                            Complete Step 6 (Review & Payment) to unlock
                            payment.
                          </div>
                        )}
                        <FormField
                          control={form.control}
                          name="paymentMethod"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
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

                        {isEmployee && (
                        <FormField
                          control={form.control}
                          name="paymentType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
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

                        <div className="flex flex-col gap-6">
                          {/* Voucher Application */}
                          {hasActivePromos && (
                            <div className="space-y-2.5">
                              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                Voucher Code
                              </label>
                              <div className="flex flex-col bg-muted/20 p-3 rounded-lg border border-border/50">
                                <div className="flex gap-2">
                                  <Input
                                    placeholder="Enter code"
                                    value={voucherCode}
                                    onChange={(e) =>
                                      setVoucherCode(
                                        e.target.value.toUpperCase(),
                                      )
                                    }
                                    disabled={
                                      !!appliedVoucher ||
                                      isVerifyingVoucher ||
                                      !hasReviewedDetails
                                    }
                                    className="uppercase bg-white h-10 font-medium tracking-wide"
                                  />
                                  {appliedVoucher ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      onClick={clearVoucher}
                                      disabled={!hasReviewedDetails}
                                      className="shrink-0 text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600 transition-colors"
                                    >
                                      <X className="size-4" />
                                    </Button>
                                  ) : (
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      onClick={handleVerifyVoucher}
                                      disabled={
                                        isVerifyingVoucher ||
                                        !voucherCode.trim() ||
                                        !hasReviewedDetails
                                      }
                                      className="shrink-0 font-medium"
                                    >
                                      {isVerifyingVoucher ? "..." : "Apply"}
                                    </Button>
                                  )}
                                </div>

                                {voucherError && (
                                  <p className="text-xs text-red-500 font-medium mt-1.5 animate-in slide-in-from-left-1">
                                    {voucherError}
                                  </p>
                                )}

                                {appliedVoucher && (
                                  <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 px-3 py-2 rounded-md border border-green-200 mt-2">
                                    <Ticket className="size-3.5" />
                                    <span className="font-semibold">
                                      {appliedVoucher.code}
                                    </span>
                                    <span className="ml-auto font-bold tabular-nums">
                                      -₱
                                      {appliedVoucher.discountAmount.toLocaleString()}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="bg-muted/40 -mx-6 -mb-6 px-6 py-4 border-t space-y-3 pb-4">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-medium tabular-nums">
                          ₱{total.toLocaleString()}
                        </span>
                      </div>

                      {appliedVoucher && (
                        <div className="flex justify-between items-center text-sm text-green-600">
                          <span className="flex items-center gap-1.5">
                            <Ticket className="w-3.5 h-3.5" /> Voucher Discount
                          </span>
                          <span className="font-medium tabular-nums">
                            - ₱{appliedVoucher.discountAmount.toLocaleString()}
                          </span>
                        </div>
                      )}

                      {paymentType === "DOWNPAYMENT" &&
                        (effectiveIsWalkIn || selectedTime) && (
                          <>
                            <div className="flex justify-between items-center text-sm text-emerald-600">
                              <span className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Downpayment ({bookingPolicy?.downpaymentPercentage ?? 50}%)
                              </span>
                              <span className="font-medium tabular-nums">
                                - ₱
                                {(
                                  finalTotal - finalAmountToPay
                                ).toLocaleString()}
                              </span>
                            </div>
                            <Separator className="my-1 border-dashed" />
                            <div className="flex justify-between items-center text-xs text-muted-foreground opacity-80">
                              <span>Balance (Pay later)</span>
                              <span className="tabular-nums">
                                ₱
                                {(
                                  finalTotal - finalAmountToPay
                                ).toLocaleString()}
                              </span>
                            </div>
                          </>
                        )}

                      <Separator className="bg-border/60" />

                      <div className="flex justify-between items-end">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-0.5">
                            {paymentType === "DOWNPAYMENT"
                              ? "Due Now"
                              : "Total Amount"}
                          </p>
                        </div>
                        <div className="text-2xl font-bold text-primary tabular-nums tracking-tight">
                          ₱
                          {totalWithFee.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </div>
                      </div>


                      <Button
                        disabled={isSubmitDisabled || isCheckingDuplicate}
                        type="submit"
                        size="lg"
                        className="hidden w-full font-semibold shadow-lg shadow-primary/20 transition-all hover:shadow-primary/30 active:scale-[0.98] lg:flex"
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
              </CardContent>
            </Card>
          </div>
        </div>

        <div
          className={cn(
            "z-40 border-t bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-sm supports-[backdrop-filter]:bg-background/80 lg:hidden",
            usesFixedMobileActionBar
              ? "fixed inset-x-0 bottom-0"
              : "sticky bottom-0",
          )}
        >
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Due Now
              </p>
              <p className="truncate text-base font-bold tabular-nums text-primary">
                ₱
                {totalWithFee.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
            <Button
              disabled={isSubmitDisabled || isCheckingDuplicate}
              type="submit"
              size="lg"
              className="h-11 flex-1 font-semibold shadow-lg shadow-primary/20 transition-all hover:shadow-primary/30 active:scale-[0.98]"
            >
              {isPending || isCheckingDuplicate
                ? "Processing..."
                : paymentMethod === "CASH"
                  ? "Confirm Booking"
                  : "Reserve & Pay"}
            </Button>
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
        <AlertDialogContent className="sm:max-w-md">
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
                    Heads-up: the name you typed doesn&apos;t match this
                    record. Double-check before linking.
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
            <AlertDialogCancel className="sm:order-1">
              Cancel
            </AlertDialogCancel>
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
    </Form>
  );
}
