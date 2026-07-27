import { guarded } from "@/components/require-access";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { docTotal, listDocs, STATUS_STYLES, useBillingStore } from "@/lib/billing";
import { formatMoney } from "@/lib/currency";

export const Route = createFileRoute("/billing/invoices/")({
  component: guarded("billing", "Billing", InvoicesPage),
});

function InvoicesPage() {
  useBillingStore();
  const docs = listDocs("invoice");

  return (
    <AppShell>
      <PageHeader
        title="Invoices"
        subtitle={<span>{docs.length} invoices issued</span>}
        actions={
          <Button size="sm" asChild>
            <Link to="/billing/invoices/new" search={{ companyId: undefined, opportunityId: undefined }}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New invoice
            </Link>
          </Button>
        }
      />
      <PageBody>
        <div className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
          {docs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
              <FileText className="h-8 w-8 text-muted-foreground/60" />
              No invoices yet.
              <Button size="sm" asChild className="mt-2">
                <Link to="/billing/invoices/new" search={{ companyId: undefined, opportunityId: undefined }}>Create the first one</Link>
              </Button>
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-secondary/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Number</th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Issued</th>
                  <th className="px-3 py-2">Due</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-3 py-2 font-semibold text-brand-deep">
                      <Link
                        to="/billing/invoices/$id"
                        params={{ id: d.id }}
                        className="text-brand hover:underline"
                      >
                        {d.number}
                      </Link>
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
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(d.issued_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {d.due_at ? new Date(d.due_at).toLocaleDateString() : "Due upon receipt"}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {formatMoney(docTotal(d), d.currency)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge className={STATUS_STYLES[d.status]}>{d.status}</Badge>
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
