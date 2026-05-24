"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { extractClientErrorMessage } from "@/lib/utils/error-message";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import {
  createVoucherAction,
  generateVoucherCodeAction,
} from "@/lib/server actions/vouchers";

const formSchema = z.object({
  suffix: z.string().min(4, "Code must be at least 4 characters").max(20),
  type: z.enum(["PERCENTAGE", "FLAT"]),
  value: z.coerce.number<number>().min(0.01, "Value must be greater than 0"),
  minimum_amount: z.coerce.number<number>().min(0),
  expires_at: z.date({
    error: "Expiry date is required",
  }),
});

interface VoucherFormProps {
  onSuccess: () => void;
  initials: string;
}

export function VoucherForm({ onSuccess, initials }: VoucherFormProps) {
  const [isPending, startTransition] = useTransition();
  const [isGenerating, startGenerating] = useTransition();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      suffix: "",
      type: "PERCENTAGE",
      value: 0,
      minimum_amount: 0,
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    startTransition(async () => {
      try {
        const fullCode = `${initials}-${values.suffix}`;

        const res = await createVoucherAction({
          code: fullCode,
          type: values.type,
          value: values.value,
          minimum_amount: values.minimum_amount,
          expires_at: values.expires_at,
        });

        if (res.success) {
          toast.success("Voucher created successfully");
          onSuccess();
        } else {
          toast.error(res.error || "Failed to create voucher");
        }
      } catch (err) {
        toast.error(extractClientErrorMessage(err, "Failed to create voucher"));
      }
    });
  }

  const handleGenerateCode = async (e: React.MouseEvent) => {
    e.preventDefault();
    startGenerating(async () => {
      try {
        const res = await generateVoucherCodeAction();
        if (res.success && res.code) {
          // The action returns "PREFIX-SUFFIX"
          // We want just the suffix.
          // We assume the prefix matches. safely split.
          const parts = res.code.split("-");
          const suffix = parts.length > 1 ? parts[1] : parts[0];
          // fallback if no hyphen, though we enforced hyphen in backend now.

          form.setValue("suffix", suffix);
        } else {
          toast.error(res.error || "Failed to generate code");
        }
      } catch (err) {
        toast.error(extractClientErrorMessage(err, "Failed to generate code"));
      }
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="suffix"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Voucher Code</FormLabel>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium select-none flex items-center">
                    {initials}-
                  </div>
                  <FormControl>
                    <Input
                      placeholder="SUMMER2026"
                      {...field}
                      // Server normalizes to uppercase regardless, but
                      // mirroring it client-side keeps the displayed
                      // value honest and prevents the confused-state
                      // bug where verify accepted a lowercase suffix
                      // but the booking submit later rejected it.
                      onChange={(e) =>
                        field.onChange(e.target.value.toUpperCase())
                      }
                      className="pl-10 h-10 rounded-xl uppercase" // Add padding to make room for prefix
                      style={{ paddingLeft: `${initials.length + 3}ch` }} // dynamic padding roughly
                    />
                  </FormControl>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="rounded-xl border-dashed"
                  onClick={handleGenerateCode}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <FormDescription>
                Unique code for customers to redeem.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Discount Type</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger className="h-10 rounded-xl">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="PERCENTAGE">Percentage (%)</SelectItem>
                    <SelectItem value="FLAT">Flat Amount (₱)</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="value"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Value</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    {...field}
                    className="h-10 rounded-xl"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="minimum_amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Minimum Spend (Optional)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  {...field}
                  className="h-10 rounded-xl"
                />
              </FormControl>
              <FormDescription>
                Minimum booking amount required.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="expires_at"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Expiration Date</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-full pl-3 text-left font-normal h-10 rounded-xl",
                        !field.value && "text-muted-foreground",
                      )}
                    >
                      {field.value ? (
                        format(field.value, "PPP")
                      ) : (
                        <span>Pick a date</span>
                      )}
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-xl" align="start">
                  <Calendar
                    mode="single"
                    selected={field.value}
                    onSelect={field.onChange}
                    disabled={(date) =>
                      date < new Date(new Date().setHours(0, 0, 0, 0))
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/15 font-semibold"
          disabled={isPending}
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Voucher
        </Button>
      </form>
    </Form>
  );
}
