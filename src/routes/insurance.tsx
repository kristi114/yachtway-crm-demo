import { createFileRoute } from "@tanstack/react-router";

import { guarded } from "@/components/require-access";
import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { ApplicationsDashboard } from "@/components/fintech/applications-dashboard";
import { insuranceDashboard } from "@/lib/fintech-dashboards";

export const Route = createFileRoute("/insurance")({
  head: () => ({ meta: [{ title: "Insurance — MasterCover - YachtWay CRM" }] }),
  component: guarded("mastercover", "Insurance dashboard", InsurancePage),
});

function InsurancePage() {
  const config = insuranceDashboard();
  return (
    <AppShell>
      <PageHeader title="Insurance — MasterCover" subtitle="MasterCover quotes and bound policies." />
      <PageBody>
        <ApplicationsDashboard config={config} />
      </PageBody>
    </AppShell>
  );
}
