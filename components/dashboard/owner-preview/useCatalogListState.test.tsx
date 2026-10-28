import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { useCatalogListState } from "./useCatalogListState";

describe("catalog list memory", () => {
  it("restores list choices after navigation but not after the owner cache is cleared", () => {
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const first = renderHook(() => useCatalogListState("studio:services", "query", ""), { wrapper });
    act(() => first.result.current[1]("Massage"));
    first.unmount();
    const second = renderHook(() => useCatalogListState("studio:services", "query", ""), { wrapper });
    expect(second.result.current[0]).toBe("Massage");
    second.unmount();
    client.clear();
    const third = renderHook(() => useCatalogListState("studio:services", "query", ""), { wrapper });
    expect(third.result.current[0]).toBe("");
  });
});
