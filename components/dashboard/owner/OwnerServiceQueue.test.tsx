import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OwnerServiceQueue from "./OwnerServiceQueue";

// TODO: Mock server actions in "@/lib/server actions/dashboard"
// for deterministic tests.

describe("OwnerServiceQueue", () => {
  it("renders empty states", () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <OwnerServiceQueue
          businessSlug="demo"
          pendingServices={[]}
          claimedServices={[]}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Queue is clear")).toBeInTheDocument();
  });
});
