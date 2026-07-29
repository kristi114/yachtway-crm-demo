import { guarded } from "@/components/require-access";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileCheck2, FileText, GitMerge, MoreHorizontal, Pencil } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { ActivityPanel } from "@/components/activity-panel";
import { OpportunityBillingPanel } from "@/components/opportunity-billing-panel";
import { PageHeader, PageBody } from "@/components/page-header";
import {
  OPPORTUNITIES,
  getCompany,
  getContact,
  getListing,
  getOpportunity,
  subscribeMockData,
  updateOpportunity,

} from "@/lib/mock-data";
import { useAuth, useMoney, canSeeFinTech } from "@/lib/auth";
import { LockedRecord } from "@/components/locked-record";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StudioToursPanel } from "@/components/studio-tours-panel";
import { getStudioTour } from "@/lib/studio-tours";
// Single source of truth for pipeline stages (mirrors the Field Catalog picklist).
import { PIPELINE_STAGES } from "@/components/create-opportunity-dialog";
import { DetailSections } from "@/components/field-renderer";
import { OPPORTUNITY_SECTIONS } from "@/lib/field-schema";
import { EditOpportunityDialog } from "@/components/edit-opportunity-dialog";
import { MergeRecordDialog } from "@/components/merge-record-dialog";

export const Route = createFileRoute("/opportunities/$id")({
  loader: ({ params }) => {
    const opp = getOpportunity(params.id);
    if (!opp) throw notFound();
    return { opp };
  },
  component: guarded("opportunity.general", "Opportunities", OpportunityDetail),
  notFoundComponent: () => (
    <AppShell>
      <PageHeader eyebrow="Opportunity" title="Not found" />
      <PageBody>
        <p className="text-sm text-muted-foreground">
          That opportunity no longer exists.{" "}
          <Link to="/opportunities" className="text-brand hover:underline">
            Back to pipelines
          </Link>
        </p>
      </PageBody>
    </AppShell>
  ),
});

