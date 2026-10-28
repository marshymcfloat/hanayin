import { toast } from "sonner";

export function showCatalogSaved(message: string, selector: string, reveal: () => void) {
  toast.success(message, { action: { label: "View item", onClick: () => {
    reveal();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(selector);
      row?.scrollIntoView({ block: "center", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
      row?.focus({ preventScroll: true });
    }));
  } } });
}
