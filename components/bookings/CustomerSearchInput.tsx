import { useQuery } from "@tanstack/react-query";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "../ui/input-group";
import { Search } from "lucide-react";
import { searchCustomer } from "@/features/customers/actions/customer";
import React, { useState, useRef, useEffect } from "react";
import { Button } from "../ui/button";
import { useDebounce } from "@/hooks/use-debounce";

type CustomerOption = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
};

type FormLike = {
  setValue: (
    name: "customerId" | "customerName" | "email" | "phone",
    value: string,
    options?: { shouldValidate?: boolean; shouldDirty?: boolean },
  ) => void;
};

const CustomerSearchInput = React.memo(function CustomerSearchInput({
  form,
  businessSlug,
  onCustomerSelect,
  ...props
}: {
  form: FormLike;
  businessSlug: string;
  onCustomerSelect?: (customer: CustomerOption | null) => void;
  value?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
}) {
  const inputValue = props.value || "";
  const debouncedSearchQuery = useDebounce(inputValue, 300);
  const [showResults, setShowResults] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["customer", debouncedSearchQuery, businessSlug],
    queryFn: () => searchCustomer(debouncedSearchQuery, businessSlug),
    enabled: debouncedSearchQuery.length > 0 && !!businessSlug,
  });

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

  const handleSelectCustomer = (customer: CustomerOption) => {
    form.setValue("customerId", customer.id);
    // Call parent onChange to update customerName
    if (props.onChange) {
      props.onChange(customer.name);
    } else {
      form.setValue("customerName", customer.name);
    }
    form.setValue("email", customer.email || "");
    form.setValue("phone", customer.phone || "");
    setShowResults(false);
    if (onCustomerSelect) {
      onCustomerSelect(customer);
    }
  };

  return (
    <div ref={containerRef} className="relative flex w-full flex-col">
      <InputGroup>
        <InputGroupInput
          placeholder="Search customer"
          value={inputValue}
          onChange={(e) => {
            const newValue = e.target.value;
            if (props.onChange) {
              props.onChange(newValue);
            } else {
              // Fallback if no onChange prop
              form.setValue("customerName", newValue);
            }
            setShowResults(true);
            form.setValue("customerId", "");
            // Clear email field when search is modified
            form.setValue("email", "");
            form.setValue("phone", "");
            // Notify parent to clear existingCustomerEmail state
            if (onCustomerSelect) {
              onCustomerSelect(null);
            }
          }}
          onBlur={props.onBlur}
          onFocus={() => setShowResults(true)}
        />
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
      </InputGroup>
      {showResults && inputValue.length > 0 && (
        <div className="absolute top-full z-10 mt-1 w-full rounded-md border bg-background shadow-lg">
          {isLoading ? (
            <div className="p-2 text-sm text-muted-foreground">Loading...</div>
          ) : data?.success && data?.data && data.data.length > 0 ? (
            <div className="flex flex-col">
              {data.data.map((customer: CustomerOption) => (
                <Button
                  key={customer.id}
                  variant="ghost"
                  className="justify-start rounded-none"
                  onClick={() => handleSelectCustomer(customer)}
                  type="button"
                >
                  {customer.name}
                </Button>
              ))}
            </div>
          ) : (
            <div className="p-2 text-sm text-muted-foreground">
              No customers found.
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default CustomerSearchInput;
