import { updateOnboardingApplicationStatusAction } from "@/features/platform/actions/platform-admin";
import { getPlatformApplicationsData } from "@/features/platform/queries/applications";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import {
  buildPlatformErrorPath,
  type PlatformSearchParams,
  buildPlatformSuccessPath,
  getPlatformFlashMessage,
  PlatformFlashNotice,
  rethrowIfRedirectError,
  toActionErrorMessage,
} from "../_components/action-feedback";
import {
  PlatformMetricCard,
  PlatformPageHeader,
  PlatformStatusBadge,
  formatPlatformDate,
  platformDangerButtonClass,
  platformPanelClass,
  platformSecondaryButtonClass,
  platformTableCellClass,
  platformTableClass,
  platformTableContainerClass,
  platformTableHeadClass,
  platformTableWrapCellClass,
  formatPhpFromCentavos,
} from "../_components/platform-ui";
import {
  BUSINESS_STRUCTURE_TEMPLATES,
  formatBusinessStructureLabel,
} from "@/lib/business-structure";
import { ConvertApplicationDialog } from "./_components/ConvertApplicationDialog";

type PlatformApplicationsPageProps = {
  searchParams?: PlatformSearchParams;
};

const PENDING_APPLICATION_STATUSES = new Set(["NEW", "CONTACTED", "APPROVED"]);

function getPendingAgeInfo(createdAt: Date) {
  const hours = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60));

  if (hours >= 72) {
    return {
      label: "72h+ pending",
      className: "border-rose-200 bg-rose-50 text-rose-700",
      hours,
    };
  }

  if (hours >= 24) {
    return {
      label: "24h+ pending",
      className: "border-amber-200 bg-amber-50 text-amber-700",
      hours,
    };
  }

  return {
    label: "<24h pending",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    hours,
  };
}

