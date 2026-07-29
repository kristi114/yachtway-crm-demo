import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { ChevronRight, ChevronDown, Building2, Sparkles, CheckCircle2, Pencil, Video, VideoOff, Radio, MapPin, ExternalLink, Info, CalendarDays, Users, TrendingUp, UserCog, MessageSquare, FileText, Landmark } from "lucide-react";
import { StudioToursPanel } from "@/components/studio-tours-panel";
import { studioToursForCompany } from "@/lib/studio-tours";
import { useBillingStore, docTotal, type BillingDoc } from "@/lib/billing";


import { BoatIcon } from "@/components/icons/boat-icon";
import { HandshakeIcon } from "@/components/icons/handshake-icon";
import { Fragment, useEffect, useState } from "react";
import { useAuth, useMoney, DEMO_USER_LIST, ROLE_LABELS, canSeeFinTech } from "@/lib/auth";
import { LockedRecord } from "@/components/locked-record";
import { CURRENCY_SYMBOL } from "@/lib/currency";

import { CompanyReferralsSection } from "@/components/referrals-table";
import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { CompanyLogo } from "@/components/company-logo";
import { DetailSections } from "@/components/field-renderer";
import { ActivityPanel } from "@/components/activity-panel";
import { CompanyEmailsPanel } from "@/components/email-builder/company-emails-panel";
import { EventsTable } from "@/components/events-table";
import { eventsForCompany, useEventsStore } from "@/lib/events";
import { CompanySnapshotPanel } from "@/components/company-snapshot-panel";
import { SectionTabs } from "@/components/section-tabs";


import { EngagementPanel } from "@/components/engagement-panel";
import { BrokerRosterPanel } from "@/components/broker-roster-panel";
import { DealerHealthPanel, computeListingHeat, HEAT_STYLES } from "@/components/dealer-health-panel";
import { RecommendationsPanel } from "@/components/recommendations-panel";
import { EditCompanyDialog } from "@/components/edit-company-dialog";
import { LogCommsDialog } from "@/components/log-comms-dialog";
import { DealerCreditPanel } from "@/components/dealer-credit-panel";
import { ServicesAdoptionPanel } from "@/components/services-adoption-panel";
import { CreateOpportunityDialog } from "@/components/create-opportunity-dialog";
import { getCreditBalance, useCreditStore } from "@/lib/dealer-credit";
import { Button } from "@/components/ui/button";
import { MessageSquarePlus, Plus, MapPinned, Trash2, GitMerge, MoreHorizontal } from "lucide-react";
import { OfficeDialog } from "@/components/office-dialog";
import { OfficesDialog } from "@/components/offices-dialog";
import { MergeRecordDialog } from "@/components/merge-record-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { COMPANY_SECTIONS } from "@/lib/field-schema";
import {
  getCompany, getContact, contactsForCompany, childCompanies,
  brandsForCompany, listingsForCompany, getBrand,
  computeDealerScore, has3DTours, TIER_STYLES,
  COMPANY_ROLES, type CompanyRole, type Contact, OPPORTUNITIES,
  officesForCompany, removeOffice, type Office,
  setPrimaryContact,
  subscribeMockData,
} from "@/lib/mock-data";
import { BrandsPickerDialog } from "@/components/brands-picker-dialog";
import { AddContactDialog } from "@/components/add-contact-dialog";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";


export const Route = createFileRoute("/companies/$id")({
  loader: ({ params }) => {
    const company = getCompany(params.id);
    if (!company) throw notFound();
    return { company };
  },
  component: CompanyDetail,
  notFoundComponent: () => (
    <AppShell>
      <PageBody>
        <div className="rounded-sm border border-border bg-surface p-8 text-center">
          <h2 className="text-lg font-semibold">Company not found</h2>
          <Link to="/companies" className="mt-2 inline-block text-sm text-brand hover:underline">
            Back to companies
          </Link>
        </div>
      </PageBody>
    </AppShell>
  ),
});

