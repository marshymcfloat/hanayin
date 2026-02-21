"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DatePickerProps {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  minDate?: Date;
  maxDate?: Date;
  placeholder?: string;
}

export default React.memo(function DatePicker({
  value,
  onChange,
  minDate = new Date(),
  maxDate,
  placeholder = "Pick a date",
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const minStart = new Date(minDate);
  minStart.setHours(0, 0, 0, 0);
  const maxEnd = maxDate ? new Date(maxDate) : undefined;
  if (maxEnd) {
    maxEnd.setHours(23, 59, 59, 999);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, "EEEE, MMMM d, yyyy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(date: Date | undefined) => {
            onChange(date);
            setOpen(false);
          }}
          disabled={(date: Date) =>
            date < minStart || (!!maxEnd && date > maxEnd)
          }
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
});
