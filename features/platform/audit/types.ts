export type AuditEntry = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorId: string | null;
  actorType: string;
  changes: Record<string, unknown> | null;
  createdAt: string;
};

export type AuditHistoryResult =
  | { success: true; entries: AuditEntry[] }
  | { success: false; error: string };
