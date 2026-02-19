"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Check, User, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Employee {
  id: number;
  name: string;
  available: boolean;
  specialties?: string[];
}

interface EmployeeSelectProps {
  employees: Employee[];
  value?: number | null;
  onChange: (employeeId: number | null) => void;
  isLoading?: boolean;
  serviceCategories?: string[];
  showOptionalHint?: boolean;
}

const EmployeeSelect = React.memo(function EmployeeSelect({
  employees,
  value,
  onChange,
  isLoading = false,
  serviceCategories,
  showOptionalHint = true,
}: EmployeeSelectProps) {
  const categorySet = React.useMemo(() => {
    if (!serviceCategories || serviceCategories.length === 0) return null;
    return new Set(serviceCategories.map((category) => category.toLowerCase()));
  }, [serviceCategories]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-12 rounded-lg bg-muted animate-pulse"
          />
        ))}
      </div>
    );
  }

  const matchesCategories = (employee: Employee) => {
    if (!categorySet) return true;
    if (!employee.specialties || employee.specialties.length === 0) return true;
    return employee.specialties.some((specialty) =>
      categorySet.has(specialty.toLowerCase()),
    );
  };

  const filteredEmployees = employees.filter(matchesCategories);
  const availableEmployees = filteredEmployees.filter((e) => e.available);
  const unavailableEmployees = filteredEmployees.filter((e) => !e.available);

  if (filteredEmployees.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No staff members available</p>
        {categorySet && (
          <p className="text-xs mt-1">No staff match the selected services.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showOptionalHint && (
        <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          Staff selection is optional. Leave unselected to assign any available
          staff.
        </div>
      )}

      <div
        onClick={() => onChange(null)}
        className={cn(
          "cursor-pointer rounded-xl border p-3 text-sm transition-colors",
          value == null
            ? "border-primary bg-primary/5 text-primary"
            : "border-border hover:border-primary/40",
        )}
      >
        Any available staff
      </div>

      {availableEmployees.length === 0 && unavailableEmployees.length > 0 && (
        <div className="text-center py-2 text-muted-foreground">
          <p>No staff currently available for this time.</p>
          <p className="text-xs mt-1">Staff below are already busy.</p>
        </div>
      )}

      {availableEmployees.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wider">
            Available Staff
          </p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {availableEmployees.map((employee) => {
              const isSelected = value === employee.id;
              const initials = employee.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .substring(0, 2)
                .toUpperCase();

              return (
                <div
                  key={employee.id}
                  onClick={() => onChange(isSelected ? null : employee.id)}
                  className={cn(
                    "cursor-pointer group relative flex items-center gap-3 rounded-xl border p-3 transition-all duration-200",
                    isSelected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border hover:border-primary/50 hover:bg-muted/50",
                  )}
                >
                  <div
                    className={cn(
                      "flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold transition-colors shrink-0",
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary",
                    )}
                  >
                    {isSelected ? <Check className="w-4 h-4" /> : initials}
                  </div>
                  <div className="flex-1 flex flex-col gap-1 min-w-0">
                    <span
                      className={cn(
                        "text-sm font-medium truncate",
                        isSelected ? "text-primary" : "text-foreground",
                      )}
                    >
                      {employee.name}
                    </span>
                    {employee.specialties &&
                      employee.specialties.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {employee.specialties.slice(0, 2).map((specialty) => (
                            <Badge
                              key={specialty}
                              variant="secondary"
                              className="h-4 px-1.5 text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200 capitalize"
                            >
                              {specialty}
                            </Badge>
                          ))}
                          {employee.specialties.length > 2 && (
                            <Badge
                              variant="secondary"
                              className="h-4 px-1.5 text-[9px] bg-muted text-muted-foreground border-border"
                            >
                              +{employee.specialties.length - 2}
                            </Badge>
                          )}
                        </div>
                      )}
                    {(!employee.specialties ||
                      employee.specialties.length === 0) && (
                      <Badge
                        variant="secondary"
                        className="h-4 px-1.5 text-[9px] bg-purple-50 text-purple-700 border-purple-200 w-fit flex items-center gap-1"
                      >
                        <Sparkles className="h-2.5 w-2.5" />
                        Generalist
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {unavailableEmployees.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wider">
            Unavailable
          </p>
          <div className="flex flex-wrap gap-2">
            {unavailableEmployees.map((employee) => (
              <div
                key={employee.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-dashed border-border bg-muted/30 opacity-60 cursor-not-allowed text-muted-foreground text-xs"
              >
                <User className="h-3 w-3" />
                {employee.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default EmployeeSelect;
