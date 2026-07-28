import { createFileRoute } from "@tanstack/react-router";

import { guarded } from "@/components/require-access";
import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { ApplicationsDashboard } from "@/components/fintech/applications-dashboard";
import { vatoDashboard } from "@/lib/fintech-dashboards";

export const Route = createFileRoute("/vato")({
  head: () => ({ meta: [{ title: "VATO - YachtWay CRM" }] }),
  component: guarded("vato", "VATO", VatoPage),
});

function VatoPage() {
  const config = vatoDashboard();
  return (
    <AppShell>
      <PageHeader title="VATO" subtitle="Vessel valuation & titling checks." />
      <PageBody>
        <ApplicationsDashboard config={config} />
      </PageBody>
    </AppShell>
  );
}
