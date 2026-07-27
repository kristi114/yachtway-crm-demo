import { guarded } from "@/components/require-access";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileCheck2, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { docTotal, getDoc, listDocs, STATUS_STYLES, useBillingStore } from "@/lib/billing";
import { formatMoney } from "@/lib/currency";

export const Route = createFileRoute("/billing/estimates/")({
  component: guarded("billing", "Billing", EstimatesPage),
});

function EstimatesPage() {
  useBillingStore();
  const docs = listDocs("estimate");

  return (
    <AppShell>
      <PageHeader
        title="Estimates"
        subtitle={<span>{docs.length} estimates on file</span>}
        actions={
          <Button size="sm" asChild>
            <Link to="/billing/estimates/new" search={{ companyId: undefined, opportunityId: undefined }}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New estimate
            </Link>
          </Button>
        }
      />
      <PageBody>
        <div className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
          {docs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
              <FileCheck2 className="h-8 w-8 text-muted-foreground/60" />
              No estimates yet.
              <Button size="sm" asChild className="mt-2">
                <Link to="/billing/estimates/new" search={{ companyId: undefined, opportunityId: undefined }}>Draft your first estimate</Link>
              </Button>
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-secondary/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Number</th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Opportunity</th>
                  <th className="px-3 py-2">Issued</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Invoice</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-3 py-2 font-semibold text-brand-deep">
                      {d.share_token ? (
                        <Link
                          to="/billing/share/$token"
                          params={{ token: d.share_token }}
                          className="text-brand hover:underline"
                        >
                          {d.number}
                        </Link>
                      ) : (
                        d.number
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        to="/companies/$id"
                        params={{ id: d.companyId }}
                        className="text-brand hover:underline"
                      >
                        {d.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      {d.opportunityId ? (
                        <Link
                          to="/opportunities/$id"
                          params={{ id: d.opportunityId }}
                          className="text-brand hover:underline"
                        >
                          {d.opportunityName ?? "Opportunity"}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(d.issued_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {formatMoney(docTotal(d), d.currency)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge className={STATUS_STYLES[d.status]}>{d.status}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      {d.converted_invoice_id ? (
                        <Link
                          to="/billing/invoices/$id"
                          params={{ id: d.converted_invoice_id }}
                          className="text-brand hover:underline"
                        >
                          {getDoc(d.converted_invoice_id)?.number ?? "View"}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </PageBody>
    </AppShell>
  );
}
