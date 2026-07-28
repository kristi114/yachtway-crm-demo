import { formatDate } from "@/lib/format-date";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Video, VideoOff, ExternalLink, Anchor, Camera, EyeOff, FileText, ListChecks } from "lucide-react";
import { BoatIcon } from "@/components/icons/boat-icon";

import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { useMoney } from "@/lib/auth";
import {
  getListing, getBrand, getCompany, getContact,
} from "@/lib/mock-data";
import { computeListingHeat, HEAT_STYLES } from "@/components/dealer-health-panel";
import { DetailSections } from "@/components/field-renderer";
import { LISTING_SECTIONS } from "@/lib/field-schema";

export const Route = createFileRoute("/listings/$id")({
  loader: ({ params }) => {
    const listing = getListing(params.id);
    if (!listing) throw notFound();
    return { listing };
  },
  component: ListingDetail,
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Listing not found" }, { name: "robots", content: "noindex" }] };
    const brand = getBrand(loaderData.listing.brandId);
    const t = `${brand?.name ?? ""} ${loaderData.listing.model} · YachtWay`.trim();
    return { meta: [{ title: t }] };
  },
  notFoundComponent: () => (
    <AppShell>
      <PageBody>
        <div className="rounded-sm border border-border bg-surface p-8 text-center">
          <h2 className="text-lg font-semibold">Listing not found</h2>
          <Link to="/listings" className="mt-2 inline-block text-sm text-brand hover:underline">Back to listings</Link>
        </div>
      </PageBody>
    </AppShell>
  ),
});

