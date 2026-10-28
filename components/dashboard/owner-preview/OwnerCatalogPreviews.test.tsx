import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { vi } from "vitest";
import type {
  OwnerGiftCardsPreviewReadModel,
  OwnerPackagesPreviewReadModel,
  OwnerServicesPreviewReadModel,
  OwnerVouchersPreviewReadModel,
} from "@/features/catalog/types/owner-catalog-preview";

const refresh = vi.fn();
const createService = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("./OwnerDashboardPreview", () => ({
  PreviewDesktopRail: () => <nav aria-label="Desktop preview navigation" />,
  PreviewMobileNavigation: () => <nav aria-label="Mobile preview navigation" />,
}));
vi.mock("@/features/catalog/actions/services", () => ({
  createServiceAction: (...args: unknown[]) => createService(...args),
  updateServiceAction: vi.fn(),
  deleteServiceAction: vi.fn(),
}));
vi.mock("@/features/catalog/actions/packages", () => ({
  createPackageAction: vi.fn(),
  updatePackageAction: vi.fn(),
  deletePackageAction: vi.fn(),
}));
vi.mock("@/features/catalog/actions/vouchers", () => ({
  createVoucherAction: vi.fn(),
  updateVoucherAction: vi.fn(),
  setVoucherActiveAction: vi.fn(),
  deleteVoucherAction: vi.fn(),
}));
vi.mock("@/features/gift-cards/actions/gift-cards", () => ({
  createGiftCardAction: vi.fn(),
  updateGiftCardAction: vi.fn(),
  deleteGiftCardAction: vi.fn(),
}));

import { OwnerGiftCardsPreview } from "./OwnerGiftCardsPreview";
import { CatalogEditorOverlay } from "./CatalogEditorOverlay";
import styles from "./CatalogEditorOverlay.module.css";
import { OwnerPackagesPreview } from "./OwnerPackagesPreview";
import { OwnerServicesPreview } from "./OwnerServicesPreview";
import { OwnerVouchersPreview } from "./OwnerVouchersPreview";

const business = { slug: "beautyfeel", name: "BeautyFeel", initials: "BF" };

const servicesData: OwnerServicesPreviewReadModel = {
  section: "services",
  generatedAt: "2026-09-23T00:00:00.000Z",
  business,
  categories: ["Hair"],
  metrics: {
    totalServices: 1,
    monthlyBookings: 7,
    averageMarginPercent: 75,
    averageDurationMinutes: 60,
  },
  services: [
    {
      id: 11,
      name: "Live Cut",
      description: "Backend service",
      category: "Hair",
      price: 1000,
      estimatedCost: 250,
      durationMinutes: 60,
      monthlyBookings: 7,
    },
  ],
};

const packagesData: OwnerPackagesPreviewReadModel = {
  section: "packages",
  generatedAt: "2026-09-23T00:00:00.000Z",
  business,
  categories: ["Wellness"],
  availableServices: servicesData.services,
  metrics: {
    totalPackages: 1,
    monthlySales: 3,
    monthlyRevenue: 5100,
    averageSavingsPercent: 15,
  },
  packages: [
    {
      id: 21,
      name: "Live Reset",
      description: "Backend package",
      category: "Wellness",
      price: 1700,
      durationMinutes: 90,
      originalPrice: 2000,
      monthlySales: 3,
      services: [
        {
          id: 11,
          name: "Live Cut",
          category: "Hair",
          durationMinutes: 60,
          price: 1000,
          packageItemPrice: 850,
        },
      ],
    },
  ],
};

const vouchersData: OwnerVouchersPreviewReadModel = {
  section: "vouchers",
  generatedAt: "2026-09-23T00:00:00.000Z",
  business,
  metrics: { activeVouchers: 1, redemptions: 1, archivedVouchers: 1 },
  vouchers: [
    {
      id: 31,
      code: "LIVE20",
      type: "PERCENTAGE",
      value: 20,
      minimumAmount: 1000,
      expiresAt: "2027-09-23T15:59:59.000Z",
      status: "active",
      redemptions: 0,
    },
    {
      id: 32,
      code: "OLD500",
      type: "FLAT",
      value: 500,
      minimumAmount: 2500,
      expiresAt: "2027-09-23T15:59:59.000Z",
      status: "archived",
      redemptions: 1,
    },
  ],
};

const giftCardsData: OwnerGiftCardsPreviewReadModel = {
  section: "gift-cards",
  generatedAt: "2026-09-23T00:00:00.000Z",
  business,
  availableServices: [{ id: 11, name: "Live Cut", category: "Hair" }],
  availablePackages: [{ id: 21, name: "Live Reset", category: "Wellness" }],
  metrics: {
    totalGiftCards: 1,
    activeGiftCards: 1,
    claimedGiftCards: 0,
    expiredGiftCards: 0,
  },
  giftCards: [
    {
      id: 41,
      code: "GIFT-LIVE",
      recipientName: "Live Recipient",
      recipientEmail: "live@example.com",
      recipientPhone: null,
      expiresAt: "2027-09-23T15:59:59.000Z",
      claimedAt: null,
      status: "active",
      includedServices: [{ id: 11, name: "Live Cut" }],
      includedPackages: [{ id: 21, name: "Live Reset" }],
    },
  ],
};