export default async function PlatformApplicationsPage({
  searchParams,
}: PlatformApplicationsPageProps) {
  await connection();
  const flash = await getPlatformFlashMessage(searchParams);
  const data = await getPlatformApplicationsData();
  if (!data.success && data.error === "Model unavailable") {
    return (
      <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-800">
        Onboarding applications are unavailable in this runtime. Restart the dev server after
        running `npx prisma generate`.
      </section>
    );
  }

  if (!data.success) redirect("/");
  const { applications, limitedByAccelerate, catalogPlans, defaultAssignablePlanCode } = data;

  async function markContactedFormAction(applicationId: string) {
    "use server";
    try {
      const result = await updateOnboardingApplicationStatusAction({
        applicationId,
        status: "CONTACTED",
      });
      if (!result.success) {
        redirect(buildPlatformErrorPath("/platform/applications", result.error));
      }

      redirect(buildPlatformSuccessPath("/platform/applications", "Application marked as contacted."));
    } catch (error) {
      rethrowIfRedirectError(error);
      redirect(
        buildPlatformErrorPath(
          "/platform/applications",
          toActionErrorMessage(error, "Unable to update application status."),
        ),
      );
    }
  }

  async function markApprovedFormAction(applicationId: string) {
    "use server";
    try {
      const result = await updateOnboardingApplicationStatusAction({
        applicationId,
        status: "APPROVED",
      });
      if (!result.success) {
        redirect(buildPlatformErrorPath("/platform/applications", result.error));
      }

      redirect(buildPlatformSuccessPath("/platform/applications", "Application approved."));
    } catch (error) {
      rethrowIfRedirectError(error);
      redirect(
        buildPlatformErrorPath(
          "/platform/applications",
          toActionErrorMessage(error, "Unable to approve application."),
        ),
      );
    }
  }

  async function markRejectedFormAction(applicationId: string) {
    "use server";
    try {
      const result = await updateOnboardingApplicationStatusAction({
        applicationId,
        status: "REJECTED",
        reviewNotes: "Rejected by admin",
      });
      if (!result.success) {
        redirect(buildPlatformErrorPath("/platform/applications", result.error));
      }

      redirect(buildPlatformSuccessPath("/platform/applications", "Application rejected."));
    } catch (error) {
      rethrowIfRedirectError(error);
      redirect(
        buildPlatformErrorPath(
          "/platform/applications",
          toActionErrorMessage(error, "Unable to reject application."),
        ),
      );
    }
  }

  // The old convertToBusinessFormAction was replaced by the
  // ConvertApplicationDialog client component, which calls
  // convertOnboardingApplicationToBusinessAction directly so the
  // success modal can stay open and show the magic link.

  const newCount = applications.filter((application) => application.status === "NEW").length;
  const contactedCount = applications.filter((application) => application.status === "CONTACTED").length;
  const approvedCount = applications.filter((application) => application.status === "APPROVED").length;
  const pendingApplications = applications.filter((application) =>
    PENDING_APPLICATION_STATUSES.has(application.status),
  );
  const pending24hCount = pendingApplications.filter((application) => {
    const ageInfo = getPendingAgeInfo(application.created_at);
    return ageInfo.hours >= 24;
  }).length;
  const pending72hCount = pendingApplications.filter((application) => {
    const ageInfo = getPendingAgeInfo(application.created_at);
    return ageInfo.hours >= 72;
  }).length;

  return (
    <div className="space-y-6">
      <PlatformPageHeader
        title="Onboarding Applications"
        description="Review every inbound request, move qualified leads through approval, and convert them into paying businesses."
      />
      {flash ? <PlatformFlashNotice flash={flash} /> : null}
      {limitedByAccelerate ? (
        <article className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Applications are temporarily unavailable because Prisma Accelerate is rate-limiting
          requests. Retry in a minute.
        </article>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <PlatformMetricCard label="New" value={newCount} />
        <PlatformMetricCard label="Contacted" value={contactedCount} />
        <PlatformMetricCard label="Approved" value={approvedCount} tone="accent" />
        <PlatformMetricCard label="Pending 24h+" value={pending24hCount} />
        <PlatformMetricCard label="Pending 72h+" value={pending72hCount} />
      </div>

      <section className={`${platformPanelClass} p-5 sm:p-6`}>
        <div className={platformTableContainerClass}>
          <table className={platformTableClass}>
            <thead>
              <tr className="border-b border-[var(--pf-border)]">
                <th className={platformTableHeadClass}>Business</th>
                <th className={platformTableHeadClass}>Owner</th>
                <th className={platformTableHeadClass}>Referral</th>
                <th className={platformTableHeadClass}>Requested Setup</th>
                <th className={platformTableHeadClass}>Status</th>
                <th className={platformTableHeadClass}>Reviewed By</th>
                <th className={platformTableHeadClass}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((application) => {
                const isPending = PENDING_APPLICATION_STATUSES.has(application.status);
                const pendingAgeInfo = isPending
                  ? getPendingAgeInfo(application.created_at)
                  : null;

                return (
                  <tr key={application.id} className="border-b border-[var(--pf-border)]/80 last:border-0">
                    <td className={`${platformTableCellClass} min-w-[220px] max-w-[280px] ${platformTableWrapCellClass}`}>
                      <p className="font-semibold text-[var(--pf-text)]">{application.business_name}</p>
                      <p className="mt-1 text-xs text-[var(--pf-muted)]">
                        Submitted {formatPlatformDate(application.created_at)}
                      </p>
                      {application.converted_business ? (
                        <p className="mt-1 text-xs font-medium text-emerald-700">
                          Converted: {application.converted_business.name} ({application.converted_business.slug})
                        </p>
                      ) : null}
                    </td>
                    <td className={`${platformTableCellClass} min-w-[220px] max-w-[280px] ${platformTableWrapCellClass}`}>
                      <p>{application.owner_name}</p>
                      <p className="text-xs text-[var(--pf-muted)]">{application.owner_email}</p>
                      {application.owner_phone ? (
                        <p className="text-xs text-[var(--pf-muted)]">{application.owner_phone}</p>
                      ) : null}
                    </td>
                    <td className={`${platformTableCellClass} min-w-[130px] max-w-[180px] ${platformTableWrapCellClass}`}>
                      {application.referral_code?.code ?? application.referral_code_input ?? "-"}
                    </td>
                    <td className={`${platformTableCellClass} min-w-[220px] max-w-[260px] ${platformTableWrapCellClass}`}>
                      <p className="font-medium text-[var(--pf-text)]">
                        {formatBusinessStructureLabel(application.requested_structure)}
                      </p>
                      <p className="text-xs text-[var(--pf-muted)]">
                        Staff self-booking:{" "}
                        {application.requested_allow_employee_self_booking
                          ? "Yes"
                          : "No"}
                      </p>
                      <p className="text-xs text-[var(--pf-muted)]">
                        Manager can serve:{" "}
                        {application.requested_manager_can_serve ? "Yes" : "No"}
                      </p>
                    </td>
                    <td className={platformTableCellClass}>
                      <div className="flex flex-col gap-1">
                        <PlatformStatusBadge status={application.status} />
                        {pendingAgeInfo ? (
                          <span
                            className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${pendingAgeInfo.className}`}
                          >
                            {pendingAgeInfo.label}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className={`${platformTableCellClass} min-w-[160px] max-w-[220px] ${platformTableWrapCellClass}`}>
                      {application.reviewed_by_user?.name ?? application.reviewed_by_user?.contact_number ?? "-"}
                    </td>
                    <td className={`${platformTableCellClass} min-w-[260px]`}>
                      <div className="flex flex-wrap gap-2">
                        <form action={markContactedFormAction.bind(null, application.id)}>
                          <button type="submit" className={platformSecondaryButtonClass}>
                            Contacted
                          </button>
                        </form>
                        <form action={markApprovedFormAction.bind(null, application.id)}>
                          <button
                            type="submit"
                            className={`${platformSecondaryButtonClass} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}
                          >
                            Approve
                          </button>
                        </form>
                        <form action={markRejectedFormAction.bind(null, application.id)}>
                          <button type="submit" className={platformDangerButtonClass}>
                            Reject
                          </button>
                        </form>
                        {catalogPlans.length > 0 &&
                        !application.converted_business &&
                        application.status !== "REJECTED" ? (
                          <ConvertApplicationDialog
                            application={{
                              applicationId: application.id,
                              businessName: application.business_name,
                              ownerName: application.owner_name,
                              ownerPhone: application.owner_phone,
                              requestedStructure: application.requested_structure,
                              requestedAllowEmployeeSelfBooking:
                                application.requested_allow_employee_self_booking,
                              requestedManagerCanServe:
                                application.requested_manager_can_serve,
                            }}
                            defaultPlanCode={defaultAssignablePlanCode}
                            planOptions={catalogPlans.map((plan) => ({
                              code: plan.code,
                              label: `${plan.name} (${formatPhpFromCentavos(plan.price_amount)})`,
                              trialDays: 0,
                            }))}
                            structureOptions={BUSINESS_STRUCTURE_TEMPLATES.map(
                              (template) => ({
                                value: template.value,
                                label: template.label,
                                defaultAllowEmployeeSelfBooking:
                                  template.allowEmployeeSelfBooking,
                                defaultManagerCanServe: template.managerCanServe,
                              }),
                            )}
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {applications.length === 0 ? (
                <tr>
                  <td colSpan={7} className={`${platformTableCellClass} py-6 text-center text-[var(--pf-muted)]`}>
                    {limitedByAccelerate
                      ? "Unable to load applications right now."
                      : "No onboarding applications found."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
