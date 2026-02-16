"use client";

import { type ButtonHTMLAttributes, type MouseEvent } from "react";

type ConfirmSubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  confirmMessage?: string;
};

export function ConfirmSubmitButton({
  confirmMessage,
  onClick,
  type = "submit",
  ...props
}: ConfirmSubmitButtonProps) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (confirmMessage && !window.confirm(confirmMessage)) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  return <button {...props} type={type} onClick={handleClick} />;
}

