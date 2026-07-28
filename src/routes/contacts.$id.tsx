import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronRight, GitMerge, Lock, MessageSquarePlus, MoreHorizontal, Pencil, Plus, Info, MessageSquare, Landmark, Mail } from "lucide-react";
import { BoatIcon } from "@/components/icons/boat-icon";

import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { DetailSections } from "@/components/field-renderer";

import { ActivityPanel } from "@/components/activity-panel";
import { ContactAvatar } from "@/components/contact-avatar";
import { BrokerAnalyticsPanel } from "@/components/broker-analytics-panel";
import { ServicesAdoptionCard } from "@/components/services-adoption-card";
import { LogCommsDialog } from "@/components/log-comms-dialog";
import { CreateOpportunityDialog } from "@/components/create-opportunity-dialog";
import { EditContactDialog } from "@/components/edit-contact-dialog";
import { MergeRecordDialog } from "@/components/merge-record-dialog";
import { SectionTabs } from "@/components/section-tabs";
import { ContactEmailsPanel } from "@/components/email-builder/contact-emails-panel";
import { emailsForContact } from "@/lib/email-recipients";
import { CONTACT_SECTIONS, LOAN_APPLICATION_FIELDS } from "@/lib/field-schema";
import { getContact, getCompany, getLoanApplication, listingsForBroker, getBrand, updateContact } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth, useMoney, canSeeFinTech } from "@/lib/auth";
import { LockedRecord } from "@/components/locked-record";


export const Route = createFileRoute("/contacts/$id")({
  loader: ({ params }) => {
    const contact = getContact(params.id);
    if (!contact) throw notFound();
    return { contact };
  },
  component: ContactDetail,
  notFoundComponent: () => (
    <AppShell>
      <PageBody>
        <div className="rounded-sm border border-border bg-surface p-8 text-center">
          <h2 className="text-lg font-semibold">Contact not found</h2>
          <Link to="/contacts" className="mt-2 inline-block text-sm text-brand hover:underline">
            Back to contacts
          </Link>
        </div>
      </PageBody>
    </AppShell>
  ),
});

