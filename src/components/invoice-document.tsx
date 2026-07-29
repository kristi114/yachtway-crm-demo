import { formatDate } from "@/lib/format-date";
import { YachtWayLogo } from "@/components/icons/yachtway-logo";
import { docTotal, docSubtotal, paymentMethodLabel, studioPassSavings, type BillingDoc } from "@/lib/billing";
import { formatMoney } from "@/lib/currency";
import { getCompany } from "@/lib/mock-data";
import { isStudioPassActive } from "@/lib/studio-pass";
import { STUDIO_PASS_PRODUCT_ID } from "@/lib/products";

/**
 * Print-ready A4 rendering of an invoice or estimate.
 *
 * Deliberately isolated from the app's glass/dark theming: it uses the fixed
 * `doc-*` tokens so the sheet looks identical on screen, on paper and inside an
 * exported PDF. Wrapped in `.print-sheet` so the print stylesheet can strip
 * shadows/margins and page it cleanly.
 */

const ISSUER = {
  name: "YachtWay",
  legal: "YachtWay LLC",
  lines: ["407 Lincoln Rd PH-NW", "Miami Beach, FL 33139"],
  phone: "(800) 567-9929",
  email: "accounting@YachtWay.com",
  site: "YachtWay.com",
};

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return formatDate(iso);
}