function ListingDetail() {
  const { listing: l } = Route.useLoaderData();
  const { format: fmtMoney } = useMoney();
  const brand = getBrand(l.brandId);
  const company = getCompany(l.companyId);
  const broker = l.brokerContactId ? getContact(l.brokerContactId) : null;
  const heat = computeListingHeat(l);
  const hs = HEAT_STYLES[heat.tone];
  const HeatIcon = hs.icon;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Listing"
        title={`${brand?.name ?? ""} ${l.model}`}
        subtitle={`${l.year} · ${l.lengthFt}ft · Hull ${l.hullId}`}
        actions={
          <Link to="/listings" className="text-[13px] text-brand hover:underline">
            All listings
          </Link>
        }
      />
      <PageBody>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Identity card */}
          <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm lg:col-span-2">
            <header className="flex items-center justify-between border-b border-border bg-secondary/60 px-4 py-2.5">
              <h3 className="flex items-center gap-2 text-[15px] font-semibold uppercase tracking-wide text-brand-deep">
                <BoatIcon className="h-4 w-4 text-brand" /> Vessel
              </h3>
              <div className="flex items-center gap-3">
                {l.listingUrl && (
                  <a
                    href={l.listingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline"
                  >
                    View listing <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                <Badge variant="outline" className="text-[13px]">{l.status}</Badge>
              </div>
            </header>
            <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
              <Field label="Brand" value={brand?.name ?? "-"} />
              <Field label="Model" value={l.model} />
              <Field label="Year" value={String(l.year)} />
              <Field label="Length" value={`${l.lengthFt} ft`} />
              <Field label="Price" value={l.priceHidden ? "Hidden" : fmtMoney(l.priceUsd, company?.currency)} />
              <Field label="Hull ID" value={l.hullId} mono />
              <Field label="Listed" value={formatDate(l.listedAt)} />
              <Field label="Photos" value={`${l.photoCount}`} />
              <Field label="Photo setting" value={l.photoSetting.replace("_", " ")} />
              <Field label="Media quality" value={l.mediaQuality} />
              <Field
                label="3D tour"
                value={l.has_3d_tour ? "Yes" : "No"}
                tone={l.has_3d_tour ? "good" : "bad"}
              />
              <Field
                label="Walkthrough video"
                value={l.hasVideo ? "Yes" : "No"}
                tone={l.hasVideo ? "good" : "bad"}
              />
              <Field label="Description" value={l.descriptionLength > 0 ? `${l.descriptionLength} chars` : "Missing"} tone={l.descriptionLength === 0 ? "bad" : undefined} />
              <Field label="Features filled" value={`${l.featuresFilled} / ${l.featuresTotal}`} />
            </div>

            {/* Ownership row */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border bg-secondary/30 px-4 py-3 text-[15px]">
              {company && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-muted-foreground">Dealer:</span>
                  <Link to="/companies/$id" params={{ id: company.id }} className="font-semibold text-brand hover:underline">
                    {company.name}
                  </Link>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
              )}
              {broker && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-muted-foreground">Broker:</span>
                  <Link to="/contacts/$id" params={{ id: broker.id }} className="font-semibold text-brand hover:underline">
                    {broker.firstName} {broker.lastName}
                  </Link>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
              )}
            </div>
          </section>

          {/* Heat card */}
          <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
            <header className="border-b border-border bg-secondary/60 px-4 py-2.5">
              <h3 className="text-[15px] font-semibold uppercase tracking-wide text-brand-deep">
                Listing heat
              </h3>
            </header>
            <div className="flex items-center gap-4 px-4 py-4">
              <div className="relative grid h-20 w-20 shrink-0 place-items-center">
                <svg viewBox="0 0 60 60" className="h-20 w-20 -rotate-90">
                  <circle cx="30" cy="30" r="24" fill="none" stroke="oklch(0.93 0.01 300)" strokeWidth="6" />
                  <circle
                    cx="30" cy="30" r="24" fill="none" strokeWidth="6"
                    className={hs.text}
                    stroke="currentColor"
                    strokeDasharray={`${(2 * Math.PI * 24) * (heat.score / 100)} ${2 * Math.PI * 24}`}
                  />
                </svg>
                <div className="absolute text-center">
                  <div className="text-lg font-semibold tabular-nums text-brand-deep">{heat.score}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">/ 100</div>
                </div>
              </div>
              <div className="flex-1 text-[15px]">
                <div className={`inline-flex items-center gap-1 font-semibold ${hs.text}`}>
                  <HeatIcon className="h-4 w-4" /> {hs.label}
                </div>
                <div className="mt-1 text-muted-foreground tabular-nums">
                  {heat.views_30d.toLocaleString()} views · {heat.inquiries_30d} inquiries
                </div>
                <div className="text-muted-foreground tabular-nums">{heat.days_on_market}d on market</div>
              </div>
            </div>

            {/* Issues */}
            {heat.reasons.length > 0 && (
              <div className="border-t border-border px-4 py-3">
                <div className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Top issues
                </div>
                <ul className="space-y-1.5">
                  {heat.reasons.map((r) => {
                    const Icon = r.icon;
                    return (
                      <li key={r.label} className="flex items-start gap-2 rounded-sm bg-destructive/5 px-2.5 py-2 text-[15px]">
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-foreground">{r.label}</span>
                            <span className="shrink-0 tabular-nums font-semibold text-destructive">{r.weight}</span>
                          </div>
                          {r.action && <div className="mt-0.5 text-muted-foreground">{r.action}</div>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        </div>

        {/* Quick action hints */}
        <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Hint icon={Camera} label="Photos" ok={l.photoCount >= 20} okText={`${l.photoCount} photos on file`} badText={`Only ${l.photoCount} photos - request more`} />
          <Hint icon={l.hasVideo ? Video : VideoOff} label="Video" ok={l.hasVideo} okText="Walkthrough video attached" badText="Add a walkthrough video" />
          <Hint icon={FileText} label="Description" ok={l.descriptionLength >= 1000} okText="Rich description on file" badText="Description needs expanding" />
          <Hint
            icon={l.priceHidden ? EyeOff : ListChecks}
            label={l.priceHidden ? "Price" : "Features"}
            ok={l.priceHidden ? false : l.featuresFilled / Math.max(1, l.featuresTotal) >= 0.9}
            okText={l.priceHidden ? "Publish the price" : "Features complete"}
            badText={l.priceHidden ? "Price is hidden - buyers bounce" : `${l.featuresTotal - l.featuresFilled} feature fields empty`}
          />
        </section>

        {/* Full catalog fields (auto-grouped, empties hidden) */}
        <div className="mt-6">
          <DetailSections
            sections={LISTING_SECTIONS}
            record={{
              ...(l as unknown as Record<string, unknown>),
              make: brand?.name ?? "",
              company: company?.name ?? "",
              currency: company?.currency ?? "USD",
              vesselPrice: l.priceUsd,
              lengthFt: l.lengthFt,
              hullNumber: l.hullId,
            }}
          />
        </div>
      </PageBody>
    </AppShell>
  );
}

function Field({ label, value, mono, tone }: { label: string; value: string; mono?: boolean; tone?: "good" | "bad" }) {
  const t = tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="bg-surface px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-[15px] font-medium ${mono ? "font-mono" : ""} ${t}`}>{value}</div>
    </div>
  );
}

function Hint({ icon: Icon, label, ok, okText, badText }: {
  icon: typeof Anchor; label: string; ok: boolean; okText: string; badText: string;
}) {
  return (
    <div className={`rounded-sm border p-3 ${ok ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5"}`}>
      <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className={`h-4 w-4 ${ok ? "text-success" : "text-destructive"}`} />
        {label}
      </div>
      <div className={`mt-1 text-[15px] font-medium ${ok ? "text-success" : "text-destructive"}`}>
        {ok ? okText : badText}
      </div>
    </div>
  );
}
