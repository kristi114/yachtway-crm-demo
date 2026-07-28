import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Info } from "lucide-react";

import { guarded } from "@/components/require-access";
import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { CONTACTS, getCompany, type Contact } from "@/lib/mock-data";

export const Route = createFileRoute("/buyers")({
  head: () => ({ meta: [{ title: "Buyers - YachtWay CRM" }] }),
  component: guarded("contact.general", "Buyers", BuyersPage),
});

/** Buyers = general buyers + loan applicants. */
function isBuyer(c: Contact): boolean {
  return c.contactType === "Buyer" || c.contactType === "Loan Applicant";
}

function num(v: unknown): string {
  return typeof v === "number" ? v.toLocaleString() : "—";
}

function BuyersPage() {
  const [q, setQ] = useState("");
  const buyers = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return CONTACTS.filter(isBuyer)
      .filter((c) => {
        if (!needle) return true;
        const name = `${c.firstName} ${c.lastName}`.toLowerCase();
        return name.includes(needle) || (c.email ?? "").toLowerCase().includes(needle);
      })
      .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
  }, [q]);

  return (
    <AppShell>
      <PageHeader
        title="Buyers"
        subtitle={<span>{buyers.length} buyers · general buyers and applicants</span>}
      />
      <PageBody>
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-secondary/40 px-4 py-2.5 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          Marketing view — financing details (loan amounts, credit, income, payments) are hidden here.
          Open a contact from EasyFund for the full financial record.
        </div>

        <div className="mb-4 relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search buyers…" className="pl-8" />
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Lifecycle</TableHead>
                <TableHead className="text-right">Intent score</TableHead>
                <TableHead className="text-right">Listing views</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {buyers.map((c) => {
                const company = c.companyId ? getCompany(c.companyId) : null;
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link to="/contacts/$id" params={{ id: c.id }} className="font-medium text-brand hover:underline">
                        {c.firstName} {c.lastName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{c.contactType}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{company?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm">{c.email || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.lifecycleStage}</TableCell>
                    <TableCell className="text-right text-sm">{num((c as Record<string, unknown>).buyerIntentScore)}</TableCell>
                    <TableCell className="text-right text-sm">{num((c as Record<string, unknown>).listingViewsToDate)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </PageBody>
    </AppShell>
  );
}
