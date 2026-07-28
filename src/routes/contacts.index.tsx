import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, StickyNote } from "lucide-react";
import { hasNote } from "@/lib/notes";
import { toNoteViewer } from "@/lib/note-access";
import { z } from "zod";

import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { ContactAvatar } from "@/components/contact-avatar";
import { CONTACTS, COMPANIES, type Vertical, type ContactType } from "@/lib/mock-data";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth, canSeeFinTech, isPartnerRole } from "@/lib/auth";
import { allowedContactIdsForPartner } from "@/lib/fintech-dashboards";
import { useApiContactOverlay } from "@/lib/api/overlays";

const searchSchema = z.object({
  vertical: z.enum(["Main", "FinTech"]).optional(),
  type: z.string().optional(),
});

export const Route = createFileRoute("/contacts/")({
  validateSearch: (s) => searchSchema.parse(s),
  component: ContactsList,
});

const MAIN_TABS: { label: string; vertical?: Vertical; type?: string }[] = [
  { label: "All", vertical: "Main" },
  { label: "Brokers", vertical: "Main", type: "Broker" },
  { label: "Dealer contacts", vertical: "Main", type: "Dealer Contact" },
];

const FINTECH_TABS: { label: string; vertical?: Vertical; type?: string }[] = [
  { label: "All FinTech", vertical: "FinTech" },
  { label: "Loan applicants", vertical: "FinTech", type: "Loan Applicant" },
  { label: "Bank contacts", vertical: "FinTech", type: "Bank Contact" },
];

function ContactsList() {
  const { vertical, type } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [q, setQ] = useState("");
  const { user } = useAuth();
  const canFinTech = canSeeFinTech(user.role);
  const inFinTechView = canFinTech && vertical === "FinTech";
  // Base scope: FinTech view only shows FinTech; default (Main) view only shows Main.
  const baseVertical: Vertical = inFinTechView ? "FinTech" : "Main";

  const visibleTabs = inFinTechView ? FINTECH_TABS : MAIN_TABS;

  const { byId: apiContactsById } = useApiContactOverlay();

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = CONTACTS.filter((c) => c.vertical === baseVertical);
    // Partner logins only see contacts attached to one of their own deals.
    if (isPartnerRole(user.role)) {
      const allowed = allowedContactIdsForPartner(user.partnerId ?? "");
      list = list.filter((c) => allowed.has(c.id));
    }
    if (type) list = list.filter((c) => c.contactType === (type as ContactType));
    if (needle) {
      list = list.filter((c) =>
        [c.firstName, c.lastName, c.email, c.contactType, c.roleAtDealership]
          .join(" ").toLowerCase().includes(needle),
      );
    }
    return list.map((c) => {
      // API overlay: prefer canonical fields when apps/api has this contact.
      const api = apiContactsById.get(c.id);
      const merged = api
        ? {
            ...c,
            firstName: api.firstName ?? c.firstName,
            lastName: api.lastName ?? c.lastName,
            email: api.email ?? c.email,
            phone: api.phone ?? c.phone,
          }
        : c;
      return {
        ...merged,
        name: merged.companyId
          ? COMPANIES.find((co) => co.id === merged.companyId)?.name ?? "-"
          : "-",
      };
    });
  }, [q, type, baseVertical, apiContactsById, user]);


  const totalVisible = CONTACTS.filter((c) => c.vertical === baseVertical).length;

  return (
    <AppShell>
      <PageHeader
        eyebrow={inFinTechView ? "Fintech · Contacts" : "Contacts"}
        title={inFinTechView ? "FinTech contacts" : "Broker & dealer contacts"}
        subtitle={
          inFinTechView
            ? `${totalVisible} people across loan applicants and bank contacts`
            : `${totalVisible} people in your book (yacht industry)`
        }
      />

      <PageBody>
        <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-border">
          {visibleTabs.map((tab) => {
            const active = (tab.vertical ?? undefined) === vertical && (tab.type ?? undefined) === type;
            return (
              <button
                key={tab.label}
                onClick={() =>
                  navigate({
                    to: "/contacts",
                    search: { vertical: tab.vertical, type: tab.type },
                  })
                }
                className={`border-b-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
                  active
                    ? "border-brand text-brand-deep"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="mb-3 flex items-center gap-2">
          <div className="relative w-72">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, email, type…"
              className="h-8 pl-8"
            />
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            {rows.length} of {totalVisible}
          </div>
        </div>

        <div className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
          <table className="w-full text-[13px]">
            <thead className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Name</th>
                <th className="px-3 py-2 font-semibold">Department</th>
                <th className="px-3 py-2 font-semibold">Type</th>
                <th className="px-3 py-2 font-semibold">Company</th>
                <th className="px-3 py-2 font-semibold">Email</th>
                <th className="px-3 py-2 font-semibold">Lifecycle</th>
                <th className="px-3 py-2 text-right font-semibold">Intent</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-accent/40">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <ContactAvatar contact={c} size="sm" />
                      <Link
                        to="/contacts/$id" params={{ id: c.id }}
                        className="flex items-center gap-1.5 font-medium text-brand hover:underline"
                      >
                        {c.firstName} {c.lastName}
                        {hasNote("contact", c.id, toNoteViewer(user)) && (
                          <StickyNote
                            className="h-3.5 w-3.5 text-amber-500"
                            aria-label="Has notes"
                          />
                        )}
                      </Link>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                  <Badge variant="outline" className="text-[10px] font-normal">
                      {c.vertical}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{c.contactType}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.email}</td>
                  <td className="px-3 py-2">{c.lifecycleStage}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.buyerIntentScore}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    No contacts match your filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PageBody>
    </AppShell>
  );
}
