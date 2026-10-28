"use client";

import { useMemo, useRef, useState } from "react";
import type { OwnerCatalogCommittedChange } from "@/features/catalog/types/owner-catalog-preview";

export type CatalogMutationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

type PendingOperation<T> = {
  id: number;
  targetId: number;
  sequence: number;
  apply: (items: T[]) => T[];
};

export function useOptimisticCatalog<T extends { id: number }>(
  initialItems: T[],
  onCommit?: (change: OwnerCatalogCommittedChange<T>) => void,
) {
  const [authoritative, setAuthoritative] = useState(() => ({
    items: initialItems,
    sourceItems: initialItems,
    sequences: new Map<number, number>(),
  }));
  const [operations, setOperations] = useState<PendingOperation<T>[]>([]);
  const operationSequence = useRef(0);
  const temporaryId = useRef(-1);
  const latestCommittedSequence = useRef(new Map<number, number>());

  if (authoritative.sourceItems !== initialItems) {
    setAuthoritative({
      ...authoritative,
      items: initialItems,
      sourceItems: initialItems,
    });
  }

  const items = useMemo(
    () =>
      operations.reduce((current, operation) => {
        const authoritativeSequence =
          authoritative.sequences.get(operation.targetId) ?? 0;
        return operation.sequence <= authoritativeSequence
          ? current
          : operation.apply(current);
      }, authoritative.items),
    [authoritative, operations],
  );
  const pendingIds = useMemo(
    () => new Set(operations.map((operation) => operation.targetId)),
    [operations],
  );

  function nextTemporaryId() {
    return temporaryId.current--;
  }

  async function run<R extends CatalogMutationResult<T>>(
    targetId: number,
    apply: (items: T[]) => T[],
    task: () => Promise<R>,
    reconcile: (items: T[], data: T) => T[],
    committedChange: (data: T) => OwnerCatalogCommittedChange<T>,
  ) {
    const sequence = ++operationSequence.current;
    const operation: PendingOperation<T> = {
      id: sequence,
      targetId,
      sequence,
      apply,
    };
    setOperations((current) => [...current, operation]);

    let result: R;
    try {
      result = await task();
    } catch {
      result = { success: false, error: "The change could not be saved. Please try again." } as R;
    }

    if (result.success) {
      const latest = latestCommittedSequence.current.get(targetId) ?? 0;
      if (sequence >= latest) {
        latestCommittedSequence.current.set(targetId, sequence);
        setAuthoritative((current) => {
          const sequences = new Map(current.sequences);
          sequences.set(targetId, sequence);
          return {
            items: reconcile(current.items, result.data),
            sourceItems: current.sourceItems,
            sequences,
          };
        });
        onCommit?.(committedChange(result.data));
      }
    }
    setOperations((current) => current.filter((entry) => entry.id !== sequence));
    return result;
  }

  return {
    items,
    pendingIds,
    nextTemporaryId,
    create<R extends CatalogMutationResult<T>>(optimistic: T, task: () => Promise<R>) {
      return run(
        optimistic.id,
        (items) => [optimistic, ...items],
        task,
        (items, data) => [data, ...items.filter((item) => item.id !== optimistic.id)],
        (data) => ({ type: "upsert", item: data }),
      );
    },
    update<R extends CatalogMutationResult<T>>(optimistic: T, task: () => Promise<R>) {
      return run(
        optimistic.id,
        (items) => items.map((item) => (item.id === optimistic.id ? optimistic : item)),
        task,
        (items, data) => items.map((item) => (item.id === optimistic.id ? data : item)),
        (data) => ({ type: "upsert", item: data }),
      );
    },
    remove<R extends CatalogMutationResult<T>>(id: number, task: () => Promise<R>) {
      return run(
        id,
        (items) => items.filter((item) => item.id !== id),
        task,
        (items) => items.filter((item) => item.id !== id),
        () => ({ type: "delete", id }),
      );
    },
  };
}
