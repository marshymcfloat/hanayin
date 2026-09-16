import {
  rejectReferralAttributionAction,
  runReferralRewardQualificationAction,
  updateReferralLeadStatusAction,
} from "@/features/platform/actions/platform-admin";
import { redirect } from "next/navigation";
import { getPlatformReferralsData } from "@/features/platform/queries/referrals";
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
  platformDangerButtonClass,
  platformPanelClass,
  platformPrimaryButtonClass,
  platformSecondaryButtonClass,
  platformTableCellClass,
  platformTableClass,
  platformTableContainerClass,
  platformTableHeadClass,
  platformTableWrapCellClass,
} from "../_components/platform-ui";

type PlatformReferralsPageProps = {
  searchParams?: PlatformSearchParams;
};

export default async function PlatformReferralsPage({
  searchParams,
}: PlatformReferralsPageProps) {
  const flash = await getPlatformFlashMessage(searchParams);
  const data = await getPlatformReferralsData();
  if (!data) redirect("/");
  const { referralCodes, leads, attributions, pendingAttributions, qualifiedAttributions, newLeads } = data;

  async function runQualificationFormAction() {
    "use server";
    try {
      const result = await runReferralRewardQualificationAction();
      if (!result.success) {
        redirect(buildPlatformErrorPath("/platform/referrals", result.error));
      }

      redirect(buildPlatformSuccessPath("/platform/referrals", "Referral qualification run completed."));
    } catch (error) {
      rethrowIfRedirectError(error);
      redirect(
        buildPlatformErrorPath(
          "/platform/referrals",
          toActionErrorMessage(error, "Unable to run referral qualification."),
        ),
      );
    }
  }

  async function markLeadContactedFormAction(leadId: string) {
    "use server";
    try {
      const result = await updateReferralLeadStatusAction({
        leadId,
        status: "CONTACTED",
      });
      if (!result.success) {
        redirect(buildPlatformErrorPath("/platform/referrals", result.error));
      }

      redirect(buildPlatformSuccessPath("/platform/referrals", "Referral lead marked contacted."));
    } catch (error) {
      rethrowIfRedirectError(error);
      redirect(
        buildPlatformErrorPath(
          "/platform/referrals",
          toActionErrorMessage(error, "Unable to update referral lead."),
        ),
      );
    }
  }

  async function rejectLeadFormAction(leadId: string) {
    "use server";
    try {
      const result = await updateReferralLeadStatusAction({
        leadId,
        status: "REJECTED",
      });
      if (!result.success) {
        redirect(buildPlatformErrorPath("/platform/referrals", result.error));
      }

      redirect(buildPlatformSuccessPath("/platform/referrals", "Referral lead rejected."));
    } catch (error) {
      rethrowIfRedirectError(error);
      redirect(
        buildPlatformErrorPath(
          "/platform/referrals",
          toActionErrorMessage(error, "Unable to reject referral lead."),
        ),
      );
    }
  }

  async function rejectAttributionFormAction(attributionId: string) {
    "use server";
    try {
      const result = await rejectReferralAttributionAction(attributionId, "Rejected by admin");
      if (!result.success) {
        redirect(buildPlatformErrorPath("/platform/referrals", result.error));
      }

      redirect(buildPlatformSuccessPath("/platform/referrals", "Referral attribution rejected."));
    } catch (error) {
      rethrowIfRedirectError(error);
      redirect(
        buildPlatformErrorPath(
          "/platform/referrals",
          toActionErrorMessage(error, "Unable to reject referral attribution."),
        ),
      );
    }
  }


  return (
    <div className="space-y-6">
      <PlatformPageHeader
        title="Referrals and Rewards"
        description="Monitor lead quality, attribute conversions accurately, and run payout qualification in one workflow."
        actions={
          <form action={runQualificationFormAction}>
            <button type="submit" className={platformPrimaryButtonClass}>
              Run Qualification and Rewards
            </button>
          </form>
        }
      />
      {flash ? <PlatformFlashNotice flash={flash} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PlatformMetricCard label="Referral Codes" value={referralCodes.length} />
        <PlatformMetricCard label="New Leads" value={newLeads} />
        <PlatformMetricCard label="Pending Attributions" value={pendingAttributions} />
        <PlatformMetricCard label="Qualified Attributions" value={qualifiedAttributions} tone="accent" />
      </div>

      <section className={`${platformPanelClass} p-5 sm:p-6`}>
        <h3 className="text-lg font-semibold tracking-tight text-[var(--pf-text)]">Referral Codes</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {referralCodes.map((code) => (
            <article
              key={code.id}
              className="rounded-2xl border border-[var(--pf-border)] bg-[var(--pf-surface-soft)]/70 p-4"
            >
              <p className="text-sm font-semibold text-[var(--pf-text)]">{code.business.name}</p>
              <p className="text-xs text-[var(--pf-muted)]">{code.business.slug}</p>
              <p className="mt-2 text-lg font-semibold tracking-wide text-[var(--pf-primary)]">{code.code}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`${platformPanelClass} p-5 sm:p-6`}>
        <h3 className="text-lg font-semibold tracking-tight text-[var(--pf-text)]">Referral Leads</h3>
        <div className={`mt-4 ${platformTableContainerClass}`}>
          <table className={platformTableClass}>
            <thead>
              <tr className="border-b border-[var(--pf-border)]">
                <th className={platformTableHeadClass}>Referrer</th>
                <th className={platformTableHeadClass}>Lead</th>
                <th className={platformTableHeadClass}>Status</th>
                <th className={platformTableHeadClass}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b border-[var(--pf-border)]/80 last:border-0">
                  <td className={`${platformTableCellClass} min-w-[180px] max-w-[220px] ${platformTableWrapCellClass}`}>
                    {lead.referral_code.business.name}
                  </td>
                  <td className={`${platformTableCellClass} min-w-[220px] max-w-[280px] ${platformTableWrapCellClass}`}>
                    <p className="font-medium text-[var(--pf-text)]">{lead.referred_business_name}</p>
                    <p className="text-xs text-[var(--pf-muted)]">{lead.owner_email}</p>
                  </td>
                  <td className={platformTableCellClass}>
                    <PlatformStatusBadge status={lead.status} />
                  </td>
                  <td className={`${platformTableCellClass} min-w-[200px]`}>
                    <div className="flex flex-wrap gap-2">
                      <form action={markLeadContactedFormAction.bind(null, lead.id)}>
                        <button type="submit" className={platformSecondaryButtonClass}>
                          Mark Contacted
                        </button>
                      </form>
                      <form action={rejectLeadFormAction.bind(null, lead.id)}>
                        <button type="submit" className={platformDangerButtonClass}>
                          Reject
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${platformPanelClass} p-5 sm:p-6`}>
        <h3 className="text-lg font-semibold tracking-tight text-[var(--pf-text)]">Attributions</h3>
        <div className={`mt-4 ${platformTableContainerClass}`}>
          <table className={platformTableClass}>
            <thead>
              <tr className="border-b border-[var(--pf-border)]">
                <th className={platformTableHeadClass}>Referrer</th>
                <th className={platformTableHeadClass}>Referred</th>
                <th className={platformTableHeadClass}>Status</th>
                <th className={platformTableHeadClass}>Action</th>
              </tr>
            </thead>
            <tbody>
              {attributions.map((item) => (
                <tr key={item.id} className="border-b border-[var(--pf-border)]/80 last:border-0">
                  <td className={`${platformTableCellClass} min-w-[180px] max-w-[220px] ${platformTableWrapCellClass}`}>
                    {item.referrer_business.name}
                  </td>
                  <td className={`${platformTableCellClass} min-w-[180px] max-w-[220px] ${platformTableWrapCellClass}`}>
                    {item.referred_business.name}
                  </td>
                  <td className={platformTableCellClass}>
                    <PlatformStatusBadge status={item.status} />
                  </td>
                  <td className={platformTableCellClass}>
                    <form action={rejectAttributionFormAction.bind(null, item.id)}>
                      <button type="submit" className={platformDangerButtonClass}>
                        Reject Attribution
                      </button>
                    </form>
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
