import { createFileRoute } from "@tanstack/react-router";

import { guarded } from "@/components/require-access";
import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { ApplicationsDashboard } from "@/components/fintech/applications-dashboard";
import { lenderDashboard } from "@/lib/fintech-dashboards";

export const Route = createFileRoute("/lender")({
  head: () => ({ meta: [{ title: "Lender — EasyFund - YachtWay CRM" }] }),
  component: guarded("easyfund", "Lender dashboard", LenderPage),
});

function LenderPage() {
  const config = lenderDashboard();
  return (
    <AppShell>
      <PageHeader title="Lender — EasyFund" subtitle="Loan applications across the EasyFund pipeline." />
      <PageBody>
        <ApplicationsDashboard config={config} />
      </PageBody>
    </AppShell>
  );
}
