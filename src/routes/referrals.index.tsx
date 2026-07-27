import { guarded } from "@/components/require-access";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { ReferralsTable, useEasyFundOpportunities } from "@/components/referrals-table";

export const Route = createFileRoute("/referrals/")({
  component: guarded("referrals", "Referrals", ReferralsDashboard),
});

function ReferralsDashboard() {
  const easyFundOpps = useEasyFundOpportunities();

  return (
    <AppShell>
      <PageHeader
        title="Referrals dashboard"
        subtitle={
          <span>
            {easyFundOpps.length} EasyFund opportunities · bill lenders and
            record dealer payouts
          </span>
        }
      />
      <PageBody>
        <ReferralsTable />
      </PageBody>
    </AppShell>
  );
}