function CompanyDetail() {
  const { company: loaded } = Route.useLoaderData();
  const { user, can } = useAuth();
  const { format: fmtMoney } = useMoney();
  const [company, setCompany] = useState(loaded);
  const [activeTab, setActiveTab] = useState<string>("overview");
  const isLocked = company.vertical === "FinTech" && !canSeeFinTech(user.role);
  const [expandedListings, setExpandedListings] = useState<Set<string>>(new Set());
  const [editOpen, setEditOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [oppOpen, setOppOpen] = useState(false);
  const [studioOppOpen, setStudioOppOpen] = useState(false);

  const [officeOpen, setOfficeOpen] = useState(false);
  const [editingOffice, setEditingOffice] = useState<Office | undefined>(undefined);
  const [allOfficesOpen, setAllOfficesOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [brandsOpen, setBrandsOpen] = useState(false);
  const [addContactOpen, setAddContactOpen] = useState(false);
  // Force re-render when OFFICES mutates so newly added offices show up.
  const [, forceTick] = useState(0);
  useEffect(() => subscribeMockData(() => forceTick((n) => n + 1)), []);
  const offices = officesForCompany(company.id);
  const parent = company.parentCompanyId ? getCompany(company.parentCompanyId) : null;
  const children = childCompanies(company.id);
  const contacts = contactsForCompany(company.id);
  const brands = brandsForCompany(company.id);
  const listings = listingsForCompany(company.id);
  const mainContact = company.primaryContactId ? getContact(company.primaryContactId) : null;
  const companyRecord = {
    ...company,
    primaryContact: mainContact ? `${mainContact.firstName} ${mainContact.lastName}` : null,
    primaryContactId: mainContact?.id ?? null,
  } as Record<string, unknown>;
  const navigate = useNavigate({ from: "/companies/$id" });
  const showEasyfundCard =
    company.vertical === "Main" &&
    (company.companyType === "Dealer" || company.companyType === "Brokerage");
  const showBrandsSection =
    company.companyType === "Dealer" ||
    company.companyType === "Brokerage" ||
    company.companyType === "Shipyard";
  const showCreditPanel =
    company.companyType === "Dealer" ||
    company.companyType === "Brokerage" ||
    company.companyType === "Shipyard";
  useCreditStore();
  const creditBalance = getCreditBalance(company.id);

  const handleSave = (values: Partial<typeof company>) => {
    // Mutate the underlying record so the change persists across navigation
    // for the lifetime of the session (mock data lives in-memory).
    Object.assign(loaded, values);
    // Keep the service flag in sync with the top-level commercial flag.
    if (typeof values.customWebsiteEnabled === "boolean") {
      loaded.servicesUsed.customWebsite = values.customWebsiteEnabled;
    }
    setCompany({ ...loaded });
  };

  if (isLocked) {
    return <LockedRecord kind="company" backTo="/companies" backLabel="Back to companies" />;
  }

  return (
    <AppShell>
      <PageHeader
        media={<CompanyLogo company={company} size="lg" />}
        eyebrow={
          <span className="flex items-center gap-1">
            <Link to="/companies" className="hover:underline">Companies</Link>
            <ChevronRight className="h-3 w-3" />
            {parent && (
              <>
                <Link to="/companies/$id" params={{ id: parent.id }} className="hover:underline">
                  {parent.name}
                </Link>
                <ChevronRight className="h-3 w-3" />
              </>
            )}
            <span>{company.name}</span>
          </span>
        }
        title={company.name}
        creditAnchor={
          creditBalance !== 0
            ? {
                onClick: () => {
                  setActiveTab("invoices");
                  setTimeout(() => {
                    document.getElementById("dealer-credit")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 0);
                },
                label: "User has YachtWay credit",
              }
            : undefined
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{company.companyType}</Badge>
            <Badge variant="outline">{company.status}</Badge>
            {[company.billingCity, company.billingCountry].filter(Boolean).length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand-deep">
                <MapPin className="h-3 w-3 text-brand" />
                {[company.billingCity, company.billingCountry].filter(Boolean).join(", ")}
              </span>
            )}
            {company.yachtwayDealerPage && (
              <a
                href={company.yachtwayDealerPage}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand-deep hover:bg-brand/20"
              >
                <ExternalLink className="h-3 w-3 text-brand" />
                YachtWay profile
              </a>
            )}
          </span>
        }
        actions={
          <>
            <AccountManagerPicker
              value={company.ownerUserId}
              onChange={(id) => handleSave({ ownerUserId: id })}
            />
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setEditingOffice(undefined); setOfficeOpen(true); }}>
              <MapPinned className="mr-1.5 h-3.5 w-3.5" />
              Add office
            </Button>
            <Button variant="outline" size="sm" onClick={() => setOppOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New opportunity
            </Button>
            <Button size="sm" onClick={() => setLogOpen(true)}>
              <MessageSquarePlus className="mr-1.5 h-3.5 w-3.5" />
              Log activity
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" aria-label="More actions">
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
      <EditCompanyDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        company={company}
        contacts={contacts}
        onSave={handleSave}
      />
      <LogCommsDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        relatedType="company"
        relatedId={company.id}
      />
      <CreateOpportunityDialog
        open={oppOpen}
        onOpenChange={setOppOpen}
        presetCompanyId={company.id}
        presetContactId={mainContact?.id ?? null}
        defaultName={`${company.name} - `}
      />
      <CreateOpportunityDialog
        open={studioOppOpen}
        onOpenChange={setStudioOppOpen}
        pipelines={["Studio"]}
        presetCompanyId={company.id}
        presetContactId={mainContact?.id ?? null}
        defaultName={`${company.name} - 3D Tour`}
      />

      <OfficeDialog
        open={officeOpen}
        onOpenChange={(o) => { setOfficeOpen(o); if (!o) setEditingOffice(undefined); }}
        companyId={company.id}
        office={editingOffice}
        contacts={contacts}
      />
      <OfficesDialog
        open={allOfficesOpen}
        onOpenChange={setAllOfficesOpen}
        companyId={company.id}
        companyName={company.name}
        contacts={contacts}
        onAdd={() => { setEditingOffice(undefined); setOfficeOpen(true); }}
        onEdit={(o) => { setEditingOffice(o); setOfficeOpen(true); }}
      />
      <BrandsPickerDialog company={company} open={brandsOpen} onOpenChange={setBrandsOpen} />
      <AddContactDialog
        company={company}
        open={addContactOpen}
        onOpenChange={setAddContactOpen}
        onCreated={(_id, becamePrimary) => {
          toast.success(
            becamePrimary
              ? "Contact added and flagged as primary (first contact on this company)"
              : "Contact added",
          );
        }}
      />

      <MergeRecordDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        kind="company"
        currentId={company.id}
        onMerged={(survivorId) => {
          if (survivorId !== company.id) navigate({ to: "/companies/$id", params: { id: survivorId } });
        }}
      />
      <SectionTabs
        active={activeTab}
        onChange={setActiveTab}
        items={(() => {
          const studioTours = studioToursForCompany(company.id);
          const hasAnyStudio = OPPORTUNITIES.some(
            (o) => o.companyId === company.id && o.pipeline === "Studio",
          );
          const studioLabel = studioTours.length
            ? `Studio (${studioTours.length})`
            : "Studio";
          const invoiceCount = useBillingStore().filter(
            (d) => d.companyId === company.id && d.kind === "invoice",
          ).length;
          useEventsStore();
          const eventCount = eventsForCompany(company.id).length;
          return [
            { id: "overview", label: "Overview", icon: Info },
            ...(listings.length ? [{ id: "inventory", label: `Inventory (${listings.length})`, icon: BoatIcon }] : []),
            { id: "services", label: "Services", icon: Sparkles },
            ...(hasAnyStudio ? [{ id: "studio", label: studioLabel, icon: Video }] : []),
            ...(canSeeFinTech(user.role) ? [{ id: "easyfund", label: "EasyFund", icon: Landmark }] : []),
            ...(can("billing")
              ? [{ id: "invoices", label: `Invoices (${invoiceCount})`, icon: FileText }]
              : []),
            { id: "events", label: eventCount ? `Events (${eventCount})` : "Events", icon: CalendarDays },
            { id: "relationship", label: "Relationship", icon: HandshakeIcon },
            { id: "activity", label: "Activity", icon: MessageSquare },
            { id: "people", label: `People (${contacts.length})`, icon: Users },
          ];
        })()}
      />
      <PageBody>
        {activeTab === "overview" && (
          <div className="space-y-6">
            <CompanySnapshotPanel
              company={company}
              contacts={contacts}
              listingsCount={listings.length}
              onOpenAllOffices={() => setAllOfficesOpen(true)}
            />
            <DetailSections
              sections={COMPANY_SECTIONS}
              record={companyRecord}
              reorderable
              layoutKey="company"
              exclude={["accounting", "listings performance", "studio & 3d tours", "easyfund", "platform adoption"]}
              onEditField={(key, value) => handleSave({ [key]: value } as Partial<typeof company>)}

              fieldActions={{
                ...(listings.length > 0 ? { activeListings: () => setActiveTab("inventory") } : {}),
                ...(mainContact ? { primaryContact: () => navigate({ to: "/contacts/$id", params: { id: mainContact.id } }) } : {}),
              }}
              sectionExtras={{
                offices: (
                  <div className="border-t border-border">
                    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="text-[12px] font-semibold uppercase tracking-wide text-brand-deep">
                        Additional offices ({offices.length})
                      </span>
                      <Button size="sm" variant="outline" onClick={() => { setEditingOffice(undefined); setOfficeOpen(true); }}>
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        Add office
                      </Button>
                    </div>
                    {offices.length === 0 ? (
                      <div className="px-4 pb-5 text-[13px] text-muted-foreground">
                        No additional offices. Add showrooms, branches, or service centers.
                      </div>
                    ) : (
                      <ul className="divide-y divide-border border-t border-border">
                        {offices.map((o) => {
                          const mgr = o.managerContactId ? getContact(o.managerContactId) : null;
                          const addr = [o.addressLine1, o.city, o.state, o.postalCode, o.country].filter(Boolean).join(", ");
                          return (
                            <li key={o.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                              <MapPinned className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{o.label}</span>
                                  {o.isHeadquarters && (
                                    <Badge variant="outline" className="text-[10px]">HQ</Badge>
                                  )}
                                  {o.purpose && (
                                    <Badge variant="outline" className="text-[10px]">{o.purpose}</Badge>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {addr || "No address"}
                                </div>
                                <div className="mt-0.5 text-xs text-muted-foreground truncate">
                                  {[o.phone, o.email, mgr ? `${mgr.firstName} ${mgr.lastName}` : ""].filter(Boolean).join(" · ")}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button size="sm" variant="ghost" onClick={() => { setEditingOffice(o); setOfficeOpen(true); }}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => { if (confirm(`Delete office "${o.label}"?`)) removeOffice(o.id); }}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                ),
              }}
            />


            {showBrandsSection && (
              <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
                <header className="flex items-center justify-between gap-3 border-b border-border bg-secondary/60 px-4 py-2.5">
                  <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
                    {company.companyType === "Shipyard" ? "Brands Built" : "Authorized Dealer For:"} ({brands.length})
                  </h3>
                  <Button variant="outline" size="sm" onClick={() => setBrandsOpen(true)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    {brands.length ? "Manage brands" : "Add brands"}
                  </Button>
                </header>
                <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {brands.map((b) => {
                    const slug = b.brand.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
                    const href = `https://yachtway.com/brand/${slug}`;
                    return (
                      <a
                        key={b.brandId}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex flex-col items-stretch gap-2 rounded-lg transition-transform hover:-translate-y-0.5"
                        title={`Open ${b.brand.name} on YachtWay`}
                      >
                        <div className="relative flex aspect-[4/3] items-center justify-center rounded-xl border border-border bg-secondary/30 px-4 shadow-sm transition-shadow group-hover:shadow-md">
                          <span
                            className="text-center text-xl font-semibold italic tracking-tight text-brand-deep"
                            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                          >
                            {b.brand.name}
                          </span>
                          {b.exclusive && (
                            <span className="absolute right-2 top-2 rounded-sm bg-brand px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-brand-foreground shadow-sm">
                              Exclusive
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-center gap-1.5 pt-0.5">
                          <span className="text-sm font-medium text-foreground group-hover:text-brand">
                            {b.brand.name}
                          </span>
                          <CheckCircle2 className="h-3.5 w-3.5 fill-brand text-brand-foreground" />
                        </div>
                      </a>
                    );
                  })}
                  {brands.length === 0 ? (
                    <p className="col-span-full text-[13px] text-muted-foreground">
                      No brands linked yet. Brands come from the managed catalogue - use
                      {" "}<span className="font-medium text-foreground">Add brands</span> to link them.
                    </p>
                  ) : null}
                </div>
              </section>
            )}

            {children.length > 0 && (
              <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
                <header className="border-b border-border bg-secondary/60 px-4 py-2.5">
                  <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
                    Dealer network ({children.length})
                  </h3>
                </header>
                <ul className="divide-y divide-border">
                  {children.map((c) => (
                    <li key={c.id}>
                      <Link
                        to="/companies/$id" params={{ id: c.id }}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent/40"
                      >
                        <Building2 className="h-4 w-4 shrink-0 text-brand" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-brand">{c.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {c.companyType} · {c.billingCity}, {c.billingCountry} · {c.activeListings} listings
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[10px]">{c.status}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}





          </div>
        )}


        {activeTab === "inventory" && listings.length > 0 && (
          <div className="space-y-6">
            <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
              <header className="flex items-center justify-between border-b border-border bg-secondary/60 px-4 py-2.5">
                <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
                  Listings ({listings.length})
                </h3>
                {(() => {
                  const t = has3DTours(company);
                  if (t.total === 0) return null;
                  const pct = Math.round((t.with3d / t.total) * 100);
                  return (
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                      <Video className="h-3.5 w-3.5 text-brand" />
                      {t.with3d}/{t.total} with 3D tour · {pct}%
                    </span>
                  );
                })()}
              </header>
              <table className="w-full text-[13px]">
                <thead className="bg-secondary/30 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="w-8 px-2 py-1.5"></th>
                    <th className="px-3 py-1.5">Vessel</th>
                    <th className="px-3 py-1.5">Broker</th>
                    <th className="px-3 py-1.5 text-right">Price</th>
                    <th className="w-[170px] px-3 py-1.5">Heat score</th>
                    <th className="px-3 py-1.5">Media</th>
                    <th className="px-3 py-1.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((l) => {
                    const brand = getBrand(l.brandId);
                    const broker = l.brokerContactId
                      ? contacts.find((c) => c.id === l.brokerContactId)
                      : null;
                    const heat = computeListingHeat(l);
                    const hs = HEAT_STYLES[heat.tone];
                    const HeatIcon = hs.icon;
                    const isOpen = expandedListings.has(l.id);
                    const toggle = () => setExpandedListings((prev) => {
                      const next = new Set(prev);
                      if (next.has(l.id)) next.delete(l.id); else next.add(l.id);
                      return next;
                    });
                    return (
                      <Fragment key={l.id}>
                      <tr
                        className="cursor-pointer border-t border-border hover:bg-secondary/30"
                        onClick={toggle}
                      >
                        <td className="px-2 py-2 text-muted-foreground">
                          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <BoatIcon className="h-3.5 w-3.5 text-brand" />
                            <Link
                              to="/listings/$id"
                              params={{ id: l.id }}
                              onClick={(e) => e.stopPropagation()}
                              className="font-medium text-brand hover:underline"
                            >
                              {brand?.name} {l.model}
                            </Link>
                            <span className="text-xs text-muted-foreground">
                              {l.year} · {l.lengthFt}ft
                            </span>
                            <Link
                              to="/listings/$id"
                              params={{ id: l.id }}
                              onClick={(e) => e.stopPropagation()}
                              className="ml-auto inline-flex items-center gap-1 rounded-sm border border-border bg-secondary/60 px-2 py-0.5 text-[11px] font-semibold text-brand-deep hover:bg-secondary"
                              aria-label="Open listing"
                            >
                              Open <ExternalLink className="h-3 w-3" />
                            </Link>
                          </div>
                        </td>

                        <td className="px-3 py-2 text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                          {broker ? (
                            <Link to="/contacts/$id" params={{ id: broker.id }} className="text-brand hover:underline">
                              {broker.firstName} {broker.lastName}
                            </Link>
                          ) : "-"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(l.priceUsd, company.currency)}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                              <div className={`h-full ${hs.bar}`} style={{ width: `${heat.score}%` }} />
                            </div>
                            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums ${hs.text}`}>
                              <HeatIcon className="h-3 w-3" /> {heat.score}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2 text-xs">
                            {l.has_3d_tour ? (
                              <span className="inline-flex items-center gap-1 rounded-sm bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand-deep">
                                <Video className="h-3 w-3" /> 3D
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-sm bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                                <VideoOff className="h-3 w-3" /> No 3D
                              </span>
                            )}
                            <span className="text-muted-foreground tabular-nums">{l.photoCount} photos</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className="text-[10px]">{l.status}</Badge>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-t border-border bg-secondary/20">
                          <td></td>
                          <td colSpan={6} className="px-3 py-3">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                <span>Heat score breakdown</span>
                                <span className={`tabular-nums ${hs.text}`}>{heat.score} / 100</span>
                              </div>
                              {heat.reasons.length === 0 ? (
                                <p className="text-xs text-muted-foreground">No issues detected - listing is in great shape.</p>
                              ) : (
                                <ul className="divide-y divide-border rounded-sm border border-border bg-surface">
                                  {heat.reasons.map((r) => (
                                    <li key={r.label} className="flex items-start justify-between gap-2 px-3 py-1.5 text-xs">
                                      <span className="text-foreground">· {r.label}</span>
                                      <span className="tabular-nums font-semibold text-destructive">{r.weight}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </section>
            <DetailSections
              sections={COMPANY_SECTIONS}
              record={companyRecord}
              only={["listings performance"]}
            />
          </div>
        )}

        {activeTab === "services" && (
          <div className="max-w-5xl space-y-6">
            <ServicesAdoptionPanel company={company} />
            <DetailSections
              sections={COMPANY_SECTIONS}
              record={companyRecord}
              only={["platform adoption"]}
            />
          </div>
        )}

        {activeTab === "studio" && (
          <div className="max-w-5xl space-y-6">
            <div className="flex items-center justify-end">
              <Button size="sm" onClick={() => setStudioOppOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                New Studio opportunity
              </Button>
            </div>
            <StudioToursPanel
              tours={studioToursForCompany(company.id)}
              hideCompany
              emptyLabel="No delivered Studio tours for this account yet."
            />
            <DetailSections
              sections={COMPANY_SECTIONS}
              record={companyRecord}
              only={["studio & 3d tours"]}
            />
            <StudioHistorySection companyId={company.id} />
          </div>
        )}

        {activeTab === "easyfund" && canSeeFinTech(user.role) && (
          <div className="max-w-5xl space-y-6">
            <DetailSections
              sections={COMPANY_SECTIONS}
              record={companyRecord}
              only={["easyfund"]}
            />
            <CompanyReferralsSection companyId={company.id} />
          </div>
        )}


        {activeTab === "invoices" && can("billing") && (
          <div className="max-w-5xl space-y-6">
            <DetailSections
              sections={COMPANY_SECTIONS}
              record={companyRecord}
              only={["accounting"]}
            />
            <CompanyInvoicesSection companyId={company.id} />
            {showCreditPanel && (
              <div id="dealer-credit">
                <DealerCreditPanel
                  companyId={company.id}
                  companyName={company.name}
                  currency={company.currency}
                />
              </div>
            )}
          </div>
        )}


        {activeTab === "relationship" && (
          <div className="space-y-6">
            <SubSectionHeader title="Recommendations" />
            <RecommendationsPanel company={company} contacts={contacts} listings={listings} />

            <SubSectionHeader title="Account health" />
            <DealerHealthPanel company={company} contacts={contacts} listings={listings} />


            {showEasyfundCard && (
              <>
                <SubSectionHeader title="Opportunities" />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <EasyFundCard company={company} contacts={contacts} repName={user.name} />
                  <ThreeDTourUpsellCard company={company} contacts={contacts} repName={user.name} />
                  <LiveUpsellCard company={company} contacts={contacts} repName={user.name} />
                </div>
              </>
            )}

            <SubSectionHeader title="Engagement" />
            <div className="max-w-4xl">
              <EngagementPanel company={company} contacts={contacts} onGapClick={() => setActiveTab("people")} />
            </div>

          </div>
        )}

        {activeTab === "activity" && (
          <div className="max-w-5xl space-y-4">
            <ActivityPanel type="company" id={company.id} />
            <CompanyEmailsPanel companyId={company.id} />
          </div>
        )}

        {activeTab === "events" && (
          <div className="max-w-5xl">
            <EventsTable companyId={company.id} />
          </div>
        )}




        {activeTab === "people" && (
          <div className="max-w-5xl space-y-3">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setAddContactOpen(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add contact
              </Button>
            </div>
            {company.vertical === "Main" &&
             (company.companyType === "Dealer" || company.companyType === "Brokerage") ? (
              <BrokerRosterPanel company={company} contacts={contacts} />
            ) : (
              <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
                <header className="border-b border-border bg-secondary/60 px-4 py-2.5">
                  <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
                    {company.companyType === "Bank" || company.companyType === "Lender"
                      ? "Team contacts" : "Brokers & contacts"} ({contacts.length})
                  </h3>
                </header>
                <ul className="divide-y divide-border">
                  {contacts.length === 0 && (
                    <li className="px-4 py-4 text-sm text-muted-foreground">No contacts linked.</li>
                  )}
                  {contacts.map((c) => {
                    const isPrimary = company.primaryContactId === c.id;
                    return (
                      <li key={c.id} className="px-4 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <Link
                            to="/contacts/$id" params={{ id: c.id }}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-w-0 flex-1 hover:bg-accent/40 -mx-1 px-1 rounded-sm"
                            title="Open contact profile in a new tab"
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-medium text-brand">
                                {c.firstName} {c.lastName}
                              </span>
                              {isPrimary && (
                                <span className="shrink-0 rounded-sm bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-deep ring-1 ring-brand/25">
                                  Primary
                                </span>
                              )}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">{c.contactType}</div>
                          </Link>
                          {!isPrimary && (
                            <button
                              type="button"
                              onClick={() => setPrimaryContact(company.id, c.id)}
                              className="shrink-0 rounded-sm px-1.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                            >
                              Make primary
                            </button>
                          )}
                          <ContactRoleSelect contact={c} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
        )}

      </PageBody>
    </AppShell>
  );
}

function SubSectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </h2>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}




function ContactRoleSelect({ contact }: { contact: Contact }) {
  const [role, setRole] = useState<CompanyRole | "">(contact.companyRole ?? "");
  return (
    <Select
      value={role}
      onValueChange={(v) => {
        const next = v as CompanyRole;
        setRole(next);
        contact.companyRole = next; // persist to in-memory mock record
      }}
    >
      <SelectTrigger
        className="h-7 w-[130px] shrink-0 text-xs"
        aria-label="Company role"
      >
        <SelectValue placeholder="Set role" />
      </SelectTrigger>
      <SelectContent>
        {COMPANY_ROLES.map((r) => (
          <SelectItem key={r} value={r} className="text-xs">
            {r}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function EasyFundCard({
  company,
  contacts,
  repName,
}: {
  company: ReturnType<typeof getCompany> & object;
  contacts: ReturnType<typeof contactsForCompany>;
  repName: string;
}) {
  const { can } = useAuth();
  const enabled = company.servicesUsed.easyfund;


  if (enabled) {
    return (
      <section className="overflow-hidden rounded-sm border border-success/40 bg-surface shadow-sm">
        <header className="flex items-center gap-2 border-b border-border bg-success/10 px-4 py-2.5">
          <CheckCircle2 className="h-4 w-4 text-success" />
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
            EasyFund - active
          </h3>
        </header>
        <dl className="grid grid-cols-2 gap-2 px-4 py-3 text-xs">
          <div>
            <dt className="text-muted-foreground">Referrals YTD</dt>
            <dd className="text-sm font-semibold tabular-nums whitespace-nowrap">
              {company.easyfundReferralsTotal}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Approved</dt>
            <dd className="text-sm font-semibold tabular-nums whitespace-nowrap">
              {company.easyfundReferralsApproved}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Funded</dt>
            <dd className="text-sm font-semibold tabular-nums whitespace-nowrap">
              {company.easyfundReferralsFunded}
            </dd>
          </div>
          {can("easyfund") && (
            <div>
              <dt className="text-muted-foreground">Closed volume</dt>
              <dd className="text-sm font-semibold tabular-nums whitespace-nowrap">
                {CURRENCY_SYMBOL[company.currency]}{(company.easyfundClosedReferralsAmount / 1_000_000).toFixed(1)}M
              </dd>
            </div>
          )}

        </dl>
      </section>
    );
  }

  const primary = contacts[0];
  const subject = encodeURIComponent(
    `EasyFund financing for ${company.name}'s buyers`,
  );
  const body = encodeURIComponent(
    `Hi ${primary?.firstName ?? "there"},\n\n` +
    `Wanted to introduce YachtWay EasyFund - our embedded marine-loan pre-qualification flow. ` +
    `It lets your buyers get pre-approved in minutes on any of your listings, and we route approved deals to our lender partners so you close faster.\n\n` +
    `Would a 15-min walkthrough this week work?\n\nThanks,\n${repName}`,
  );
  const mailto = primary?.email
    ? `mailto:${primary.email}?subject=${subject}&body=${body}`
    : null;

  return (
    <section className="overflow-hidden rounded-sm border border-warning/50 bg-surface shadow-sm">
      <header className="flex items-center gap-2 border-b border-border bg-warning/10 px-4 py-2.5">
        <Sparkles className="h-4 w-4 text-warning-foreground" />
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
          EasyFund - not enabled
        </h3>
      </header>
      <div className="space-y-3 px-4 py-3 text-xs">
        <p className="text-muted-foreground">
          This dealer is not offering EasyFund financing to their buyers yet. Pitching it typically
          shortens time-to-close and adds a revenue share on every funded deal.
        </p>
        <ul className="space-y-1 text-muted-foreground">
          <li>· Embedded pre-qualification on every listing</li>
          <li>· Buyers approved in minutes by our lender network</li>
          <li>· Revenue share on funded loans</li>
        </ul>
        <div className="flex flex-wrap gap-2 pt-1">
          {mailto ? (
            <a
              href={mailto}
              className="inline-flex items-center gap-1 rounded-sm bg-brand px-3 py-1.5 text-[12px] font-semibold text-brand-foreground shadow-sm transition-colors hover:bg-brand-deep"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Pitch EasyFund to {primary!.firstName}
            </a>
          ) : (
            <span className="text-muted-foreground italic">
              Add a contact to send a pitch email.
            </span>
          )}
          <Link
            to="/opportunities"
            className="rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-brand hover:bg-accent/40"
          >
            Log opportunity
          </Link>
        </div>
      </div>
    </section>
  );
}

// ==========================================================
// Health score card - live scoring on the dealer profile
// ==========================================================
function HealthScoreCard({ company }: { company: ReturnType<typeof getCompany> & object }) {
  const score = computeDealerScore(company);
  const style = TIER_STYLES[score.tier];
  return (
    <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
      <header className="flex items-center justify-between border-b border-border bg-secondary/60 px-4 py-2.5">
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
          Dealer health
        </h3>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${style.bg} ${style.text} ${style.ring}`}>
          {score.tier}
        </span>
      </header>
      <div className="flex items-center gap-4 px-4 py-4">
        <div className="relative grid h-20 w-20 shrink-0 place-items-center">
          <svg viewBox="0 0 60 60" className="h-20 w-20 -rotate-90">
            <circle cx="30" cy="30" r="24" fill="none" stroke="oklch(0.93 0.01 300)" strokeWidth="6" />
            <circle
              cx="30" cy="30" r="24" fill="none" strokeWidth="6" strokeLinecap="round"
              stroke="oklch(0.55 0.17 300)"
              strokeDasharray={`${(2 * Math.PI * 24) * (score.score / 100)} ${2 * Math.PI * 24}`}
            />
          </svg>
          <div className="absolute text-center">
            <div className="text-lg font-semibold tabular-nums text-brand-deep">{score.score}</div>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">/ 100</div>
          </div>
        </div>
        <div className="min-w-0 flex-1 text-xs">
          {score.reasons.length === 0 ? (
            <p className="text-muted-foreground">
              This account is firing on all cylinders. Keep the cadence up.
            </p>
          ) : (
            <>
              <p className="mb-1.5 font-medium text-foreground">What's dragging the score</p>
              <ul className="space-y-1">
                {score.reasons.slice(0, 4).map((r) => (
                  <li key={r.label} className="flex items-start justify-between gap-2 text-muted-foreground">
                    <span>· {r.label}</span>
                    <span className="tabular-nums text-destructive">{r.weight}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// ==========================================================
// 3D tour upsell card - fires when active listings lack 3D
// ==========================================================
function ThreeDTourUpsellCard({
  company, contacts, repName,
}: {
  company: ReturnType<typeof getCompany> & object;
  contacts: ReturnType<typeof contactsForCompany>;
  repName: string;
}) {
  const t = has3DTours(company);
  if (t.total === 0) return null;

  if (t.with3d === t.total) {
    return (
      <section className="overflow-hidden rounded-sm border border-success/40 bg-surface shadow-sm">
        <header className="flex items-center gap-2 border-b border-border bg-success/10 px-4 py-2.5">
          <CheckCircle2 className="h-4 w-4 text-success" />
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
            3D tours - full coverage
          </h3>
        </header>
        <p className="px-4 py-3 text-xs text-muted-foreground">
          Every active listing on this dealer has a 3D walkthrough. Great candidate for a case study.
        </p>
      </section>
    );
  }

  const missing = t.total - t.with3d;
  const primary = contacts[0];
  const subject = encodeURIComponent(`Add 3D tours to ${missing} of your ${company.name} listings`);
  const body = encodeURIComponent(
    `Hi ${primary?.firstName ?? "there"},\n\n` +
    `Noticed ${missing} of your ${t.total} active listings don't have a YachtWay Studio 3D tour yet. ` +
    `Listings with a 3D walkthrough see roughly 3x the qualified inquiries and stay live for 40% less time.\n\n` +
    `Happy to line up a Studio session on your top ${missing === 1 ? "vessel" : `${missing} vessels`} this month - want me to grab a slot?\n\n` +
    `Thanks,\n${repName}`,
  );
  const mailto = primary?.email ? `mailto:${primary.email}?subject=${subject}&body=${body}` : null;

  return (
    <section className="overflow-hidden rounded-sm border border-brand/40 bg-surface shadow-sm">
      <header className="flex items-center gap-2 border-b border-border bg-brand/10 px-4 py-2.5">
        <Video className="h-4 w-4 text-brand" />
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
          Studio 3D tour - upsell
        </h3>
      </header>
      <div className="space-y-3 px-4 py-3 text-xs">
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground tabular-nums">{missing}</span> of {t.total} active listings
          have no 3D tour. Pitching a Studio session on those vessels is a clear win.
        </p>
        <ul className="space-y-1 text-muted-foreground">
          <li>· 3x qualified inquiries on average vs. photos-only listings</li>
          <li>· Buyers self-qualify before requesting a viewing</li>
          <li>· Revenue: Studio session + longer SaaS retention</li>
        </ul>
        <div className="flex flex-wrap gap-2 pt-1">
          {mailto ? (
            <a
              href={mailto}
              className="inline-flex items-center gap-1 rounded-sm bg-brand px-3 py-1.5 text-[12px] font-semibold text-brand-foreground shadow-sm transition-colors hover:bg-brand-deep"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Pitch Studio to {primary!.firstName}
            </a>
          ) : (
            <span className="italic text-muted-foreground">Add a contact to send a pitch email.</span>
          )}
          <Link
            to="/opportunities"
            className="rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-brand hover:bg-accent/40"
          >
            Log opportunity
          </Link>
        </div>
      </div>
    </section>
  );
}


// ==========================================================
// LIVE upsell card - dealer not yet using YachtWay LIVE
// ==========================================================
function LiveUpsellCard({
  company, contacts, repName,
}: {
  company: ReturnType<typeof getCompany> & object;
  contacts: ReturnType<typeof contactsForCompany>;
  repName: string;
}) {
  const usingLive = company.servicesUsed.live;

  if (usingLive) {
    return (
      <section className="overflow-hidden rounded-sm border border-success/40 bg-surface shadow-sm">
        <header className="flex items-center gap-2 border-b border-border bg-success/10 px-4 py-2.5">
          <Radio className="h-4 w-4 text-success" />
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
            YachtWay LIVE - active
          </h3>
        </header>
        <p className="px-4 py-3 text-xs text-muted-foreground">
          This dealer runs live virtual walkthroughs. Great candidate for a customer spotlight or upsell to expanded sessions.
        </p>
      </section>
    );
  }

  const primary = contacts[0];
  const subject = encodeURIComponent(`YachtWay LIVE for ${company.name}`);
  const body = encodeURIComponent(
    `Hi ${primary?.firstName ?? "there"},\n\n` +
    `Wanted to introduce YachtWay LIVE - a livestreamed virtual walkthrough that lets remote buyers tour a vessel in real time with your broker guiding the camera.\n\n` +
    `Dealers using LIVE close roughly 25% more out-of-state buyers and cut travel-for-viewing costs almost entirely. Sessions run 20-30 minutes and we handle the tech.\n\n` +
    `Would love to set up a demo on one of your current listings - want me to grab a slot this week?\n\n` +
    `Thanks,\n${repName}`,
  );
  const mailto = primary?.email ? `mailto:${primary.email}?subject=${subject}&body=${body}` : null;

  return (
    <section className="overflow-hidden rounded-sm border border-brand/40 bg-surface shadow-sm">
      <header className="flex items-center gap-2 border-b border-border bg-brand/10 px-4 py-2.5">
        <Radio className="h-4 w-4 text-brand" />
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
          YachtWay LIVE - upsell
        </h3>
      </header>
      <div className="space-y-3 px-4 py-3 text-xs">
        <p className="text-muted-foreground">
          This dealer has <span className="font-semibold text-foreground">not activated LIVE</span> yet.
          Livestreamed walkthroughs are a fast pitch for remote-buyer conversions.
        </p>
        <ul className="space-y-1 text-muted-foreground">
          <li>. ~25% higher close rate on out-of-state buyers</li>
          <li>. Buyer + broker on a guided video call, no travel</li>
          <li>. Revenue: per-session fee + tighter SaaS renewal story</li>
        </ul>
        <div className="flex flex-wrap gap-2 pt-1">
          {mailto ? (
            <a
              href={mailto}
              className="inline-flex items-center gap-1 rounded-sm bg-brand px-3 py-1.5 text-[12px] font-semibold text-brand-foreground shadow-sm transition-colors hover:bg-brand-deep"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Pitch LIVE to {primary!.firstName}
            </a>
          ) : (
            <span className="italic text-muted-foreground">Add a contact to send a pitch email.</span>
          )}
          <Link
            to="/opportunities"
            className="rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-brand hover:bg-accent/40"
          >
            Log opportunity
          </Link>
        </div>
      </div>
    </section>
  );
}

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function AccountManagerPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const assignable = DEMO_USER_LIST.filter(
    (u) => u.role === "sales_rep" || u.role === "admin",
  );
  const current = value ? DEMO_USER_LIST.find((u) => u.id === value) ?? null : null;

  return (
    <Select
      value={value ?? "__none"}
      onValueChange={(v) => onChange(v === "__none" ? null : v)}
    >
      <SelectTrigger
        className="h-8 w-auto gap-2 rounded-md border-input bg-background px-3 text-left text-xs font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
        aria-label="Reassign owner"
      >
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[9px] font-semibold text-brand-deep">
            {current ? initialsOf(current.name) : <UserCog className="h-3 w-3 text-muted-foreground" />}
          </div>
          <span className="text-muted-foreground">Owner:</span>
          <span className="truncate text-foreground">
            {current ? current.name : "Unassigned"}
          </span>
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none">Unassigned</SelectItem>
        {assignable.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            <div className="flex flex-col">
              <span>{u.name}</span>
              <span className="text-[10px] text-muted-foreground">
                {ROLE_LABELS[u.role]} · {u.region}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StudioHistorySection({ companyId }: { companyId: string }) {
  const { format: fmtMoney } = useMoney();
  const items = OPPORTUNITIES
    .filter((o) => o.companyId === companyId && o.pipeline === "Studio")
    .sort((a, b) => (b.closeDate ?? "").localeCompare(a.closeDate ?? ""));

  return (
    <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
      <header className="flex items-center justify-between border-b border-border bg-secondary/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Video className="h-4 w-4 text-brand" />
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
            Studio history
          </h3>
        </div>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {items.length} {items.length === 1 ? "engagement" : "engagements"}
        </span>
      </header>
      {items.length === 0 ? (
        <div className="p-6 text-center text-[13px] text-muted-foreground">
          No Studio services on file for this account yet.
        </div>
      ) : (
        <table className="w-full text-[12px]">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Opportunity</th>
              <th className="px-3 py-2 text-left font-medium">Stage</th>
              <th className="px-3 py-2 text-left font-medium">Owner</th>
              <th className="px-3 py-2 text-left font-medium">Close date</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((o) => (
              <tr key={o.id} className="hover:bg-secondary/30">
                <td className="px-3 py-2">
                  <Link
                    to="/opportunities/$id"
                    params={{ id: o.id }}
                    className="font-medium text-brand hover:underline"
                  >
                    {o.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-foreground">{o.stage}</td>
                <td className="px-3 py-2 text-muted-foreground">{o.owner ?? "-"}</td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">{o.closeDate ?? "-"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                  {o.amountUsd != null ? fmtMoney(o.amountUsd) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

const STATUS_STYLES: Record<BillingDoc["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-50 text-blue-700 border border-blue-200",
  paid: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  overdue: "bg-rose-50 text-rose-700 border border-rose-200",
  accepted: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  declined: "bg-rose-50 text-rose-700 border border-rose-200",
};

function CompanyInvoicesSection({ companyId }: { companyId: string }) {
  const { format: fmtMoney } = useMoney();
  const docs = useBillingStore();
  const items = docs
    .filter((d) => d.companyId === companyId && d.kind === "invoice")
    .sort((a, b) => b.issued_at.localeCompare(a.issued_at));

  return (
    <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
      <header className="flex items-center justify-between border-b border-border bg-secondary/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-brand" />
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
            Invoices
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {items.length} {items.length === 1 ? "invoice" : "invoices"}
          </span>
          <Button size="sm" asChild className="h-7 px-2.5 text-[11px]">
            <Link to="/billing/invoices/new" search={{ companyId, opportunityId: undefined }}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              New invoice
            </Link>
          </Button>
        </div>
      </header>
      {items.length === 0 ? (
        <div className="p-6 text-center text-[13px] text-muted-foreground">
          No invoices issued to this account yet.
        </div>
      ) : (
        <table className="w-full text-[12px]">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Number</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Issued</th>
              <th className="px-3 py-2 text-left font-medium">Due</th>
              <th className="px-3 py-2 text-left font-medium">Owner</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((d) => {
              const total = docTotal(d);
              const symbol = CURRENCY_SYMBOL[d.currency] ?? "";
              return (
                <tr key={d.id} className="hover:bg-secondary/30">
                  <td className="px-3 py-2">
                    <Link
                      to="/billing/invoices"
                      className="font-medium text-brand hover:underline"
                    >
                      {d.number}
                    </Link>
                  </td>

                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-medium capitalize ${STATUS_STYLES[d.status]}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {d.issued_at.slice(0, 10)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {d.due_at ? d.due_at.slice(0, 10) : "-"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{d.created_by_name}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">
                    {symbol}{total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

