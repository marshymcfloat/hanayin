"use client";

import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { loginSchema, LoginSchemaType } from "@/lib/zod schemas/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { signIn, getSession } from "next-auth/react";
import { useMutation } from "@tanstack/react-query";
import { LoaderCircle, Phone, Lock, Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const INVALID_CREDENTIALS_MESSAGE =
  "Incorrect contact number or password. Please try again.";
const GENERIC_SIGN_IN_ERROR_MESSAGE =
  "Unable to sign in right now. Please try again.";

const FIELD_LABELS: Record<keyof LoginSchemaType, string> = {
  contact_number: "Contact number",
  password: "Password",
};

const FIELD_PLACEHOLDERS: Record<keyof LoginSchemaType, string> = {
  contact_number: "09XX XXX XXXX",
  password: "••••••••",
};

function getSignInErrorMessage(error?: string | null) {
  if (error === "CredentialsSignin" || error === "Invalid credentials") {
    return INVALID_CREDENTIALS_MESSAGE;
  }

  return GENERIC_SIGN_IN_ERROR_MESSAGE;
}

export default function AuthForm() {
  const router = useRouter();
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<LoginSchemaType>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      contact_number: "",
      password: "",
    },
  });

  const formKeys = Object.keys(loginSchema.shape) as (keyof LoginSchemaType)[];

  const { mutate, isPending } = useMutation({
    mutationFn: handleSigningIn,
    onMutate: () => {
      form.clearErrors();
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : GENERIC_SIGN_IN_ERROR_MESSAGE;
      if (message === INVALID_CREDENTIALS_MESSAGE) {
        return;
      }
      toast.error(message);
    },
    onSuccess: (session) => {
      if (session?.user.role) {
        if (session.user.role === "PLATFORM_ADMIN") {
          router.push("/platform");
        } else if (session.user.role === "EMPLOYEE") {
          router.push(`/app/${session.user.businessSlug}`);
        } else if (session.user.role === "OWNER") {
          router.push(`/app/${session.user.businessSlug}`);
        }
      }
    },
  });

  async function handleSigningIn() {
    const result = await signIn("credentials", {
      contact_number: form.getValues("contact_number"),
      password: form.getValues("password"),
      redirect: false,
    });

    if (!result || result.error || !result.ok) {
      const message = getSignInErrorMessage(result?.error);
      if (message === INVALID_CREDENTIALS_MESSAGE) {
        form.setError("root", { type: "manual", message });
      }
      throw new Error(message);
    }

    return getSession();
  }

  return (
    <Form {...form}>
      <form
        action=""
        className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out"
        onSubmit={form.handleSubmit(() => mutate())}
      >
        <div className="space-y-5">
          {formKeys.map((input, index) => (
            <FormField
              control={form.control}
              key={input}
              name={input}
              render={({ field }) => (
                <FormItem
                  className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-700 ease-out fill-mode-backwards"
                  style={{ animationDelay: `${index * 150}ms` }}
                >
                  <FormLabel className="text-[13px] font-medium tracking-tight text-foreground/70 ml-1">
                    {FIELD_LABELS[input]}
                  </FormLabel>
                  <FormControl>
                    <div className="relative group">
                      <div
                        className={cn(
                          "absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40 transition-colors duration-300 z-10",
                          focusedField === input && "text-primary",
                        )}
                      >
                        {input === "contact_number" ? (
                          <Phone className="h-4 w-4" />
                        ) : (
                          <Lock className="h-4 w-4" />
                        )}
                      </div>
                      <Input
                        {...field}
                        type={
                          input === "password"
                            ? showPassword
                              ? "text"
                              : "password"
                            : "tel"
                        }
                        inputMode={
                          input === "contact_number" ? "tel" : undefined
                        }
                        autoComplete={
                          input === "contact_number"
                            ? "tel"
                            : "current-password"
                        }
                        onFocus={() => {
                          setFocusedField(input);
                          field.onBlur();
                        }}
                        onBlur={() => {
                          setFocusedField(null);
                          field.onBlur();
                        }}
                        className={cn(
                          "pl-10 h-12 bg-foreground/[0.03] border-black/[0.08] text-base transition-all duration-300",
                          input === "password" && "pr-10",
                          "focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary focus-visible:bg-background",
                          "hover:border-primary/30",
                        )}
                        placeholder={FIELD_PLACEHOLDERS[input]}
                      />
                      {input === "password" ? (
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 transition-colors duration-300 hover:text-foreground"
                          aria-label={
                            showPassword ? "Hide password" : "Show password"
                          }
                          aria-pressed={showPassword}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      ) : null}
                    </div>
                  </FormControl>
                  <FormMessage className="text-xs ml-1" />
                </FormItem>
              )}
            />
          ))}
        </div>

        {form.formState.errors.root?.message ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {form.formState.errors.root.message}
          </p>
        ) : null}

        <div className="flex flex-col gap-4 pt-2 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-300 ease-out fill-mode-backwards">
          <Button
            type="submit"
            className="w-full h-12 text-[15px] font-medium bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_20px_-8px_color-mix(in_oklch,var(--primary)_55%,transparent)] hover:bg-primary/90 hover:-translate-y-0.5 transition-all duration-300"
            disabled={isPending}
          >
            {isPending ? (
              <LoaderCircle className="animate-spin mr-2" />
            ) : (
              "Sign in to dashboard"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
