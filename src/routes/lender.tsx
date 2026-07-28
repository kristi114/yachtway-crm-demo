import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";

import { guarded } from "@/components/require-access";
import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { ApplicationsDashboard } from "@/components/fintech/applications-dashboard";
import { useAuth } from "@/lib/auth";
import { useDeals, dealsFor, lenderConfig, updateDeal, partnerName } from "@/lib/fintech-dashboards";

export const Route = createFileRoute("/lender")({
  head: () => ({ meta: [{ title: "Lender — EasyFund - YachtWay CRM" }] }),
  component: guarded("easyfund", "Lender dashboard", LenderPage),
});

function LenderPage() {
  const { user } = useAuth();
  const all = useDeals();
  const isPartner = user.role === "lender_partner";
  const partnerId = isPartner ? user.partnerId ?? null : null;
  const rows = dealsFor(all, "lender", partnerId);
  const config = lenderConfig();

  return (
    <AppShell>
      <PageHeader title={config.title} subtitle={config.subtitle} />
      <PageBody>
        <ApplicationsDashboard
          config={config}
          rows={rows}
          editable
          onSaveDeal={updateDeal}
          banner={
            isPartner ? (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/5 px-4 py-2.5 text-sm text-brand-deep">
                <ShieldCheck className="h-4 w-4 text-brand" />
                Partner view — showing only deals assigned to <strong>{partnerName(partnerId ?? undefined)}</strong>.
              </div>
            ) : null
          }
        />
      </PageBody>
    </AppShell>
  );
}