function ContactDetail() {
  const { contact: loaded } = Route.useLoaderData();
  const { user, can } = useAuth();
  const { format: fmtMoney } = useMoney();
  const [contact, setContact] = useState(loaded);
  if (contact.vertical === "FinTech" && !canSeeFinTech(user.role)) {
    return <LockedRecord kind="contact" backTo="/contacts" backLabel="Back to contacts" />;
  }
  const [logOpen, setLogOpen] = useState(false);
  const [oppOpen, setOppOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("overview");

  const navigate = useNavigate({ from: "/contacts/$id" });
  const company = contact.companyId ? getCompany(contact.companyId) : null;
  const loan = getLoanApplication(contact.loanApplicationId);
  const brokerListings = contact.contactType === "Broker" ? listingsForBroker(contact.id) : [];
  const receivedEmails = emailsForContact(contact.id);
  const contactName = `${contact.firstName} ${contact.lastName}`;

  const handleSave = (values: Partial<typeof contact>) => {
    updateContact(contact.id, values);
    setContact({ ...contact, ...values });
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-1">
            <Link to="/companies" className="hover:underline">Companies</Link>
            <ChevronRight className="h-3 w-3" />
            {company ? (
              <>
                <Link to="/companies/$id" params={{ id: company.id }} className="hover:underline">
                  {company.name}
                </Link>
                <ChevronRight className="h-3 w-3" />
              </>
            ) : (
              <span className="text-muted-foreground">Company</span>
            )}
            <span>{contact.firstName} {contact.lastName}</span>
          </span>
        }
        media={<ContactAvatar contact={contact} size="lg" />}
        title={contactName}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{contact.vertical}</Badge>
            <Badge variant="outline">{contact.contactType}</Badge>
            <span>·</span>
            <span>{contact.email}</span>
            {company && (
              <>
                <span>·</span>
                <Link to="/companies/$id" params={{ id: company.id }} className="text-brand hover:underline">
                  {company.name}
                </Link>
              </>
            )}
          </span>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit
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
      <CreateOpportunityDialog
        open={oppOpen}
        onOpenChange={setOppOpen}
        presetCompanyId={contact.companyId ?? null}
        presetContactId={contact.id}
        defaultName={`${contactName} - `}
      />
      <LogCommsDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        relatedType="contact"
        relatedId={contact.id}
        defaultContactName={contactName}
      />
      <MergeRecordDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        kind="contact"
        currentId={contact.id}
        onMerged={(survivorId) => {
          if (survivorId !== contact.id) navigate({ to: "/contacts/$id", params: { id: survivorId } });
        }}
      />
      <EditContactDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        contact={contact}
        onSave={handleSave}
      />
      <SectionTabs
        active={activeTab}
        onChange={setActiveTab}
        items={[
          { id: "overview", label: "Overview", icon: Info },
          { id: "activity", label: "Activity", icon: MessageSquare },
          { id: "emails", label: `Emails (${receivedEmails.length})`, icon: Mail },
          ...(brokerListings.length > 0
            ? [{ id: "listings", label: `Listings (${brokerListings.length})`, icon: BoatIcon }]
            : []),
          ...(loan && canSeeFinTech(user.role)
            ? [{ id: "easyfund", label: "EasyFund", icon: Landmark }]
            : []),

        ]}
      />
      <PageBody>
        {activeTab === "overview" && (
          <div className="space-y-4">
            {company && (
              <div>
                <ServicesAdoptionCard company={company} />
              </div>
            )}
            <DetailSections
              sections={CONTACT_SECTIONS}
              record={contact as unknown as Record<string, unknown>}
              exclude={["listings performance"]}
            />

          </div>
        )}

        {activeTab === "activity" && (
          <ActivityPanel type="contact" id={contact.id} />
        )}

        {activeTab === "emails" && <ContactEmailsPanel contactId={contact.id} />}

        {activeTab === "listings" && brokerListings.length > 0 && (
          <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
            <header className="border-b border-border bg-secondary/60 px-4 py-2.5">
              <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
                Listing performance ({brokerListings.length})
              </h3>
            </header>
            {contact.contactType === "Broker" && (
              <BrokerAnalyticsPanel contact={contact} listingCount={brokerListings.length} embedded />
            )}
            <ul className="divide-y divide-border">
              {brokerListings.map((l) => {
                const brand = getBrand(l.brandId);
                return (
                  <li key={l.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <BoatIcon className="h-4 w-4 shrink-0 text-brand" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {brand?.name} {l.model} · {l.year}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {l.lengthFt}ft · {fmtMoney(l.priceUsd, company?.currency)}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{l.status}</Badge>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {activeTab === "easyfund" && loan && canSeeFinTech(user.role) && (
          <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
            <header className="flex items-center justify-between border-b border-border bg-secondary/60 px-4 py-2.5">
              <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
                EasyFund Application
              </h3>
              <Badge variant="outline" className="border-warning/40 bg-sensitive text-[10px] uppercase tracking-wider text-sensitive-foreground">
                Sensitive · easyfund
              </Badge>
            </header>
            {can("easyfund") ? (
              <div className="flex flex-col px-4 py-1">
                {LOAN_APPLICATION_FIELDS.map((f) => {
                  const raw = (loan as unknown as Record<string, unknown>)[f.key];
                  const display =
                    raw === null || raw === undefined || raw === "" ? "-" :
                    f.type === "money" ? fmtMoney(Number(raw), company?.currency) :
                    f.type === "checkbox" ? (raw ? "Yes" : "No") :
                    String(raw);
                  return (
                    <div key={f.key} className="flex flex-col gap-0.5 border-b border-border/60 py-2 last:border-b-0">
                      <div className="text-[11px] font-medium text-muted-foreground" title={f.key}>{f.label}</div>
                      <div className="text-[13px] text-foreground">{display}</div>
                    </div>
                  );
                })}
                {loan.bankCompanyId && (
                  <div className="border-t border-border pt-3 text-xs">
                    <span className="text-muted-foreground">Assigned lender: </span>
                    <Link
                      to="/companies/$id" params={{ id: loan.bankCompanyId }}
                      className="font-medium text-brand hover:underline"
                    >
                      {getCompany(loan.bankCompanyId)?.name}
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-6 text-sm text-muted-foreground">
                <Lock className="h-4 w-4" />
                <div>
                  <div className="font-medium text-foreground">Restricted section</div>
                  <div className="text-xs">
                    Your role does not have the <code className="rounded bg-muted px-1 py-0.5">easyfund</code> grant.
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </PageBody>

    </AppShell>
  );
}