function daysSince(iso: string) {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function OpportunityDetail() {
  const { opp: initialOpp } = Route.useLoaderData();
  const [, setTick] = useState(0);
  useEffect(() => subscribeMockData(() => setTick((n) => n + 1)), []);
  const opp = getOpportunity(initialOpp.id) ?? initialOpp;
  const { user } = useAuth();
  const { format: fmtMoney } = useMoney();
  const [editOpen, setEditOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const navigate = useNavigate({ from: "/opportunities/$id" });
  const company = opp.companyId ? getCompany(opp.companyId) : null;
  const contact = opp.contactId ? getContact(opp.contactId) : null;
  const listing = opp.listingId ? getListing(opp.listingId) : null;
  const currency = company?.currency;
  const stages = PIPELINE_STAGES[opp.pipeline] ?? [];
  const stageIdx = stages.indexOf(opp.stage);

  const isFinTech =
    company?.vertical === "FinTech" ||
    contact?.vertical === "FinTech" ||
    opp.pipeline === "EasyFund" ||
    opp.pipeline === "MasterCover";
  if (isFinTech && !canSeeFinTech(user.role)) {
    return <LockedRecord kind="opportunity" backTo="/opportunities" backLabel="Back to pipelines" />;
  }

  const related = OPPORTUNITIES.filter(
    (o) => o.companyId === opp.companyId && o.id !== opp.id,
  );
  const studioTour = getStudioTour(opp.id);

  return (
    <AppShell>
      <PageHeader
        eyebrow={
          <>
            <Link to="/opportunities" className="text-brand hover:underline">
              Opportunities
            </Link>{" "}
            · {opp.pipeline}
          </>
        }
        title={opp.name}
        subtitle={`${fmtMoney(opp.amountUsd, currency)} · ${opp.probability}% · Close ${opp.closeDate} · Owner ${opp.owner}`}
        actions={
          <>
            <Button size="sm" variant="outline" asChild>
              <Link
                to="/billing/estimates/new"
                search={{ companyId: opp.companyId ?? undefined, opportunityId: opp.id }}
              >
                <FileCheck2 className="mr-1.5 h-3.5 w-3.5" />
                Generate estimate
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link
                to="/billing/invoices/new"
                search={{ companyId: opp.companyId ?? undefined, opportunityId: opp.id }}
              >
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                New invoice
              </Link>
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setMergeOpen(true)}>
                  <GitMerge className="mr-2 h-4 w-4" />
                  Merge
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      <MergeRecordDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        kind="opportunity"
        currentId={opp.id}
        onMerged={(survivorId) => {
          if (survivorId !== opp.id) navigate({ to: "/opportunities/$id", params: { id: survivorId } });
        }}
      />
      <PageBody>
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="lg:col-span-2 space-y-4">
            {/* Stage progress */}
            <div className="rounded-sm border border-border bg-surface p-4 shadow-sm">
              <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
                Stage
              </h3>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {stages.map((s, i) => {
                  const active = i === stageIdx;
                  const done = stageIdx >= 0 && i < stageIdx;
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={active}
                      title={active ? `Current stage: ${s}` : `Move to ${s}`}
                      onClick={() => {
                        if (active) return;
                        updateOpportunity(opp.id, {
                          stage: s,
                          stageEnteredAt: new Date().toISOString().slice(0, 10),
                        });
                      }}
                      className={`rounded-lg px-2 py-1 text-[12px] font-medium transition ${
                        active
                          ? "bg-brand text-brand-foreground"
                          : done
                          ? "bg-brand/15 text-brand-deep hover:bg-brand/25"
                          : "bg-muted text-muted-foreground hover:bg-brand/10 hover:text-brand-deep"
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
                {stageIdx === -1 && (
                  <span className="rounded-sm bg-muted px-2 py-1 text-[12px] font-medium text-foreground">
                    {opp.stage}
                  </span>
                )}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Click a stage to move this opportunity.
              </p>
            </div>


            {studioTour && (
              <StudioToursPanel tours={[studioTour]} hideCompany />
            )}

            {/* Details */}
            <div className="rounded-sm border border-border bg-surface p-4 shadow-sm">
              <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
                Details
              </h3>
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
                <div>
                  <dt className="text-muted-foreground">Pipeline</dt>
                  <dd className="font-medium text-foreground">{opp.pipeline}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Stage</dt>
                  <dd className="font-medium text-foreground">
                    {opp.stage}
                    <span className="ml-1 text-xs text-muted-foreground">
                      · {daysSince(opp.stageEnteredAt)}d in stage
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Amount</dt>
                  <dd className="font-medium tabular-nums text-foreground">{fmtMoney(opp.amountUsd, currency)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Weighted (probability × amount)</dt>
                  <dd className="font-medium tabular-nums text-foreground">
                    {fmtMoney(Math.round(opp.amountUsd * (opp.probability / 100)), currency)}
                    <span className="ml-1 text-xs text-muted-foreground">· {opp.probability}%</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Close date</dt>
                  <dd className="font-medium text-foreground">{opp.closeDate}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Owner</dt>
                  <dd className="font-medium text-foreground">{opp.owner}</dd>
                </div>
                {opp.lostReason && (
                  <div className="col-span-2">
                    <dt className="text-muted-foreground">Lost reason</dt>
                    <dd className="font-medium text-destructive">{opp.lostReason}</dd>
                  </div>
                )}
                {opp.closeReason && (
                  <div className="col-span-2">
                    <dt className="text-muted-foreground">Close notes</dt>
                    <dd className="text-foreground">{opp.closeReason}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-muted-foreground">ID</dt>
                  <dd className="font-mono text-[12px] text-muted-foreground">{opp.id}</dd>
                </div>
              </dl>
            </div>

            {related.length > 0 && (
              <div className="rounded-sm border border-border bg-surface p-4 shadow-sm">
                <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
                  Other deals at this company
                </h3>
                <ul className="mt-3 divide-y divide-border">
                  {related.map((r) => (
                    <li key={r.id} className="flex items-center justify-between py-2 text-[13px]">
                      <Link
                        to="/opportunities/$id"
                        params={{ id: r.id }}
                        className="text-brand hover:underline"
                      >
                        {r.name}
                      </Link>
                      <span className="text-muted-foreground">
                        {r.pipeline} · {r.stage} ·{" "}
                        <span className="font-semibold tabular-nums text-foreground">
                          {fmtMoney(r.amountUsd, currency)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <div className="rounded-sm border border-border bg-surface p-4 shadow-sm">
              <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
                Company
              </h3>
              {company ? (
                <div className="mt-2 text-[13px]">
                  <Link
                    to="/companies/$id"
                    params={{ id: company.id }}
                    className="font-medium text-brand hover:underline"
                  >
                    {company.name}
                  </Link>
                  <div className="text-muted-foreground">{company.vertical}</div>
                </div>
              ) : (
                <p className="mt-2 text-[13px] text-muted-foreground">No company linked</p>
              )}
            </div>

            <div className="rounded-sm border border-border bg-surface p-4 shadow-sm">
              <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
                Primary contact
              </h3>
              {contact ? (
                <div className="mt-2 text-[13px]">
                  <Link
                    to="/contacts/$id"
                    params={{ id: contact.id }}
                    className="font-medium text-brand hover:underline"
                  >
                    {contact.firstName} {contact.lastName}
                  </Link>
                  <div className="text-muted-foreground">{contact.roleAtDealership}</div>
                </div>
              ) : (
                <p className="mt-2 text-[13px] text-muted-foreground">No contact linked</p>
              )}
            </div>

            {listing && (
              <div className="rounded-sm border border-border bg-surface p-4 shadow-sm">
                <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
                  Listing
                </h3>
                <div className="mt-2 text-[13px]">
                  <div className="font-medium text-foreground">{listing.model}</div>
                  <div className="text-muted-foreground">
                    {listing.year} · {listing.lengthFt}ft · {fmtMoney(listing.priceUsd, currency)}
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
        <div className="mt-6 space-y-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">All fields</h2>
          <DetailSections
            sections={OPPORTUNITY_SECTIONS}
            record={opp as unknown as Record<string, unknown>}
            reorderable
            layoutKey="opportunity"
            onEditField={(key, value) => updateOpportunity(opp.id, { [key]: value })}
          />
        </div>
        <div className="mt-6">
          <OpportunityBillingPanel opportunityId={opp.id} />
        </div>
        <div className="mt-6">
          <ActivityPanel type="opportunity" id={opp.id} />
        </div>
      </PageBody>
      <EditOpportunityDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        opportunity={opp}
      />
    </AppShell>
  );
}