export function InvoiceDocument({ doc }: { doc: BillingDoc }) {
  const total = docTotal(doc);
  const subtotal = docSubtotal(doc);
  const discAmt = subtotal - total;
  const savings = studioPassSavings(doc.line_items);
  const company = getCompany(doc.companyId);
  const isEstimate = doc.kind === "estimate";
  const label = isEstimate ? "Estimate" : "Invoice";
  const paid = doc.status === "paid";
  const passOnDoc = doc.line_items.some((li) => li.productId === STUDIO_PASS_PRODUCT_ID);
  const passHolder = isStudioPassActive(doc.companyId) || passOnDoc;

  return (
    <article className="print-sheet mx-auto w-full max-w-[820px] overflow-hidden rounded-xl border border-doc-line bg-doc text-doc-ink shadow-[0_24px_60px_-30px_rgba(20,16,31,0.45)]">
      {/* Header band */}
      <header className="flex items-start justify-between gap-8 border-b border-doc-line px-10 pb-7 pt-9">
        <div className="space-y-3">
          <YachtWayLogo className="h-7 w-auto text-brand-deep" />
          <div className="text-[11px] leading-[1.6] text-doc-muted">
            <div className="font-semibold text-doc-ink">{ISSUER.legal}</div>
            {ISSUER.lines.map((l) => (
              <div key={l}>{l}</div>
            ))}
            <div>{ISSUER.phone}</div>
            <div>{ISSUER.email}</div>
          </div>
        </div>

        <div className="text-right">
          <div className="font-display text-2xl font-semibold tracking-tight text-doc-accent">
            {label}
          </div>
          <div className="mt-1 text-[13px] font-medium tabular-nums">{doc.number}</div>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-doc-accent-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-doc-accent">
            {paid ? "Paid in full" : doc.status}
          </div>
        </div>
      </header>

      {/* Meta grid */}
      <section className="grid grid-cols-2 gap-8 px-10 py-7 sm:grid-cols-4">
        {[
          { k: "Issued", v: fmtDate(doc.issued_at) },
          {
            k: isEstimate ? "Valid until" : "Due",
            v: !isEstimate && !doc.due_at ? "Due upon receipt" : fmtDate(doc.due_at),
          },
          { k: "Currency", v: doc.currency },
          {
            k: "Amount due",
            v: paid ? formatMoney(0, doc.currency) : formatMoney(total, doc.currency),
          },
        ].map((m) => (
          <div key={m.k}>
            <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-doc-muted">
              {m.k}
            </div>
            <div className="mt-1 text-[13px] font-medium tabular-nums">{m.v}</div>
          </div>
        ))}
      </section>

      {/* Bill to */}
      <section className="grid gap-8 border-y border-doc-line bg-doc-accent-soft/60 px-10 py-6 sm:grid-cols-2">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-doc-muted">
            Billed to
          </div>
          <div className="mt-1.5 text-[14px] font-semibold">{company?.name ?? doc.name}</div>
          {doc.recipient_contact_name && (
            <div className="text-[12px] text-doc-muted">Attn: {doc.recipient_contact_name}</div>
          )}
          {doc.recipient_email && (
            <div className="text-[12px] text-doc-muted">{doc.recipient_email}</div>
          )}
          <div
            className={[
              "mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider",
              passHolder ? "bg-doc-accent-soft text-doc-accent" : "border border-doc-line text-doc-muted",
            ].join(" ")}
          >
            {passHolder
              ? passOnDoc && !isStudioPassActive(doc.companyId)
                ? "Studio Pass added — member rates"
                : "Studio Pass member — member rates"
              : "Not a Studio Pass member — list rates"}
          </div>
        </div>
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-doc-muted">
            Reference
          </div>
          <div className="mt-1.5 text-[12px] leading-[1.7] text-doc-muted">
            <div>
              <span className="text-doc-ink">{doc.name}</span>
            </div>
            {doc.opportunityName && <div>Opportunity: {doc.opportunityName}</div>}
            <div>Account manager: {doc.created_by_name}</div>
          </div>
        </div>
      </section>

      {/* Line items */}
      <section className="px-10 pt-7">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-doc-ink/15 text-left text-[9px] uppercase tracking-[0.12em] text-doc-muted">
              <th className="pb-2 font-semibold">Description</th>
              <th className="pb-2 text-right font-semibold">Length</th>
              <th className="pb-2 text-right font-semibold">Price per Ft</th>
              <th className="pb-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.line_items.map((li) => (
              <tr key={li.id} className="border-b border-doc-line align-top">
                <td className="py-3 pr-4">
                  {li.description}
                  {(li.vessel_name || li.options_summary) && (
                    <div className="text-[10.5px] text-doc-muted">
                      {[li.vessel_name, li.options_summary].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </td>
                <td className="py-3 text-right tabular-nums">
                  {li.quantity}
                  {li.unit_label ? ` ${li.unit_label}` : ""}
                </td>
                <td className="py-3 text-right tabular-nums">
                  {formatMoney(li.unit_price, doc.currency)}
                </td>
                <td className="py-3 text-right font-medium tabular-nums">
                  {formatMoney(li.quantity * li.unit_price, doc.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {savings && (
          <div className="avoid-break mt-5 rounded-xl border border-doc-line bg-doc-ink/[0.03] p-4 text-[11.5px] leading-[1.7] text-doc-muted">
            <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-doc-muted">
              YachtWay Studio Pass
            </div>
            <div className="mt-1 text-[12.5px] font-semibold text-doc-ink">
              {savings.passOnDoc ? "Studio Pass saves" : "Save"}{" "}
              {formatMoney(savings.savings, doc.currency)} on this {isEstimate ? "estimate" : "invoice"}
            </div>
            <div>
              You could save {formatMoney(savings.savings, doc.currency)} on this {isEstimate ? "estimate" : "invoice"} with a YachtWay Studio Pass — that's an average of{" "}
              {savings.nonMemberTotal > 0
                ? Math.round((savings.savings / savings.nonMemberTotal) * 100)
                : 0}
              % off every shoot. The pass is {formatMoney(savings.passPrice, doc.currency)} per month on an annual commitment, billed monthly.
            </div>

          </div>
        )}

        <div className="mt-5 flex justify-end">
          <div className="w-full max-w-[280px] space-y-2 text-[12.5px]">
            <div className="flex justify-between text-doc-muted">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatMoney(subtotal, doc.currency)}</span>
            </div>
            {discAmt > 0 && (
              <div className="flex justify-between text-doc-muted">
                <span>
                  Discount{doc.discount?.type === "percent" ? ` (${doc.discount.value}%)` : ""}
                </span>
                <span className="tabular-nums">-{formatMoney(discAmt, doc.currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-doc-muted">
              <span>Tax</span>
              <span className="tabular-nums">{formatMoney(0, doc.currency)}</span>
            </div>
            <div className="flex items-baseline justify-between border-t border-doc-ink/15 pt-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-doc-muted">
                Total {doc.currency}
              </span>
              <span className="font-display text-xl font-semibold tabular-nums text-doc-accent">
                {formatMoney(total, doc.currency)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Payment + notes */}
      <section className="avoid-break grid gap-6 px-10 py-8 sm:grid-cols-2">
        <div className="rounded-xl border border-doc-line p-4">
          <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-doc-muted">
            Payment
          </div>
          <div className="mt-2 space-y-1 text-[12px] leading-[1.7] text-doc-muted">
            {doc.payment_method ? (
              <div>
                Method on file:{" "}
                <span className="font-medium text-doc-ink">
                  {paymentMethodLabel(doc.payment_method)}
                </span>
              </div>
            ) : (
              <div>Card, ACH, SEPA or wire transfer accepted.</div>
            )}
            {!isEstimate && !paid && (
              <div>
                {doc.due_at ? `Payable by ${fmtDate(doc.due_at)}.` : "Payable upon receipt."}
              </div>
            )}
            {isEstimate && <div>Approve this estimate to convert it into an invoice.</div>}
            <div>
              Questions? <span className="text-doc-ink">{ISSUER.email}</span>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-doc-line p-4">
          <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-doc-muted">
            Notes
          </div>
          <div className="mt-2 whitespace-pre-wrap text-[12px] leading-[1.7] text-doc-muted">
            {doc.notes?.trim() || "Thank you for using YachtWay for your service needs."}
          </div>
        </div>
      </section>

      <footer className="flex items-center justify-between gap-4 border-t border-doc-line px-10 py-5 text-[10px] text-doc-muted">
        <span>
          {ISSUER.legal} · {ISSUER.site}
        </span>
        <span className="tabular-nums">
          {label} {doc.number} · {fmtDate(doc.issued_at)}
        </span>
      </footer>
    </article>
  );
}
