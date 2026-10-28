"use client";
import staffTheme from "@/components/dashboard/employee/StaffWorkspaceTheme.module.css";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { CalendarIcon, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { createLeaveRequest } from "@/features/workforce/actions/leave-request";
import { toast } from "sonner";
import { extractClientErrorMessage } from "@/lib/utils/error-message";
import { LeaveType } from "@/prisma/generated/prisma/enums";

const formSchema = z.object({
  dateRange: z.object({
    from: z.date(),
    to: z.date(),
  }),
  reason: z.string().min(3, "Reason must be at least 3 characters"),
  type: z.nativeEnum(LeaveType),
  benefitCode: z.enum(["DISCRETIONARY", "SIL", "MATERNITY", "PATERNITY", "SOLO_PARENT", "VAWC", "SPECIAL_WOMEN"]),
});

interface RequestLeaveDialogProps {
  employeeId: number;
  businessId: string;
  businessSlug: string; // Added prop
  onSuccess?: () => void;
  trigger?: React.ReactNode;
  leavesThisMonth?: number;
}

export function RequestLeaveDialog({
  employeeId,
  businessId,
  businessSlug,
  onSuccess,
  trigger,
  leavesThisMonth,
}: RequestLeaveDialogProps) {
  const [open, setOpen] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      reason: "",
      type: LeaveType.VACATION,
      benefitCode: "DISCRETIONARY",
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      const result = await createLeaveRequest({
        employee_id: employeeId,
        business_id: businessId,
        start_date: values.dateRange.from,
        end_date: values.dateRange.to,
        reason: values.reason,
        type: values.type,
        benefit_code: values.benefitCode,
        businessSlug: businessSlug, // Passed slug
      });

      if (result.success) {
        toast.success("Leave request submitted");
        setOpen(false);
        form.reset();
        if (onSuccess) onSuccess();
      } else {
        toast.error(result.error || "Failed to submit request");
      }
    } catch (error) {
      toast.error(extractClientErrorMessage(error, "Failed to submit request"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button>Request Leave</Button>}
      </DialogTrigger>
      <DialogContent className={`${staffTheme.workspace} sm:max-w-[425px]`}>
        <DialogHeader>
          <DialogTitle>Request Leave</DialogTitle>
          <DialogDescription>
            Select the dates, type, and provide a reason for your leave.
          </DialogDescription>
          {leavesThisMonth !== undefined ? (
            <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
              <CalendarIcon className="size-3.5" aria-hidden="true" />
              {leavesThisMonth.toLocaleString()}{" "}
              {leavesThisMonth === 1 ? "request" : "requests"} filed this month
            </p>
          ) : null}
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="benefitCode" render={({ field }) => <FormItem><FormLabel>Benefit to use</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent className={staffTheme.workspace}>{[["DISCRETIONARY", "Owner-approved paid or unpaid leave"], ["SIL", "Service incentive leave"], ["MATERNITY", "Maternity benefit"], ["PATERNITY", "Paternity leave"], ["SOLO_PARENT", "Solo-parent leave"], ["VAWC", "VAWC leave"], ["SPECIAL_WOMEN", "Special leave for women"]].map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>} />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Leave Type</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a leave type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className={staffTheme.workspace}>
                      {Object.values(LeaveType).map((type) => (
                        <SelectItem key={type} value={type}>
                          {type.charAt(0) + type.slice(1).toLowerCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dateRange"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Dates</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground",
                          )}
                        >
                          {field.value?.from ? (
                            field.value.to ? (
                              <>
                                {format(field.value.from, "LLL dd, y")} -{" "}
                                {format(field.value.to, "LLL dd, y")}
                              </>
                            ) : (
                              format(field.value.from, "LLL dd, y")
                            )
                          ) : (
                            <span>Pick a date range</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className={`${staffTheme.workspace} w-auto p-0`} align="start">
                      <Calendar
                        mode="range"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={
                          (date) => date < new Date() // Disable past dates
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="e.g., Family vacation, Sick leave"
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" className="min-h-11" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Submit Request
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
