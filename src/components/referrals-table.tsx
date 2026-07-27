import { Link } from "@tanstack/react-router";
import { HandCoins, Plus, Pencil, Receipt, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  listReferralsForOpportunity,
  useReferralsStore,
  REFERRAL_STATUS_STYLES,
  REFERRAL_STATUS_LABEL,
  REFERRAL_TYPE_LABEL,
  formatReferralAmount,
} from "@/lib/referrals";
import { OPPORTUNITIES, getCompany, getContact } from "@/lib/mock-data";

interface ReferralsTableProps {
  /** When set, only EasyFund opportunities for this company are shown. */
  companyId?: string;
  /** Hide the dealer column (redundant on a company profile). */
  hideDealerColumn?: boolean;
}

export function useEasyFundOpportunities(companyId?: string) {
  return OPPORTUNITIES.filter(
    (o) => o.pipeline === "EasyFund" && (!companyId || o.companyId === companyId),
  );
}

export function ReferralsTable({ companyId, hideDealerColumn }: ReferralsTableProps) {
  useReferralsStore();
  const easyFundOpps = useEasyFundOpportunities(companyId);
  const showDealer = !hideDealerColumn;

  return (
    <>
      <div className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
        <table className="w-full text-[13px]">
          <thead className="bg-secondary/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Opportunity</th>
              {showDealer && <th className="px-3 py-2">Dealer</th>}
              <th className="px-3 py-2">Applicant</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Referral records</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {easyFundOpps.map((opp) => {
              const dealer = opp.companyId ? getCompany(opp.companyId) : undefined;
              const applicant = opp.contactId ? getContact(opp.contactId) : undefined;
              const records = listReferralsForOpportunity(opp.id);
              return (
                <tr
                  key={opp.id}
                  className="border-t border-border align-top hover:bg-secondary/30"
                >
                  <td className="px-3 py-3">
                    <Link
                      to="/opportunities/$id"
                      params={{ id: opp.id }}
                      className="font-semibold text-brand hover:underline"
                    >
                      {opp.name}
                    </Link>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {opp.stage}
                    </div>
                  </td>
                  {showDealer && (
                    <td className="px-3 py-3">
                      {dealer ? (
                        <Link
                          to="/companies/$id"
                          params={{ id: dealer.id }}
                          className="text-foreground hover:underline"
                        >
                          {dealer.name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-3">
                    {applicant ? (
                      <Link
                        to="/contacts/$id"
                        params={{ id: applicant.id }}
                        className="text-foreground hover:underline"
                      >
                        {applicant.firstName} {applicant.lastName}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-3 py-3 font-semibold tabular-nums">
                    ${opp.amountUsd.toLocaleString()}
                  </td>
                  <td className="px-3 py-3">
                    {records.length === 0 ? (
                      <span className="text-muted-foreground">No records yet</span>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {records.map((r) => (
                          <div key={r.id} className="flex items-center gap-2">
                            <Badge className={REFERRAL_STATUS_STYLES[r.status]}>
                              {REFERRAL_STATUS_LABEL[r.status]}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground">
                              {REFERRAL_TYPE_LABEL[r.type]} ·{" "}
                              {r.counterparty_name} ·{" "}
                              <span className="font-medium text-foreground">
                                {formatReferralAmount(r)}
                              </span>
                            </span>
                            {r.billing_doc_id && (
                              <Link
                                to="/billing/invoices/$id"
                                params={{ id: r.billing_doc_id }}
                                className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline"
                                title="Open mirrored invoice"
                              >
                                <FileText className="h-3 w-3" /> Invoice
                              </Link>
                            )}
                            <Link
                              to="/referrals/$id/edit"
                              params={{ id: r.id }}
                              className="ml-auto inline-flex items-center gap-1 text-[11px] text-brand hover:underline"
                            >
                              <Pencil className="h-3 w-3" /> Edit
                            </Link>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Button size="sm" variant="secondary" asChild>
                      <Link to="/referrals/new/$oppId" params={{ oppId: opp.id }}>
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        Create invoices
                      </Link>
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {easyFundOpps.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
            <HandCoins className="h-8 w-8 text-muted-foreground/60" />
            No EasyFund opportunities yet.
          </div>
        )}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Receipt className="h-3 w-3" />
        Referral invoices created here are automatically mirrored to Accounting
        under All invoices.
      </p>
    </>
  );
}

/** Referral dashboard scoped to one company - used on the company EasyFund tab. */
export function CompanyReferralsSection({ companyId }: { companyId: string }) {
  const easyFundOpps = useEasyFundOpportunities(companyId);
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
          Referrals
        </h3>
        <span className="text-[11px] text-muted-foreground">
          {easyFundOpps.length} EasyFund {easyFundOpps.length === 1 ? "opportunity" : "opportunities"}
        </span>
      </div>
      <ReferralsTable companyId={companyId} hideDealerColumn />
    </section>
  );
}
