import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, Building2, Users, Briefcase, Award, ArrowRight, Home, Target, ListChecks, PhoneCall, StickyNote, Plus, Command as CmdIcon, CornerDownLeft, ChevronUp, AlertTriangle } from "lucide-react";
import { BoatIcon } from "@/components/icons/boat-icon";
import { Command as CommandPrimitive } from "cmdk";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  COMPANIES, CONTACTS, LISTINGS, OPPORTUNITIES, BRANDS, getBrand,
} from "@/lib/mock-data";

type InactiveCompany = {
  id: string;
  name: string;
  companyType: string;
  billingCity?: string | null;
  reason: string;
};

function daysSince(iso: string): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - t) / 86_400_000);
}

function computeLeastActive(limit = 6): InactiveCompany[] {
  const listingsByCompany = new Map<string, number>();
  for (const l of LISTINGS) {
    listingsByCompany.set(l.companyId, (listingsByCompany.get(l.companyId) ?? 0) + 1);
  }
  const scored = COMPANIES.map((c) => {
    const loginDays = daysSince(c.lastLogin ?? "");
    const studioDays = daysSince(c.lastStudioSessionAt ?? "");
    const usesStudio = c.servicesUsed?.studio === true;
    const listings = listingsByCompany.get(c.id) ?? 0;

    const reasons: string[] = [];
    if (!Number.isFinite(loginDays)) reasons.push("Never logged in");
    else if (loginDays >= 90) reasons.push(`Last active ${loginDays}d ago`);
    if (!usesStudio) reasons.push("Not using Studio");
    else if (!Number.isFinite(studioDays)) reasons.push("No Studio sessions");
    if (listings === 0) reasons.push("0 listings");

    // score: bigger = more inactive
    const score =
      (Number.isFinite(loginDays) ? Math.min(loginDays, 365) : 400) +
      (!usesStudio ? 120 : 0) +
      (listings === 0 ? 80 : 0);

    return { c, reasons, score };
  })
    .filter((x) => x.reasons.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ c, reasons }) => ({
    id: c.id,
    name: c.name,
    companyType: c.companyType,
    billingCity: c.billingCity,
    reason: reasons.slice(0, 2).join(" · "),
  }));
}


import { useAuth } from "@/lib/auth";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TabKey = "all" | "companies" | "contacts" | "listings" | "opportunities" | "brands";

const TABS: { key: TabKey; label: string; icon: typeof Building2 }[] = [
  { key: "all",           label: "Everything",    icon: Search },
  { key: "companies",     label: "Companies",     icon: Building2 },
  { key: "contacts",      label: "Contacts",      icon: Users },
  { key: "listings",      label: "Listings",      icon: BoatIcon },
  { key: "opportunities", label: "Opportunities", icon: Briefcase },
  { key: "brands",        label: "Brands",        icon: Award },
];

