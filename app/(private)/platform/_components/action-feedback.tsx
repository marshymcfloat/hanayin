const DEFAULT_ERROR_MESSAGE = "We couldn't complete that action. Please try again.";
const DEFAULT_SUCCESS_MESSAGE = "Action completed successfully.";

type SearchParamValue = string | string[] | undefined;
type SearchParamsObject = Record<string, SearchParamValue>;

export type PlatformSearchParams = SearchParamsObject | Promise<SearchParamsObject> | undefined;

export type PlatformFlashMessage = {
  tone: "error" | "success";
  message: string;
};

function normalizeMessage(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function firstParamValue(value: SearchParamValue) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function decodeParam(raw: string) {
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw;
  }
}

function isRedirectError(error: unknown): error is { digest: string } {
  if (!error || typeof error !== "object") return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export function rethrowIfRedirectError(error: unknown): never | void {
  if (isRedirectError(error)) {
    throw error;
  }
}

export function toActionErrorMessage(
  error: unknown,
  fallback = DEFAULT_ERROR_MESSAGE,
) {
  if (isRedirectError(error)) {
    return fallback;
  }

  if (error instanceof Error) {
    const message = normalizeMessage(error.message);
    return message.length > 0 ? message : fallback;
  }

  if (typeof error === "string") {
    const message = normalizeMessage(error);
    return message.length > 0 ? message : fallback;
  }

  return fallback;
}

export function buildPlatformErrorPath(
  pathname: string,
  rawMessage?: string | null,
) {
  const params = new URLSearchParams();
  const message = rawMessage && rawMessage.trim().length > 0
    ? rawMessage.trim()
    : DEFAULT_ERROR_MESSAGE;
  params.set("error", message);
  return `${pathname}?${params.toString()}`;
}

export function buildPlatformSuccessPath(
  pathname: string,
  rawMessage?: string | null,
) {
  const params = new URLSearchParams();
  const message = rawMessage && rawMessage.trim().length > 0
    ? rawMessage.trim()
    : DEFAULT_SUCCESS_MESSAGE;
  params.set("success", message);
  return `${pathname}?${params.toString()}`;
}

export async function getPlatformFlashMessage(
  searchParams?: PlatformSearchParams,
): Promise<PlatformFlashMessage | null> {
  if (!searchParams) return null;
  const resolved = await searchParams;

  const errorValue = firstParamValue(resolved.error);
  if (errorValue) {
    return {
      tone: "error",
      message: decodeParam(errorValue),
    };
  }

  const successValue = firstParamValue(resolved.success);
  if (successValue) {
    return {
      tone: "success",
      message: decodeParam(successValue),
    };
  }

  return null;
}

export function PlatformFlashNotice({ flash }: { flash: PlatformFlashMessage }) {
  const toneClasses =
    flash.tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-2xl border px-4 py-3 text-sm font-medium ${toneClasses}`}
    >
      {flash.message}
    </div>
  );
}