function EditFocusHarness() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" data-catalog-focus="services:11">
        Actions for Live Cut
      </button>
      <CatalogEditorOverlay
        open={open}
        onOpenChange={setOpen}
        title="Edit service"
        description="Edit the selected service."
        restoreFocusKey="services:11"
      >
        <button type="button" onClick={() => setOpen(false)}>
          Save successfully
        </button>
      </CatalogEditorOverlay>
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("owner catalog previews", () => {
  it("renders backend services without fictional lifecycle controls", () => {
    render(<OwnerServicesPreview data={servicesData} />);
    expect(screen.getByText("Live Cut")).toBeInTheDocument();
    expect(screen.getByText("Backend service")).toBeInTheDocument();
    expect(screen.queryByText("Signature Balayage")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/draft|pause|publish|archive/i),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Actions for Live Cut" })[0]).toHaveAttribute(
      "data-catalog-focus",
      "services:11",
    );
  });

  it("renders backend packages and their included services", () => {
    render(<OwnerPackagesPreview data={packagesData} />);
    expect(screen.getByText("Live Reset")).toBeInTheDocument();
    expect(screen.getByText("Backend package")).toBeInTheDocument();
    expect(screen.getByText("Live Cut")).toBeInTheDocument();
    expect(
      screen.queryByText(/draft|pause|publish|archive/i),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Actions for Live Reset" })[0]).toHaveAttribute(
      "data-catalog-focus",
      "packages:21",
    );
  });

  it("keeps package service checkboxes label-associated without capturing price input clicks", () => {
    render(<OwnerPackagesPreview data={packagesData} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Add package" })[0]);

    const checkbox = screen.getByRole("checkbox", {
      name: "Include Live Cut",
    });
    const priceInput = screen.getByRole("spinbutton", {
      name: "Package item price for Live Cut",
    });
    const label = document.querySelector<HTMLLabelElement>(
      'label[for="package-service-11"]',
    );

    expect(label).not.toBeNull();
    expect(label).toHaveAttribute("for", "package-service-11");
    expect(checkbox).toHaveAttribute("id", "package-service-11");
    expect(checkbox).toHaveAttribute("type", "checkbox");
    expect(label?.parentElement).toHaveClass("py-1");
    expect(label).not.toContainElement(priceInput);
    expect(
      new Set(
        Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'), (input) => input.id),
      ).size,
    ).toBe(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').length);

    fireEvent.click(within(label as HTMLLabelElement).getByText("Live Cut"));
    expect(checkbox).toBeChecked();

    fireEvent.change(priceInput, { target: { value: "900" } });
    expect(priceInput).toHaveValue(900);
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it("uses the same native association for gift-card catalog choices", () => {
    render(<OwnerGiftCardsPreview data={giftCardsData} />);
    fireEvent.click(
      document.querySelector<HTMLButtonElement>(
        '[data-catalog-focus="gift-cards:create"]',
      ) as HTMLButtonElement,
    );

    const checkbox = screen.getByRole("checkbox", {
      name: "Live Cut Service · Hair",
    });
    const label = document.querySelector<HTMLLabelElement>(
      'label[for="gift-card-service-11"]',
    );

    expect(label).not.toBeNull();
    expect(label).toHaveAttribute("for", "gift-card-service-11");
    expect(label).toHaveClass("min-w-0");
    expect(checkbox).toHaveAttribute("id", "gift-card-service-11");
    fireEvent.click(within(label as HTMLLabelElement).getByText("Live Cut"));
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it("renders real voucher status and values", () => {
    render(<OwnerVouchersPreview data={vouchersData} />);
    expect(screen.getByText("LIVE20")).toBeInTheDocument();
    expect(screen.getByText("20% off")).toBeInTheDocument();
    expect(screen.getByText("OLD500")).toBeInTheDocument();
    expect(screen.queryByText("Scheduled")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Actions for LIVE20" })[0]).toHaveAttribute(
      "data-catalog-focus",
      "vouchers:31",
    );
  });

  it("renders gift-card recipients and inclusions without monetary fields", () => {
    render(<OwnerGiftCardsPreview data={giftCardsData} />);
    expect(screen.getByText("Live Recipient")).toBeInTheDocument();
    expect(screen.getByText("live@example.com")).toBeInTheDocument();
    expect(screen.getByText("Live Cut")).toBeInTheDocument();
    expect(screen.getByText("Live Reset")).toBeInTheDocument();
    expect(
      screen.queryByText(/original value|available balance|sender/i),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Actions for GIFT-LIVE" })[0]).toHaveAttribute(
      "data-catalog-focus",
      "gift-cards:41",
    );
  });

  it("surfaces a backend mutation error without closing the service editor", async () => {
    createService.mockResolvedValue({
      success: false,
      error: "Backend rejected the service",
    });
    const onChanged = vi.fn();
    render(<OwnerServicesPreview data={servicesData} onChanged={onChanged} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Add service" })[0]);
    fireEvent.change(screen.getByLabelText("Service name"), {
      target: { value: "New Service" },
    });
    fireEvent.change(screen.getByLabelText("Price"), {
      target: { value: "900" },
    });
    const submit = screen.getByRole("button", { name: "Create service" });
    fireEvent.submit(submit.closest("form") as HTMLFormElement);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Backend rejected the service",
    );
    await waitFor(() => expect(createService).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "New Service" })).not.toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("uses one accessible responsive drawer and sheet editor", () => {
    render(<OwnerServicesPreview data={servicesData} />);
    const createTrigger = screen.getAllByRole("button", { name: "Add service" })[0];
    fireEvent.click(createTrigger);
    const dialog = screen.getByRole("dialog", { name: "Add a service" });
    const backdrop = screen.getByTestId("catalog-editor-backdrop");
    const footer = screen.getByRole("button", { name: "Create service" }).parentElement;
    expect(dialog).toHaveClass("bottom-0", "rounded-t-[26px]");
    expect(dialog).toHaveStyle({ opacity: "1", visibility: "visible" });
    expect(backdrop.style.backdropFilter).toBe("blur(4px)");
    expect(backdrop).toHaveStyle({ opacity: "1", visibility: "visible" });
    expect(footer).toHaveClass(styles.footer);
    expect(footer).not.toHaveClass("pb-[max(0.75rem,env(safe-area-inset-bottom))]");
    fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
    expect(screen.getByText("Set the booking details, duration, and estimated margin.")).toBeInTheDocument();
    return waitFor(() =>
      expect(
        Array.from(
          document.querySelectorAll<HTMLElement>(
            '[data-catalog-focus="services:create"]',
          ),
        ).some((button) => button === document.activeElement),
      ).toBe(true),
    );
  });

  it("focuses a visible field after skipping hidden form inputs", async () => {
    render(
      <CatalogEditorOverlay open onOpenChange={vi.fn()} title="New booking" description="Add a booking" restoreFocusKey="booking:create">
        <input type="hidden" name="customerId" />
        <input aria-label="Customer name" />
      </CatalogEditorOverlay>,
    );
    const field = screen.getByRole("textbox", { name: "Customer name" });
    vi.spyOn(field, "getClientRects").mockReturnValue({ length: 1 } as DOMRectList);
    await waitFor(() => expect(field).toHaveFocus());
  });

  it("settles the overlay when its tab is hidden", async () => {
    const visibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    try {
      const panel = (open: boolean) => (
        <CatalogEditorOverlay open={open} onOpenChange={vi.fn()} title="New booking" description="Add a booking" restoreFocusKey="booking:create">
          <input aria-label="Customer name" />
        </CatalogEditorOverlay>
      );
      const view = render(panel(true));
      expect(screen.getByRole("dialog", { name: "New booking" })).toHaveStyle({ opacity: "1", visibility: "visible" });
      view.rerender(panel(false));
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "New booking" })).not.toBeInTheDocument());
    } finally {
      if (visibility) Object.defineProperty(document, "visibilityState", visibility);
      else Reflect.deleteProperty(document, "visibilityState");
      vi.unstubAllGlobals();
    }
  });

  it("restores a stable row action after the transient edit control disappears", async () => {
    render(<EditFocusHarness />);
    const actionTrigger = document.querySelector<HTMLElement>(
      '[data-catalog-focus="services:11"]',
    );
    expect(actionTrigger).not.toBeNull();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Edit service" }), {
      key: "Escape",
    });
    await waitFor(() => expect(actionTrigger).toHaveFocus());
  });

  it("shows a service create immediately, reconciles server values, and blocks duplicate submits", async () => {
    let resolve!: (value: unknown) => void;
    createService.mockReturnValue(new Promise((done) => { resolve = done; }));
    const onChanged = vi.fn();
    render(<OwnerServicesPreview data={servicesData} onChanged={onChanged} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Add service" })[0]);
    fireEvent.change(screen.getByLabelText("Service name"), { target: { value: "Optimistic Facial" } });
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "900" } });
    const form = screen.getByRole("button", { name: "Create service" }).closest("form") as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(screen.getByText("Optimistic Facial")).toBeInTheDocument();
    expect(screen.getAllByText("Saving…").length).toBeGreaterThan(0);
    expect(createService).toHaveBeenCalledTimes(1);

    resolve({
      success: true,
      data: {
        id: 99,
        name: "Authoritative Facial",
        description: null,
        category: "Hair",
        price: 950,
        estimatedCost: 100,
        durationMinutes: 45,
        monthlyBookings: 0,
      },
    });
    expect(await screen.findByText("Authoritative Facial")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Optimistic Facial")).not.toBeInTheDocument());
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith({
      type: "upsert",
      item: expect.objectContaining({ id: 99, name: "Authoritative Facial" }),
    }));
    await waitFor(() =>
      expect(
        Array.from(
          document.querySelectorAll<HTMLElement>(
            '[data-catalog-focus="services:create"]',
          ),
        ).some((button) => button === document.activeElement),
      ).toBe(true),
    );
  });
});
