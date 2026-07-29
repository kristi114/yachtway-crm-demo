import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useSyncExternalStore } from "react";
import { Plus, ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { BoatIcon } from "@/components/icons/boat-icon";

import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CreateRecordDialog } from "@/components/create-record-dialog";
import { LISTING_SECTIONS } from "@/lib/field-schema";
import { RecordFilterBar } from "@/components/record-filter-bar";
import { applyClauses, filterableFields, type FilterClause } from "@/lib/record-filter";
import {
  LISTINGS, BRANDS, COMPANIES, getBrand, getCompany, getContact,
  addListing, subscribeMockData, getMockDataVersion, type Listing,
} from "@/lib/mock-data";
import { useMoney } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { computeListingHeat, HEAT_STYLES } from "@/components/dealer-health-panel";

export const Route = createFileRoute("/listings/")({
  component: ListingsList,
});

const STATUSES = ["Active", "Pending", "Sold", "Withdrawn"] as const;

function ListingsList() {
  const { format: fmtMoney } = useMoney();
  const [q, setQ] = useState("");
  const [clauses, setClauses] = useState<FilterClause[]>([]);
  const filterFields = useMemo(() => filterableFields(LISTING_SECTIONS), []);
  const [status, setStatus] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  /** null = natural order, "desc" = hottest first, "asc" = coldest first. */
  const [heatSort, setHeatSort] = useState<"asc" | "desc" | null>(null);
  const routerNavigate = useNavigate();
  useSyncExternalStore(subscribeMockData, getMockDataVersion, getMockDataVersion);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = LISTINGS
      .filter((l) => !status || l.status === status)
      .map((l) => ({
        ...l,
        brand: getBrand(l.brandId),
        company: getCompany(l.companyId),
        broker: l.brokerContactId ? getContact(l.brokerContactId) : null,
        heat: computeListingHeat(l),
      }))
      .filter((l) =>
        !needle ||
        `${l.brand?.name} ${l.model} ${l.company?.name} ${l.hullId}`
          .toLowerCase().includes(needle),
      );
    // Field-schema-driven advanced filters. Evaluate against a record where
    // lookup fields (company/brand/broker objects) are resolved to their name
    // strings so text operators match what's displayed.
    if (clauses.length > 0) {
      list = list.filter((l) => {
        const rec: Record<string, unknown> = {
          ...(l as unknown as Record<string, unknown>),
          company: l.company?.name ?? "",
          make: l.brand?.name ?? "",
          brand: l.brand?.name ?? "",
          model: l.model ?? "",
          listingBroker: l.broker ? `${l.broker.firstName} ${l.broker.lastName}` : "",
        };
        return applyClauses([rec], clauses, filterFields).length > 0;
      });
    }
    return list.sort((a, b) =>
      heatSort === "desc"
        ? b.heat.score - a.heat.score
        : heatSort === "asc"
          ? a.heat.score - b.heat.score
          : 0,
    );
  }, [q, status, heatSort, clauses, filterFields]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Yacht Industry"
        title="Listings"
        subtitle={`${LISTINGS.length} vessels across our dealer & brokerage network - synced from AWS`}
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New listing
          </Button>
        }
      />
      <CreateRecordDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New listing"
        description="All catalog fields are available - Model, Brand and Company are required."
        sections={LISTING_SECTIONS}
        requiredKeys={["model", "make", "companyId"]}
        initial={{
          make: BRANDS[0]?.id ?? "",
          companyId: COMPANIES[0]?.id ?? "",
        }}
        onSave={(values) => {
          const partial: Partial<Listing> & { model: string; brandId: string; companyId: string } = {
            model: String(values.model ?? "").trim(),
            brandId: String(values.make ?? BRANDS[0]?.id ?? ""),
            companyId: String(values.companyId ?? COMPANIES[0]?.id ?? ""),
          };
          const numOr = (v: unknown, fallback: number) =>
            typeof v === "number" && !Number.isNaN(v) ? v : fallback;
          if (values.year !== "" && values.year != null) partial.year = numOr(values.year, new Date().getFullYear());
          if (values.lengthFt !== "" && values.lengthFt != null) partial.lengthFt = numOr(values.lengthFt, 0);
          if (values.vesselPrice !== "" && values.vesselPrice != null) partial.priceUsd = numOr(values.vesselPrice, 0);
          if (typeof values.salesStatus === "string" && values.salesStatus) {
            const s = values.salesStatus;
            if (s === "Active" || s === "Pending" || s === "Sold" || s === "Withdrawn") partial.status = s;
          }
          if (typeof values.hullNumber === "string") partial.hullId = values.hullNumber;
          if (values.has3dTour) partial.has_3d_tour = true;
          if (values.photoCount != null && values.photoCount !== "") partial.photoCount = numOr(values.photoCount, 0);
          const created = addListing(partial);
          routerNavigate({ to: "/listings/$id", params: { id: created.id } });
        }}
      />
      <PageBody>
        <RecordFilterBar
          fields={filterFields}
          query={q}
          onQueryChange={setQ}
          clauses={clauses}
          onClausesChange={setClauses}
          searchPlaceholder="Search brand, model, dealer, hull ID…"
        />
        <div className="mb-3 flex items-center gap-2">
          <div className="ml-auto flex gap-1">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(status === s ? null : s)}
                className={`rounded-sm px-2 py-1 text-[11px] font-medium uppercase tracking-wide ${
                  status === s ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
          <table className="w-full text-[13px]">
            <thead className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Vessel</th>
                <th className="px-3 py-2 font-semibold">Year / Length</th>
                <th className="px-3 py-2 font-semibold">Dealer / Brokerage</th>
                <th className="px-3 py-2 font-semibold">Broker</th>
                <th className="px-3 py-2 text-right font-semibold">Price</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">
                  <button
                    type="button"
                    onClick={() =>
                      setHeatSort(heatSort === "desc" ? "asc" : heatSort === "asc" ? null : "desc")
                    }
                    title="Sort by listing heat score"
                    className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground"
                  >
                    Listing heat
                    {heatSort === "desc" ? (
                      <ArrowDown className="h-3 w-3" />
                    ) : heatSort === "asc" ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-50" />
                    )}
                  </button>
                </th>
                <th className="px-3 py-2 font-semibold">Hull ID</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => {
                const hs = HEAT_STYLES[l.heat.tone];
                const HeatIcon = hs.icon;
                return (
                  <tr key={l.id} className="border-t border-border hover:bg-accent/40">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <BoatIcon className="h-3.5 w-3.5 text-brand" />
                        <Link to="/listings/$id" params={{ id: l.id }} className="font-medium text-brand hover:underline">
                          {l.brand?.name} {l.model}
                        </Link>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{l.year} · {l.lengthFt}ft</td>
                    <td className="px-3 py-2">
                      {l.company && (
                        <Link to="/companies/$id" params={{ id: l.company.id }} className="text-brand hover:underline">
                          {l.company.name}
                        </Link>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {l.broker ? (
                        <Link to="/contacts/$id" params={{ id: l.broker.id }} className="text-brand hover:underline">
                          {l.broker.firstName} {l.broker.lastName}
                        </Link>
                      ) : "-"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(l.priceUsd, l.company?.currency)}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-[10px]">{l.status}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                          <div className={`h-full ${hs.bar}`} style={{ width: `${l.heat.score}%` }} />
                        </div>
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums ${hs.text}`}>
                          <HeatIcon className="h-3 w-3" /> {l.heat.score}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{hs.label}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{l.hullId}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </PageBody>
    </AppShell>
  );
}