export function GlobalSearch({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<TabKey>("all");

  // ⌘K / Ctrl+K anywhere in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => { if (!open) { setQuery(""); setTab("all"); } }, [open]);

  const q = query.trim().toLowerCase();

  const inactive = useMemo<InactiveCompany[]>(() => (q ? [] : computeLeastActive(6)), [q]);

  const canOpps = can("opportunity.general");
  const visibleTabs = TABS.filter((t) => t.key !== "opportunities" || canOpps);

  const results = useMemo(() => {
    const match = (s: string) => s.toLowerCase().includes(q);
    if (!q) {
      return {
        companies: [] as typeof COMPANIES,
        contacts: CONTACTS.slice(0, 5),
        listings: LISTINGS.slice(0, 4),
        opportunities: canOpps ? OPPORTUNITIES.slice(0, 4) : [],
        brands: BRANDS.slice(0, 4),
      };
    }
    return {
      companies: COMPANIES.filter((c) =>
        match(c.name) || match(c.companyType) ||
        match(c.billingCity ?? "") || match(c.billingCountry ?? "")
      ).slice(0, 8),
      contacts: CONTACTS.filter((c) =>
        match(`${c.firstName} ${c.lastName}`) ||
        match(c.email ?? "") || match(c.contactType)
      ).slice(0, 8),
      listings: LISTINGS.filter((l) => {
        const brand = getBrand(l.brandId);
        return match(l.model) || match(`${l.year}`) ||
          (brand ? match(brand.name) : false);
      }).slice(0, 8),
      opportunities: canOpps
        ? OPPORTUNITIES.filter((o) =>
            match(o.name) || match(o.stage) || match(o.pipeline)
          ).slice(0, 8)
        : [],
      brands: BRANDS.filter((b) =>
        match(b.name) || match(b.manufacturerCountry ?? "")
      ).slice(0, 8),
    };
  }, [q, canOpps]);


  const totalCount =
    results.companies.length + results.contacts.length + results.listings.length +
    results.opportunities.length + results.brands.length;

  function go(path: string) { onOpenChange(false); navigate({ to: path }); }
  function openBrand(name: string) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    onOpenChange(false);
    window.open(`https://yachtway.com/brand/${slug}`, "_blank", "noopener,noreferrer");
  }

  const show = (k: TabKey) => tab === "all" || tab === k;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[94vw] p-0 gap-0 overflow-hidden border-border bg-popover">
        <CommandPrimitive
          shouldFilter={false}
          className="flex max-h-[82vh] flex-col"
        >
          {/* Header: search + subtitle */}
          <div className="border-b border-border bg-gradient-to-b from-accent/40 to-transparent px-5 pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand">
                <Search className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <CommandPrimitive.Input
                  autoFocus
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search companies, contacts, listings, opportunities, brands…"
                  className="w-full bg-transparent text-lg font-medium text-foreground outline-none placeholder:text-muted-foreground/60"
                />
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Jump to any record, take a quick action, or navigate the workspace.
                </p>
              </div>
              <kbd className="hidden items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground sm:inline-flex">
                ESC to close
              </kbd>
            </div>

            {/* Tabs */}
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              {visibleTabs.map((t) => {
                const Icon = t.icon;
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition " +
                      (active
                        ? "border-brand/40 bg-brand text-brand-foreground shadow-sm"
                        : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent/50")
                    }
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bento body */}
          <CommandPrimitive.List className="flex-1 overflow-y-auto px-5 py-5">
            {q && totalCount === 0 && (
              <CommandPrimitive.Empty className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/60">
                  <Search className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">No matches for "{query}"</p>
                <p className="text-xs text-muted-foreground">Try a company name, city, broker, or opportunity stage.</p>
              </CommandPrimitive.Empty>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* Left column: Companies + Contacts */}
              <div className="space-y-4 lg:col-span-2">
                {show("companies") && !q && inactive.length > 0 && (
                  <BentoCard
                    icon={AlertTriangle}
                    title="Needs attention"
                    count={inactive.length}
                    onSeeAll={() => go("/companies")}
                  >
                    <p className="mb-2 px-1 text-[11px] text-muted-foreground">
                      Least active members - surface accounts that haven't logged in, aren't using Studio, or have no listings.
                    </p>
                    <ul className="grid grid-cols-1 gap-1 md:grid-cols-2">
                      {inactive.map((c) => (
                        <RowItem
                          key={c.id}
                          value={`inactive ${c.name} ${c.reason}`}
                          onSelect={() => go(`/companies/${c.id}`)}
                          title={c.name}
                          subtitle={`${c.companyType}${c.billingCity ? ` · ${c.billingCity}` : ""}`}
                          reason={c.reason}
                          tone="brand"
                        />
                      ))}
                    </ul>
                  </BentoCard>
                )}

                {show("companies") && q && results.companies.length > 0 && (
                  <BentoCard
                    icon={Building2}
                    title="Companies"
                    count={results.companies.length}
                    onSeeAll={() => go("/companies")}
                  >
                    <ul className="grid grid-cols-1 gap-1 md:grid-cols-2">
                      {results.companies.map((c) => (
                        <RowItem
                          key={c.id}
                          value={`company ${c.name} ${c.companyType} ${c.billingCity}`}
                          onSelect={() => go(`/companies/${c.id}`)}
                          title={c.name}
                          subtitle={`${c.companyType}${c.billingCity ? ` · ${c.billingCity}` : ""}`}
                          tone="brand"
                        />
                      ))}
                    </ul>
                  </BentoCard>
                )}


                {show("contacts") && results.contacts.length > 0 && (
                  <BentoCard
                    icon={Users}
                    title="Contacts"
                    count={results.contacts.length}
                    onSeeAll={() => go("/contacts")}
                  >
                    <ul className="grid grid-cols-1 gap-1 md:grid-cols-2">
                      {results.contacts.map((c) => (
                        <RowItem
                          key={c.id}
                          value={`contact ${c.firstName} ${c.lastName} ${c.email}`}
                          onSelect={() => go(`/contacts/${c.id}`)}
                          title={`${c.firstName} ${c.lastName}`}
                          subtitle={`${c.contactType}${c.email ? ` · ${c.email}` : ""}`}
                          tone="brand"
                        />
                      ))}
                    </ul>
                  </BentoCard>
                )}

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {show("listings") && results.listings.length > 0 && (
                    <BentoCard icon={BoatIcon} title="Listings" count={results.listings.length} onSeeAll={() => go("/listings")}>
                      <ul className="space-y-1">
                        {results.listings.map((l) => {
                          const brand = getBrand(l.brandId);
                          return (
                            <RowItem
                              key={l.id}
                              value={`listing ${brand?.name ?? ""} ${l.model} ${l.year}`}
                              onSelect={() => go("/listings")}
                              title={`${brand?.name ?? ""} ${l.model}`}
                              subtitle={`${l.year} · ${l.lengthFt}ft · ${l.status}`}
                              tone="brand"
                            />
                          );
                        })}
                      </ul>
                    </BentoCard>
                  )}

                  {show("opportunities") && results.opportunities.length > 0 && (
                    <BentoCard icon={Briefcase} title="Opportunities" count={results.opportunities.length} onSeeAll={() => go("/opportunities")}>
                      <ul className="space-y-1">
                        {results.opportunities.map((o) => (
                          <RowItem
                            key={o.id}
                            value={`opp ${o.name} ${o.stage}`}
                            onSelect={() => go(`/opportunities/${o.id}`)}
                            title={o.name}
                            subtitle={`${o.stage} · ${o.pipeline}`}
                            tone="brand"
                          />
                        ))}
                      </ul>
                    </BentoCard>
                  )}
                </div>

                {show("brands") && results.brands.length > 0 && (
                  <BentoCard icon={Award} title="Brands" count={results.brands.length}>
                    <ul className="grid grid-cols-1 gap-1 md:grid-cols-2">
                      {results.brands.map((b) => (
                        <RowItem
                          key={b.id}
                          value={`brand ${b.name} ${b.manufacturerCountry}`}
                          onSelect={() => openBrand(b.name)}
                          title={b.name}
                          subtitle={b.manufacturerCountry ?? "-"}
                          tone="brand"
                          badge="↗"
                        />
                      ))}
                    </ul>
                  </BentoCard>
                )}
              </div>

              {/* Right column: quick actions + jump to */}
              <aside className="space-y-4">
                <BentoCard icon={Plus} title="Quick actions" muted>
                  <ul className="space-y-1">
                    <ActionRow icon={PhoneCall} label="Log a call" hint="Capture outcome" onSelect={() => go("/companies")} />
                    <ActionRow icon={StickyNote} label="Add a note" hint="On any record" onSelect={() => go("/companies")} />
                    <ActionRow icon={ListChecks} label="Create task" hint="Assign & due date" onSelect={() => go("/tasks")} />
                    <ActionRow icon={Plus} label="New opportunity" hint="Start a deal" onSelect={() => go("/opportunities")} />
                  </ul>
                </BentoCard>

                <BentoCard icon={Home} title="Jump to" muted>
                  <ul className="space-y-1">
                    <ActionRow icon={Home} label="Home" hint="Today's focus" onSelect={() => go("/")} />
                    <ActionRow icon={Target} label="Pipeline" hint="Open opportunities" onSelect={() => go("/opportunities")} />
                    <ActionRow icon={Building2} label="Companies" hint="All accounts" onSelect={() => go("/companies")} />
                    <ActionRow icon={Users} label="Contacts" hint="Brokers & leads" onSelect={() => go("/contacts")} />
                    <ActionRow icon={BoatIcon} label="Listings" hint="Active inventory" onSelect={() => go("/listings")} />
                  </ul>
                </BentoCard>
              </aside>
            </div>

            {/* Empty-state hint when no query and nothing to show for tab */}
            {!q && totalCount === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Start typing to search across your workspace.
              </p>
            )}
          </CommandPrimitive.List>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border bg-accent/30 px-5 py-2.5 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <Kbd><ChevronUp className="h-3 w-3" /></Kbd><Kbd>↓</Kbd> navigate
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Kbd><CornerDownLeft className="h-3 w-3" /></Kbd> open
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Kbd>ESC</Kbd> close
              </span>
            </div>
            <span className="inline-flex items-center gap-1.5">
              <Kbd><CmdIcon className="h-3 w-3" /></Kbd><Kbd>K</Kbd> to toggle anywhere
            </span>
          </div>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}

// -------------- bento building blocks --------------

function BentoCard({
  icon: Icon, title, count, onSeeAll, muted, children,
}: {
  icon: typeof Building2;
  title: string;
  count?: number;
  onSeeAll?: () => void;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={
        "rounded-2xl border border-border p-3 shadow-sm " +
        (muted ? "bg-accent/30" : "bg-background")
      }
    >
      <header className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-brand" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
            {title}
          </h3>
          {typeof count === "number" && (
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {count}
            </span>
          )}
        </div>
        {onSeeAll && (
          <button
            type="button"
            onClick={onSeeAll}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
          >
            See all <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </header>
      {children}
    </section>
  );
}

function RowItem({
  value, onSelect, title, subtitle, badge, reason,
}: {
  value: string;
  onSelect: () => void;
  title: string;
  subtitle: string;
  tone?: "brand";
  badge?: string;
  reason?: string;
}) {
  return (
    <CommandPrimitive.Item
      value={value}
      onSelect={onSelect}
      className="group flex cursor-pointer items-start justify-between gap-2 rounded-md px-2 py-2 text-sm outline-none transition data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground hover:bg-accent/60"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-foreground">{title}</div>
        <div className="truncate text-[11px] text-muted-foreground">{subtitle}</div>
        {reason && (
          <div className="mt-1 truncate text-[10px] font-medium text-amber-600 dark:text-amber-400">
            {reason}
          </div>
        )}
      </div>
      <span className="shrink-0 text-[11px] text-muted-foreground opacity-0 transition group-data-[selected=true]:opacity-100">
        {badge ?? "↵"}
      </span>
    </CommandPrimitive.Item>
  );
}


function ActionRow({
  icon: Icon, label, hint, onSelect,
}: {
  icon: typeof Building2;
  label: string;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <CommandPrimitive.Item
      value={`action ${label}`}
      onSelect={onSelect}
      className="group flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm outline-none transition data-[selected=true]:bg-background hover:bg-background"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{label}</div>
        <div className="truncate text-[11px] text-muted-foreground">{hint}</div>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition group-hover:opacity-100 group-data-[selected=true]:opacity-100" />
    </CommandPrimitive.Item>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[18px] items-center justify-center rounded border border-border bg-background px-1 py-0.5 text-[10px] font-medium text-foreground">
      {children}
    </kbd>
  );
}

// -------------- trigger --------------

export function GlobalSearchTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative ml-4 hidden w-full max-w-xs md:block"
      title="Search (⌘K)"
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-topbar-foreground/40" />
      <span className="flex h-9 items-center rounded-lg border border-white/10 bg-white/5 pl-10 pr-10 text-left text-sm text-topbar-foreground/50 hover:bg-white/10">
        Search anything…
      </span>
      <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-topbar-foreground/50 sm:inline-block">
        ⌘K
      </kbd>
    </button>
  );
}
