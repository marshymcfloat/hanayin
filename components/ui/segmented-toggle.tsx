"use client";

import { cn } from "@/lib/utils";

interface SegmentedToggleOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface SegmentedToggleProps<T extends string> {
  options: SegmentedToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  className,
}: SegmentedToggleProps<T>) {
  return (
    <div
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={option.disabled}
          aria-pressed={value === option.value}
          onClick={() => !option.disabled && onChange(option.value)}
          className={cn(
            "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
            "flex-1",
            value === option.value
              ? "bg-background text-foreground shadow-sm"
              : "hover:bg-background/50 hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
