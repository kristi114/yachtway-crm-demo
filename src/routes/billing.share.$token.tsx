import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, XCircle, Anchor, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  docTotal,
  getDocByToken,
  respondToDoc,
  paymentMethodLabel,
  PAYMENT_METHODS,
  STATUS_STYLES,
  useBillingStore,
  getDoc,
  type BillingDoc,
  type PaymentMethodKind,
} from "@/lib/billing";
import { StudioPassSavingsNote } from "@/components/studio-pass-savings-note";
import { formatMoney } from "@/lib/currency";

export const Route = createFileRoute("/billing/share/$token")({
  component: SharedDocPage,
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center bg-secondary/30 p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold text-brand-deep">Document not found</h1>
        <p className="text-sm text-muted-foreground mt-2">
          This link may have expired or been revoked.
        </p>
      </div>
    </div>
  ),
});

function SharedDocPage() {
  useBillingStore();
  const { token } = Route.useParams();
  const doc = getDocByToken(token);
  if (!doc) throw notFound();
  return <SharedDoc doc={doc} token={token} />;
}

function SharedDoc({ doc, token }: { doc: BillingDoc; token: string }) {
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<PaymentMethodKind | "">("");
  const isEstimate = doc.kind === "estimate";
  const isFinal = doc.status === "accepted" || doc.status === "declined" || doc.status === "paid";
  const total = docTotal(doc);

  const respond = (kind: "accepted" | "declined") => {
    if (kind === "accepted" && !method) {
      toast.error("Choose a payment method to accept");
      return;
    }
    respondToDoc(token, kind, note, kind === "accepted" ? (method as PaymentMethodKind) : undefined);
    toast.success(
      kind === "accepted" ? "Estimate accepted - an invoice has been issued" : "Estimate declined",
    );
  };

  return (
    <div className="min-h-screen bg-secondary/30 py-10">
      <div className="mx-auto max-w-2xl px-4">
        <div className="mb-6 flex items-center gap-2 text-brand-deep">
          <Anchor className="h-5 w-5" />
          <span className="text-sm font-semibold tracking-wide">YachtWay</span>
        </div>

        <div className="overflow-hidden rounded-md border border-border bg-surface shadow-sm">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-secondary/40 px-6 py-5">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {isEstimate ? "Estimate" : "Invoice"}
              </div>
              <div className="text-lg font-semibold text-brand-deep">{doc.number}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                For {doc.name}
              </div>
            </div>
            <Badge className={STATUS_STYLES[doc.status]}>{doc.status}</Badge>
          </header>

          <div className="grid grid-cols-2 gap-4 px-6 py-4 text-sm">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Issued</div>
              <div>{new Date(doc.issued_at).toLocaleDateString()}</div>
            </div>
            {doc.due_at ? (
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Due</div>
                <div>{new Date(doc.due_at).toLocaleDateString()}</div>
              </div>
            ) : doc.kind === "invoice" ? (
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Due</div>
                <div>Due upon receipt</div>
              </div>
            ) : null}
          </div>

          <table className="w-full text-sm">
            <thead className="bg-secondary/30 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-6 py-2">Description</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Unit</th>
                <th className="px-6 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {doc.line_items.map((li) => (
                <tr key={li.id} className="border-t border-border">
                  <td className="px-6 py-2">
                    {li.description}
                    {(li.vessel_name || li.options_summary) && (
                      <div className="text-[11px] text-muted-foreground">
                        {[li.vessel_name, li.options_summary].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {li.quantity}
                    {li.unit_label ? ` ${li.unit_label}` : ""}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(li.unit_price, doc.currency)}</td>
                  <td className="px-6 py-2 text-right tabular-nums">
                    {formatMoney(li.quantity * li.unit_price, doc.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-secondary/20">
                <td className="px-6 py-3 text-right text-xs uppercase tracking-wider text-muted-foreground" colSpan={3}>
                  Total
                </td>
                <td className="px-6 py-3 text-right text-lg font-semibold tabular-nums text-brand-deep">
                  {formatMoney(total, doc.currency)}
                </td>
              </tr>
            </tfoot>
          </table>

          <div className="px-6 pt-4">
            <StudioPassSavingsNote doc={doc} />
          </div>

          {doc.notes && (
            <div className="border-t border-border bg-secondary/10 px-6 py-4 text-sm">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                Notes
              </div>
              <p className="whitespace-pre-line">{doc.notes}</p>
            </div>
          )}

          {isEstimate && (
            <div className="border-t border-border px-6 py-5">
              {isFinal ? (
                <div className="space-y-3 rounded-sm bg-secondary/40 p-4 text-sm">
                  <div className="font-semibold text-brand-deep">
                    You {doc.status} this estimate
                    {doc.client_response_at &&
                      ` on ${new Date(doc.client_response_at).toLocaleDateString()}`}
                    .
                  </div>
                  {doc.client_response_note && (
                    <p className="text-muted-foreground">"{doc.client_response_note}"</p>
                  )}
                  {doc.status === "accepted" && (
                    <>
                      <div className="text-muted-foreground">
                        Payment method:{" "}
                        <span className="font-medium text-foreground">
                          {paymentMethodLabel(doc.payment_method)}
                        </span>
                        {doc.payment_method !== "wire" &&
                          " - you'll be charged automatically once the work is ready."}
                      </div>
                      {doc.converted_invoice_id && (
                        <div className="text-muted-foreground">
                          Invoice{" "}
                          <span className="font-medium text-foreground">
                            {getDoc(doc.converted_invoice_id)?.number}
                          </span>{" "}
                          has been issued for this estimate.
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <div className="text-sm font-semibold text-brand-deep">Payment method</div>
                    <p className="text-xs text-muted-foreground">
                      Pick how you'd like to pay. Accepting turns this estimate into an invoice and
                      your method on file is charged automatically once the content is ready.
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {PAYMENT_METHODS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setMethod(p.value)}
                        aria-pressed={method === p.value}
                        className={`rounded-lg border p-3 text-left text-sm transition ${
                          method === p.value
                            ? "border-brand bg-brand/10 text-brand-deep"
                            : "border-border bg-surface hover:bg-secondary/40"
                        }`}
                      >
                        <div className="flex items-center gap-2 font-medium">
                          <CreditCard className="h-4 w-4" />
                          {p.label}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{p.hint}</div>
                      </button>
                    ))}
                  </div>

                  <div className="text-sm font-semibold text-brand-deep">Your response</div>
                  <Textarea
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Optional message to YachtWay"
                  />
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="outline" onClick={() => respond("declined")}>
                      <XCircle className="mr-1.5 h-4 w-4" />
                      Decline
                    </Button>
                    <Button onClick={() => respond("accepted")} disabled={!method}>
                      <CheckCircle2 className="mr-1.5 h-4 w-4" />
                      Accept &amp; authorize payment
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Sent by {doc.created_by_name} · YachtWay
        </p>
      </div>
    </div>
  );
}
