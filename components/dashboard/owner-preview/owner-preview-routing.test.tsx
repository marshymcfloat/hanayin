import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  OwnerWorkspaceBaseProvider,
  ownerWorkspaceHref,
  useOwnerWorkspaceBasePath,
} from "./owner-preview-routing";
import { OwnerWorkspaceLink } from "./OwnerWorkspaceLink";

function RouteBase() {
  return <span>{useOwnerWorkspaceBasePath()}</span>;
}

describe("owner workspace route base", () => {
  it("keeps existing preview URLs by default", () => {
    render(<RouteBase />);
    expect(screen.getByText("/owner-dashboard-preview")).toBeInTheDocument();
  });

  it("uses canonical owner URLs when provided by the app layout", () => {
    render(
      <OwnerWorkspaceBaseProvider basePath="/app">
        <RouteBase />
      </OwnerWorkspaceBaseProvider>,
    );
    expect(screen.getByText("/app")).toBeInTheDocument();
    expect(ownerWorkspaceHref("/app", "studio & spa", "/bookings")).toBe(
      "/app/studio%20%26%20spa/bookings",
    );
  });

  it("retargets preview navigation under the canonical owner base", () => {
    render(<OwnerWorkspaceBaseProvider basePath="/app"><OwnerWorkspaceLink href="/owner-dashboard-preview/studio/bookings">Bookings</OwnerWorkspaceLink></OwnerWorkspaceBaseProvider>);
    expect(screen.getByRole("link", { name: "Bookings" })).toHaveAttribute("href", "/app/studio/bookings");
  });
});
