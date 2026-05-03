import { render, screen } from "@testing-library/react";
import { deriveRoleBadgeVariant, RoleBadge } from "./RoleBadge";

describe("<RoleBadge>", () => {
  it("renders the default label for each variant", () => {
    render(<RoleBadge variant="OWNER" />);
    expect(screen.getByText("Owner")).toBeInTheDocument();

    render(<RoleBadge variant="MANAGER" />);
    expect(screen.getByText("Manager")).toBeInTheDocument();

    render(<RoleBadge variant="CASHIER" />);
    expect(screen.getByText("Cashier")).toBeInTheDocument();

    render(<RoleBadge variant="STAFF" />);
    expect(screen.getByText("Staff")).toBeInTheDocument();
  });

  it("renders a custom label when provided", () => {
    render(<RoleBadge variant="OWNER" label="Founder" />);
    expect(screen.getByText("Founder")).toBeInTheDocument();
  });

  it("applies the variant data attribute", () => {
    render(<RoleBadge variant="MANAGER" />);
    expect(screen.getByText("Manager")).toHaveAttribute("data-role", "MANAGER");
  });
});

describe("deriveRoleBadgeVariant", () => {
  it("maps OWNER role to OWNER variant", () => {
    expect(deriveRoleBadgeVariant({ role: "OWNER" })).toBe("OWNER");
    expect(
      deriveRoleBadgeVariant({ role: "OWNER", staffProfile: "MANAGER" }),
    ).toBe("OWNER");
  });

  it("maps EMPLOYEE role to its staffProfile", () => {
    expect(
      deriveRoleBadgeVariant({ role: "EMPLOYEE", staffProfile: "MANAGER" }),
    ).toBe("MANAGER");
    expect(
      deriveRoleBadgeVariant({ role: "EMPLOYEE", staffProfile: "CASHIER" }),
    ).toBe("CASHIER");
    expect(
      deriveRoleBadgeVariant({ role: "EMPLOYEE", staffProfile: "STAFF" }),
    ).toBe("STAFF");
  });

  it("falls back to STAFF when staffProfile is missing", () => {
    expect(deriveRoleBadgeVariant({ role: "EMPLOYEE" })).toBe("STAFF");
    expect(
      deriveRoleBadgeVariant({ role: "EMPLOYEE", staffProfile: null }),
    ).toBe("STAFF");
  });
});
