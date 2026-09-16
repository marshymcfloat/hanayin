import { getPlatformAuditData } from "@/features/platform/queries/audit";
import { connection } from "next/server";
import {
  PlatformMetricCard,
  PlatformPageHeader,
  formatPlatformDateTime,
  platformPanelClass,
  platformTableCellClass,
  platformTableClass,
  platformTableContainerClass,
  platformTableHeadClass,
  platformTableWrapCellClass,
} from "../_components/platform-ui";

export default async function PlatformAuditPage() {
  await connection();

  const data = await getPlatformAuditData();
  if (!data) return null;
  const { logs, uniqueActionTypes, systemActions, userActions } = data;

  return (
    <div className="space-y-6">
      <PlatformPageHeader
        title="Platform Audit Trail"
        description="Review operational events across billing, referrals, and subscription control with full actor visibility."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PlatformMetricCard label="Total Logs" value={logs.length} />
        <PlatformMetricCard
          label="Action Types"
          value={uniqueActionTypes}
          tone="accent"
        />
        <PlatformMetricCard label="User Actions" value={userActions} />
        <PlatformMetricCard label="System Actions" value={systemActions} />
      </div>

      <section className={`${platformPanelClass} p-5 sm:p-6`}>
        <div className={platformTableContainerClass}>
          <table className={platformTableClass}>
            <thead>
              <tr className="border-b border-stone-200">
                <th className={platformTableHeadClass}>Time</th>
                <th className={platformTableHeadClass}>Action</th>
                <th className={platformTableHeadClass}>Target</th>
                <th className={platformTableHeadClass}>Business</th>
                <th className={platformTableHeadClass}>Actor</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-stone-100 last:border-0 hover:bg-stone-50/50 transition-colors"
                >
                  <td className={`${platformTableCellClass} min-w-[160px]`}>
                    {formatPlatformDateTime(log.created_at)}
                  </td>
                  <td
                    className={`${platformTableCellClass} min-w-[190px] max-w-[260px] ${platformTableWrapCellClass}`}
                  >
                    <p className="font-medium text-stone-900">{log.action}</p>
                  </td>
                  <td
                    className={`${platformTableCellClass} min-w-[210px] max-w-[320px] ${platformTableWrapCellClass}`}
                  >
                    <p>{log.target_type}</p>
                    <p className="text-xs text-stone-500">{log.target_id}</p>
                  </td>
                  <td
                    className={`${platformTableCellClass} min-w-[160px] max-w-[220px] ${platformTableWrapCellClass}`}
                  >
                    {log.business?.name ?? "-"}
                  </td>
                  <td
                    className={`${platformTableCellClass} min-w-[200px] max-w-[280px] ${platformTableWrapCellClass}`}
                  >
                    {log.actor_user?.name ??
                      log.actor_user?.contact_number ??
                      log.actor_identifier ??
                      "SYSTEM"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
