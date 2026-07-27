import { Link } from "@tanstack/react-router";
import { Receipt } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  docTotal,
  listDocsForOpportunity,
  paymentMethodLabel,
  STATUS_STYLES,
  useBillingStore,
} from "@/lib/billing";
import { formatMoney } from "@/lib/currency";

/** Estimates & invoices linked to an opportunity. */
export function OpportunityBillingPanel({ opportunityId }: { opportunityId: string }) {
  useBillingStore();
  const docs = listDocsForOpportunity(opportunityId);

  return (
    <div className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Receipt className="h-4 w-4 text-brand" />
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
          Estimates &amp; invoices
        </h3>
        <span className="text-[11px] text-muted-foreground">{docs.length} linked</span>
      </div>

      {docs.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
          Nothing linked yet. Use “Generate estimate” above to send one to the dealer — once they
          accept it and pick a payment method it becomes an invoice automatically.
        </p>
      ) : (
        <table className="w-full text-[13px]">
          <thead className="bg-secondary/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Document</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Issued</th>
              <th className="px-3 py-2">Payment method</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id} className="border-t border-border hover:bg-secondary/30">
                <td className="px-3 py-2 font-semibold">
                  {d.kind === "invoice" ? (
                    <Link
                      to="/billing/invoices/$id"
                      params={{ id: d.id }}
                      className="text-brand hover:underline"
                    >
                      {d.number}
                    </Link>
                  ) : d.share_token ? (
                    <Link
                      to="/billing/share/$token"
                      params={{ token: d.share_token }}
                      className="text-brand hover:underline"
                    >
                      {d.number}
                    </Link>
                  ) : (
                    <span className="text-brand-deep">{d.number}</span>
                  )}
                </td>
                <td className="px-3 py-2 capitalize text-muted-foreground">{d.kind}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {new Date(d.issued_at).toLocaleDateString()}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {d.payment_method ? paymentMethodLabel(d.payment_method) : "—"}
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
  );
}
