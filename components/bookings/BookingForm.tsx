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
import CustomerSearchInput from "./CustomerSearchInput";
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
import QrPaymentPanel from "./QrPaymentPanel";
import { getPayMongoPaymentIntentStatus } from "@/lib/server actions/paymongo";

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
import { format } from "date-fns";
import { Sparkles, Calendar, Ticket, X } from "lucide-react";
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
  discountReason?: string;
  slotsRemaining?: number | null;
  packageId?: number;
  packageName?: string;
  category?: string | null;
  claimedByCurrentEmployee?: boolean;
};

type SelectedCustomer = {
  email?: string | null;
  phone?: string | null;
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
      paymentMethod: isEmployee ? "CASH" : "QRPH",

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
  const customerEmailInput = useWatch({
    control: form.control,
    name: "email",
  }) as string;

  const [existingCustomerEmail, setExistingCustomerEmail] = useState<
    string | null
  >(null);
  const [existingCustomerPhone, setExistingCustomerPhone] = useState<
    string | null
  >(null);
  const [pendingFlows, setPendingFlows] = useState<PendingFlow[]>([]);
  const [claimedUniqueIds, setClaimedUniqueIds] = useState<string[]>([]);

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

  const handleCustomerSelect = useCallback(
    (customer: SelectedCustomer | null) => {
      if (customer === null) {
        setExistingCustomerEmail(null);
        setExistingCustomerPhone(null);
        form.setValue("email", "", { shouldValidate: true });
        form.setValue("phone", "", { shouldValidate: true });
      } else {
        const selectedEmail = customer?.email || "";
        const selectedPhone = customer?.phone || "";

        setExistingCustomerEmail(customer?.email || null);
        setExistingCustomerPhone(customer?.phone || null);
        form.setValue("email", selectedEmail, { shouldValidate: true });
        form.setValue("phone", selectedPhone, { shouldValidate: true });
      }
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
  const [qrPayment, setQrPayment] = useState<{
    paymentIntentId: string;
    bookingId: number;
    qrImage: string;
    successToken: string;
    expiresAt?: string;
  } | null>(null);
  const [qrStatus, setQrStatus] = useState<
    "pending" | "paid" | "failed" | "expired"
  >("pending");
  const [hasRedirected, setHasRedirected] = useState(false);

  useEffect(() => {
    if (canceled === "true") {
      toast.error("Payment was canceled or expired. Please try again.");
      if (businessSlug) {
        router.replace(`/${businessSlug}/booking`);
      }
    }
  }, [canceled, businessSlug, router]);

  const { data: paymentIntentStatus } = useQuery({
    queryKey: ["paymongoIntentStatus", qrPayment?.paymentIntentId],
    queryFn: () =>
      qrPayment
        ? getPayMongoPaymentIntentStatus(
            qrPayment.paymentIntentId,
            businessSlug,
          )
        : Promise.resolve(null),
    enabled: !!qrPayment && qrStatus === "pending",
    refetchInterval: qrPayment && qrStatus === "pending" ? 5000 : false,
  });

  useEffect(() => {
    if (!qrPayment || !paymentIntentStatus) return;

    const status = paymentIntentStatus.status;
    if (status === "succeeded") {
      setQrStatus("paid");
      if (!hasRedirected && businessSlug) {
        if (isEmployee) {
          form.reset();
          setIsWalkIn(false);
          setHasReviewedDetails(false);
          setClaimedUniqueIds([]);
          setPendingFlows([]);
          setExistingCustomerEmail(null);
          setExistingCustomerPhone(null);
          setQrPayment(null);
          toast.success("Payment Received! Booking confirmed.");

          if (onSuccess) onSuccess();
        } else {
          setHasRedirected(true);
          setTimeout(() => {
            const bookingId = qrPayment?.bookingId;
            const successToken = qrPayment?.successToken;
            const successUrl = bookingId
              ? `/${businessSlug}/booking/success?bookingId=${bookingId}${successToken ? `&token=${encodeURIComponent(successToken)}` : ""}`
              : `/${businessSlug}/booking/success`;
            // Use window.location.href to ensure full page reload and clear any open modals
            window.location.href = successUrl;
          }, 1200);
        }
      }
      return;
    }

    if (status === "canceled" || status === "failed") {
      setQrStatus("failed");
      return;
    }

    if (qrPayment.expiresAt) {
      const expired = new Date(qrPayment.expiresAt).getTime() <= Date.now();
      if (expired) {
        setQrStatus("expired");
      }
    }
  }, [
    paymentIntentStatus,
    qrPayment,
    businessSlug,
    hasRedirected,
    form,
    isEmployee,
    onSuccess,
  ]);

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

  const convenienceFee = useMemo(() => {
    if (paymentMethod !== "QRPH") return 0;
    return Math.max(0, totalWithFee - finalAmountToPay);
  }, [paymentMethod, totalWithFee, finalAmountToPay]);

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

      if (result.type === "qrph") {
        setQrPayment({
          paymentIntentId: result.paymentIntentId,
          bookingId: result.bookingId,
          qrImage: result.qrImage,
          successToken: result.successToken,
          expiresAt: result.expiresAt,
        });
        setQrStatus("pending");
      }
    },
    onError: (error) => {
      const code = error instanceof Error ? error.message : "";
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
          "This promo has reached its slot limit. The discount is no longer available.",
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
            name: s.name,
            price: s.price,
            originalPrice: s.originalPrice,
            quantity: 1,
            duration: s.duration || 30,
            claimedByCurrentEmployee:
              claimStepEnabled && claimedUniqueIds.includes(uniqueId),
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

      createBookingAction({
        customerId: data.customerId || undefined,
        customerName: capitalizedCustomerName,
        businessSlug,
        scheduledAt: new Date(normalizedScheduledAt),
        currentEmployeeId: isEmployee ? currentEmployeeId : undefined,
        paymentMethod: data.paymentMethod,
        paymentType: data.paymentType,
        services: flatServicesPayload,
        email: data.email,
        phone: data.phone?.trim() || undefined,
        voucherCode: appliedVoucher?.code,
        isWalkIn: effectiveIsWalkIn,
        staffSelectionMode: computedStaffSelectionMode,
        capacityOverride: normalizedCapacityOverride,
      });
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
    ],
  );

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
  const customerEmailValue = (customerEmailInput || "").trim();
  const isCustomerDetailsComplete = isEmployee
    ? !!customerId || customerNameValue.length >= 2
    : customerNameValue.length >= 2 && customerEmailValue.length > 0;
  const canAccessStep2 = isStep1Complete;
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
    return isEmployee
      ? [
          {
            value: "CASH" as const,
            label: "Cash",
            disabled: !hasReviewedDetails,
          },
          {
            value: "QRPH" as const,
            label: "QR Payment",
            disabled: !hasReviewedDetails,
          },
        ]
      : [
          {
            value: "QRPH" as const,
            label: "QR Payment",
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
          label: "50%",
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
        label: "50%",
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
        {qrPayment && (
          <QrPaymentPanel
            qrImage={qrPayment.qrImage}
            amountLabel={`₱${totalWithFee.toFixed(2)}`}
            status={qrStatus}
            expiresAt={qrPayment.expiresAt}
            onClose={() => {
              setQrPayment(null);
              setQrStatus("pending");
              setHasRedirected(false);
            }}
            onRetry={() => {
              setQrPayment(null);
              setQrStatus("pending");
              setHasRedirected(false);
            }}
          />
        )}
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
            <div className="flex flex-wrap gap-2">
              {[
                { step: 1, label: "Services", done: isStep1Complete },
                { step: 2, label: "Date", done: isStep2Complete },
                { step: 3, label: "Time", done: isStep3Complete },
                {
                  step: 4,
                  label: claimStepEnabled ? "Claim" : "Staff",
                  done: canAccessStep4,
                },
                {
                  step: 5,
                  label: "Customer Details",
                  done: isCustomerDetailsComplete,
                },
                {
                  step: 6,
                  label: "Review & Payment",
                  done: hasReviewedDetails,
                },
              ].map((item) => (
                <span
                  key={item.step}
                  className={cn(
                    "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
                    item.done
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : currentStep === item.step
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-zinc-200 bg-white text-zinc-500",
                  )}
                >
                  {item.step}. {item.label}
                </span>
              ))}
            </div>
          </div>

          {canAccessStep5 && (
            <div className="order-50 space-y-4 rounded-2xl border bg-card/90 p-4 shadow-sm sm:p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                  5
                </span>
                <h3 className="font-semibold text-lg tracking-tight">
                  Customer Details
                </h3>
              </div>

              <FormField
                control={form.control}
                name="customerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      {isEmployee ? (
                        <CustomerSearchInput
                          form={form}
                          businessSlug={businessSlug!}
                          onCustomerSelect={handleCustomerSelect}
                          {...field}
                        />
                      ) : (
                        <Input placeholder="Enter your full name" {...field} />
                      )}
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => {
                  return (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      {isEmployee && existingCustomerEmail ? (
                        <div className="text-sm bg-yellow-50 text-yellow-800 p-3 rounded-md border border-yellow-200">
                          This customer already has an email linked (
                          <span className="font-mono">
                            {maskEmail(existingCustomerEmail)}
                          </span>
                          ).
                          <br />
                          <span className="text-xs opacity-80">
                            To change it, update their profile separately.
                          </span>
                        </div>
                      ) : (
                        <>
                          <FormControl>
                            <Input placeholder="email@example.com" {...field} />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">
                            Required for QR payments.
                          </p>
                          <FormMessage />
                        </>
                      )}
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => {
                  return (
                    <FormItem>
                      <FormLabel>Contact Number (Optional)</FormLabel>
                      {isEmployee && existingCustomerPhone ? (
                        <div className="text-sm bg-yellow-50 text-yellow-800 p-3 rounded-md border border-yellow-200">
                          This customer already has a contact number linked (
                          <span className="font-mono">
                            {existingCustomerPhone}
                          </span>
                          ).
                          <br />
                          <span className="text-xs opacity-80">
                            To change it, update their profile separately.
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
                            Optional. Add this so we can contact you if we need
                            to clarify your booking details.
                          </p>
                          <FormMessage />
                        </>
                      )}
                    </FormItem>
                  );
                }}
              />
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
              !canAccessStep2 && "pointer-events-none opacity-60",
            )}
          >
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                  2
                </span>
                <h3 className="font-semibold text-lg tracking-tight">
                  Booking Setup
                </h3>
              </div>

              {!canAccessStep2 && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Select at least one service first to unlock date selection.
                </p>
              )}

              {isEmployee && (
                <div className="flex items-center justify-between rounded-2xl border bg-secondary/20 p-4 shadow-sm">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-semibold text-foreground">
                      Walk-in / Immediate
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Start booking immediately without scheduling
                    </p>
                  </div>
                  <div
                    className={cn(
                      "w-12 h-7 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300",
                      effectiveIsWalkIn
                        ? "bg-primary"
                        : "bg-muted-foreground/30",
                    )}
                    onClick={handleWalkInToggle}
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
                  Walk-in is enabled. This booking will start immediately
                  without a scheduled slot.
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
            <div className="flex items-center gap-2 mb-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                1
              </span>
              <h3 className="font-semibold text-lg tracking-tight">
                Select Services
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
              <div className="order-30 space-y-4 rounded-2xl border bg-card/90 p-4 shadow-sm sm:p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                    3
                  </span>
                  <h3 className="font-semibold text-lg tracking-tight">
                    Select Time Slot
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
              <div className="order-40 space-y-4 rounded-2xl border bg-card/90 p-4 shadow-sm animate-in fade-in slide-in-from-left-4 duration-500 sm:p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                    4
                  </span>
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
              <div className="order-40 space-y-3 rounded-2xl border bg-card/90 p-3 shadow-sm animate-in fade-in slide-in-from-left-4 duration-500 sm:space-y-4 sm:p-5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                      4
                    </span>
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
            <div className="order-[60] space-y-4 rounded-2xl border bg-card/90 p-4 shadow-sm animate-in fade-in slide-in-from-left-4 duration-500 sm:p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                  6
                </span>
                <h3 className="font-semibold text-lg tracking-tight">
                  Review & Payment
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
              <CardHeader className="border-b bg-muted/30 pb-4">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>Booking Summary</span>
                  {selectedServices.length > 0 && (
                    <Badge variant="secondary" className="font-normal text-xs">
                      {selectedServices.length} items
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
                                Downpayment (50%)
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
                          {paymentMethod === "QRPH" && (
                            <p className="text-[10px] text-muted-foreground">
                              Includes 1.5% fee
                            </p>
                          )}
                        </div>
                        <div className="text-2xl font-bold text-primary tabular-nums tracking-tight">
                          ₱
                          {totalWithFee.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </div>
                      </div>

                      {paymentMethod === "QRPH" && (
                        <div className="flex justify-between items-center text-xs text-muted-foreground/80 mt-1">
                          <span>Convenience Fee (1.5%)</span>
                          <span className="tabular-nums">
                            + ₱
                            {convenienceFee.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                      )}

                      <Button
                        disabled={isSubmitDisabled}
                        type="submit"
                        size="lg"
                        className="hidden w-full font-semibold shadow-lg shadow-primary/20 transition-all hover:shadow-primary/30 active:scale-[0.98] lg:flex"
                      >
                        {isPending
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
              disabled={isSubmitDisabled}
              type="submit"
              size="lg"
              className="h-11 flex-1 font-semibold shadow-lg shadow-primary/20 transition-all hover:shadow-primary/30 active:scale-[0.98]"
            >
              {isPending
                ? "Processing..."
                : paymentMethod === "CASH"
                  ? "Confirm Booking"
                  : "Reserve & Pay"}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
