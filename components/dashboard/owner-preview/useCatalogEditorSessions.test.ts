import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCatalogEditorSessions } from "./useCatalogEditorSessions";

const error = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error } }));

describe("independent catalog drafts", () => {
  it("does not allow a late failure or completion to replace a newer form", () => {
    const { result } = renderHook(() => useCatalogEditorSessions<{ name: string }>());
    act(() => result.current.open({ name: "First" }));
    act(() => { result.current.status(1, "pending"); result.current.dismiss(1); });
    act(() => result.current.open({ name: "Second" }));
    act(() => result.current.failed(1, "Rejected"));
    const recover = error.mock.calls.at(-1)![1].action.onClick;
    act(recover);
    expect(result.current.activeId).toBe(2);
    expect(result.current.sessions[0].item?.name).toBe("First");
    act(() => result.current.dismiss(2));
    act(recover);
    expect(result.current.activeId).toBe(1);
    act(() => { result.current.status(1, "saved"); result.current.dismiss(1); });
    act(recover);
    expect(result.current.activeId).toBeNull();
  });

  it("does not resurrect a draft after its page unmounts", () => {
    const { result, unmount } = renderHook(() => useCatalogEditorSessions());
    act(() => result.current.open());
    act(() => result.current.failed(1, "Rejected"));
    const recover = error.mock.calls.at(-1)![1].action.onClick;
    unmount();
    expect(() => act(recover)).not.toThrow();
  });
});
