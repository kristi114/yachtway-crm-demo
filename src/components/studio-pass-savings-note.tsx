import { Sparkles } from "lucide-react";

import { studioPassSavings, type BillingDoc } from "@/lib/billing";
import { formatMoney } from "@/lib/currency";

/**
 * "You could save X with a Studio Pass" callout.
 *
 * Studio rates are quoted for Studio Pass members; anything billed at the
 * non-member rate carries a premium, so we surface the delta on every
 * invoice / estimate view to make the membership pitch obvious.
 */
export function StudioPassSavingsNote({
  doc,
  className,
}: {
  doc: Pick<BillingDoc, "line_items" | "currency">;
  className?: string;
}) {
  const s = studioPassSavings(doc.line_items);
  if (!s) return null;

  return (
    <div
      className={`rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs ${className ?? ""}`}
    >
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-amber-500" />
        <div className="space-y-1">
          <div className="font-medium text-foreground">
            {s.passOnDoc ? "Studio Pass saves" : "Save"} {formatMoney(s.savings, doc.currency)} with
            a YachtWay Studio Pass
          </div>
          <p className="text-muted-foreground">
            {s.lineCount} Studio {s.lineCount === 1 ? "line is" : "lines are"} billed at non-member
            rates ({formatMoney(s.nonMemberTotal, doc.currency)}). At member rates the same work is{" "}
            {formatMoney(s.memberTotal, doc.currency)}. The pass is{" "}
            {formatMoney(s.passPrice, doc.currency)}/month
            {s.netFirstMonth > 0
              ? ` — a net ${formatMoney(s.netFirstMonth, doc.currency)} saved on this document alone.`
              : "."}
          </p>
        </div>
      </div>
    </div>
  );
}
