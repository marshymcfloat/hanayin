import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useOptimisticCatalog } from "./useOptimisticCatalog";

type Item = { id: number; name: string };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("useOptimisticCatalog", () => {
  it("creates with a stable temporary id and reconciles the authoritative item", async () => {
    const response = deferred<{ success: true; data: Item }>();
    const initial = [{ id: 1, name: "Existing" }];
    const { result } = renderHook(() => useOptimisticCatalog<Item>(initial));
    const optimistic = { id: result.current.nextTemporaryId(), name: "Draft" };
    let mutation!: Promise<unknown>;
    act(() => { mutation = result.current.create(optimistic, () => response.promise); });
    expect(result.current.items[0]).toEqual(optimistic);
    expect(result.current.pendingIds.has(optimistic.id)).toBe(true);

    await act(async () => {
      response.resolve({ success: true, data: { id: 9, name: "Server name" } });
      await mutation;
    });
    expect(result.current.items).toEqual([{ id: 9, name: "Server name" }, { id: 1, name: "Existing" }]);
  });

  it("rolls back an exact failed update and delete", async () => {
    const initial = [{ id: 1, name: "Original" }];
    const { result } = renderHook(() => useOptimisticCatalog<Item>(initial));
    await act(async () => {
      await result.current.update({ id: 1, name: "Changed" }, async () => ({ success: false, error: "Rejected" }));
    });
    expect(result.current.items).toEqual([{ id: 1, name: "Original" }]);
    await act(async () => {
      await result.current.remove(1, async () => ({ success: false, error: "Still referenced" }));
    });
    expect(result.current.items).toEqual([{ id: 1, name: "Original" }]);
  });

  it("does not let an older response overwrite a newer authoritative update", async () => {
    const older = deferred<{ success: true; data: Item }>();
    const newer = deferred<{ success: true; data: Item }>();
    const initial = [{ id: 1, name: "Original" }];
    const { result } = renderHook(() => useOptimisticCatalog<Item>(initial));
    let olderMutation!: Promise<unknown>;
    let newerMutation!: Promise<unknown>;
    act(() => {
      olderMutation = result.current.update({ id: 1, name: "First" }, () => older.promise);
      newerMutation = result.current.update({ id: 1, name: "Second" }, () => newer.promise);
    });
    expect(result.current.items[0].name).toBe("Second");

    await act(async () => {
      newer.resolve({ success: true, data: { id: 1, name: "Second authoritative" } });
      await newerMutation;
    });
    expect(result.current.items[0].name).toBe("Second authoritative");
    await act(async () => {
      older.resolve({ success: true, data: { id: 1, name: "Stale authoritative" } });
      await olderMutation;
    });
    expect(result.current.items[0].name).toBe("Second authoritative");
  });

  it("does not commit an older edit after a successful delete of the same item", async () => {
    const older = deferred<{ success: true; data: Item }>();
    const newer = deferred<{ success: true; data: Item }>();
    const onCommit = vi.fn();
    const initial = [{ id: 1, name: "Original" }];
    const { result } = renderHook(() => useOptimisticCatalog<Item>(initial, onCommit));
    let olderMutation!: Promise<unknown>;
    let newerMutation!: Promise<unknown>;
    act(() => {
      olderMutation = result.current.update({ id: 1, name: "Old edit" }, () => older.promise);
      newerMutation = result.current.remove(1, () => newer.promise);
    });

    await act(async () => {
      newer.resolve({ success: true, data: initial[0] });
      await newerMutation;
    });
    await act(async () => {
      older.resolve({ success: true, data: { id: 1, name: "Stale edit" } });
      await olderMutation;
    });

    expect(result.current.items).toEqual([]);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith({ type: "delete", id: 1 });
  });
});
