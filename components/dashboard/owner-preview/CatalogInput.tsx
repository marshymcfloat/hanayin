"use client";

import { type ComponentProps, useId, useState } from "react";

export function CatalogInput({ onInvalid, onChange, ...props }: ComponentProps<"input">) {
  const id = useId();
  const [error, setError] = useState("");
  return <><input {...props} aria-invalid={error ? true : props["aria-invalid"]} aria-describedby={[props["aria-describedby"], error ? id : ""].filter(Boolean).join(" ") || undefined} onInvalid={event => {
    event.preventDefault();
    setError(event.currentTarget.validationMessage);
    const first = event.currentTarget.form?.querySelector<HTMLElement>("input:invalid");
    first?.focus();
    onInvalid?.(event);
  }} onChange={event => { if (error) setError(""); onChange?.(event); }} />{error && <span id={id} role="alert" className="mt-1 block text-xs text-[#a6313f]">{error}</span>}</>;
}
