import { formatDate } from "@/lib/format-date";
import { guarded } from "@/components/require-access";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, FileText, Mail, Pencil } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { EditInvoiceDialog } from "@/components/edit-invoice-dialog";
import { PageHeader, PageBody } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  docTotal, docSubtotal, getDoc, STATUS_STYLES, useBillingStore, type BillingDoc,
} from "@/lib/billing";
import { StudioPassSavingsNote } from "@/components/studio-pass-savings-note";
import { formatMoney } from "@/lib/currency";
import { getCompany } from "@/lib/mock-data";

export const Route = createFileRoute("/billing/estimates/$id")({
  head: () => ({
    meta: [
      { title: "Estimate — YachtWay CRM" },
      { name: "description", content: "View estimate details on YachtWay CRM." },
    ],
  }),
  component: guarded("billing", "Billing", EstimateDetailPage),
  notFoundComponent: () => (
    <AppShell>
      <PageHeader eyebrow="Estimate" title="Not found" />
      <PageBody>
        <p className="text-sm text-muted-foreground">
          That estimate does not exist.{" "}
          <Link to="/billing/estimates" className="text-brand hover:underline">Back to estimates</Link>
        </p>
      </PageBody>
    </AppShell>
  ),
});

function EstimateDetailPage() {
  useBillingStore();
  const [editing, setEditing] = useState(false);
  const { id } = Route.useParams();
  const found = getDoc(id);
  if (!found || found.kind !== "estimate") {
    return (
      <AppShell>
        <PageHeader eyebrow="Estimate" title="Not found" />
        <PageBody>
          <p className="text-sm text-muted-foreground">
            That estimate does not exist.{" "}
            <Link to="/billing/estimates" className="text-brand hover:underline">Back to estimates</Link>
          </p>
        </PageBody>
      </AppShell>
    );
  }
  const doc: BillingDoc = found;
  const total = docTotal(doc);
  const subtotal = docSubtotal(doc);
  const discAmt = subtotal - total;
  const company = getCompany(doc.companyId);

  return (
    <AppShell>
      <PageHeader
        eyebrow={<Link to="/billing/estimates" className="text-brand hover:underline">Estimates</Link>}
        title={doc.number}
        subtitle={
          <span className="flex items-center gap-2">
            <Badge className={STATUS_STYLES[doc.status]}>{doc.status}</Badge>
            <span>Issued {formatDate(doc.issued_at)}</span>
          </span>
        }
        actions={
          <>
            <Button size="sm" variant="outline" asChild>
              <Link to="/billing/estimates"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back</Link>
            </Button>
            <Button size="sm" onClick={() => setEditing(true)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/billing/invoice-pdf/$id" params={{ id: doc.id }}>
                <FileText className="mr-1.5 h-3.5 w-3.5" /> PDF view
              </Link>
            </Button>
            {doc.recipient_email && (
              <Button size="sm" variant="outline" asChild>
                <a href={`mailto:${doc.recipient_email}`}><Mail className="mr-1.5 h-3.5 w-3.5" /> Email</a>
              </Button>
            )}
          </>
        }
      />
      <EditInvoiceDialog doc={doc} open={editing} onOpenChange={setEditing} />
      <PageBody>
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base">Line items</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-[13px]">
                <thead className="bg-secondary/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Unit</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.line_items.map((li) => (
                    <tr key={li.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        {li.description}
                        {(li.vessel_name || li.options_summary) && (
                          <div className="text-[11px] text-muted-foreground">
                            {[li.vessel_name, li.options_summary].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{li.quantity}{li.unit_label ? ` ${li.unit_label}` : ""}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatMoney(li.unit_price, doc.currency)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">{formatMoney(li.quantity * li.unit_price, doc.currency)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {discAmt > 0 && (
                    <>
                      <tr className="border-t border-border">
                        <td className="px-4 py-1.5 text-right text-muted-foreground" colSpan={3}>Subtotal</td>
                        <td className="px-4 py-1.5 text-right tabular-nums">{formatMoney(subtotal, doc.currency)}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-1.5 text-right text-muted-foreground" colSpan={3}>
                          Discount{doc.discount?.type === "percent" ? ` (${doc.discount.value}%)` : ""}
                        </td>
                        <td className="px-4 py-1.5 text-right tabular-nums text-destructive">-{formatMoney(discAmt, doc.currency)}</td>
                      </tr>
                    </>
                  )}
                  <tr className="border-t border-border bg-secondary/20">
                    <td className="px-4 py-3 text-right text-[11px] uppercase tracking-wider text-muted-foreground" colSpan={3}>Total</td>
                    <td className="px-4 py-3 text-right text-base font-semibold tabular-nums text-brand-deep">{formatMoney(total, doc.currency)}</td>
                  </tr>
                </tfoot>
              </table>
              <div className="p-4 pt-0"><StudioPassSavingsNote doc={doc} /></div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Estimate for</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="font-medium text-foreground">{doc.name}</div>
                {company && (
                  <Link to="/companies/$id" params={{ id: company.id }} className="text-brand hover:underline">{company.name}</Link>
                )}
                {doc.recipient_email && <div className="text-muted-foreground">{doc.recipient_email}</div>}
                {doc.recipient_contact_name && <div className="text-muted-foreground">Attn: {doc.recipient_contact_name}</div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Number</span><span className="font-medium">{doc.number}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Issued</span><span>{formatDate(doc.issued_at)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Valid until</span><span>{doc.due_at ? formatDate(doc.due_at) : "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Currency</span><span>{doc.currency}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Created by</span><span>{doc.created_by_name}</span></div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Opportunity</span>
                  {doc.opportunityId ? (
                    <Link to="/opportunities/$id" params={{ id: doc.opportunityId }} className="text-right text-brand hover:underline">{doc.opportunityName ?? "View opportunity"}</Link>
                  ) : (
                    <span className="text-muted-foreground">Not linked</span>
                  )}
                </div>
                {doc.converted_invoice_id && (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Converted to</span>
                    <Link to="/billing/invoices/$id" params={{ id: doc.converted_invoice_id }} className="text-right font-medium text-brand hover:underline">
                      {getDoc(doc.converted_invoice_id)?.number ?? "Invoice"}
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            {doc.notes && (
              <Card>
                <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
                <CardContent className="text-sm text-muted-foreground whitespace-pre-line">{doc.notes}</CardContent>
              </Card>
            )}
          </div>
        </div>
      </PageBody>
    </AppShell>
  );
}
