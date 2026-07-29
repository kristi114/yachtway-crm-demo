import { guarded } from "@/components/require-access";
import { createFileRoute, useNavigate, Link, useParams, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { getOpportunity, getCompany, getContact } from "@/lib/mock-data";
import { addReferral } from "@/lib/referrals";
import { toast } from "sonner";

export const Route = createFileRoute("/referrals/new/$oppId")({
  component: guarded("referrals", "Referrals", NewReferralInvoicesPage),
  notFoundComponent: () => (
    <AppShell>
      <PageBody>
        <div className="p-6 text-sm text-muted-foreground">Opportunity not found.</div>
      </PageBody>
    </AppShell>
  ),
  errorComponent: ({ error }) => (
    <AppShell>
      <PageBody>
        <div className="p-6 text-sm text-destructive">{error.message}</div>
      </PageBody>
    </AppShell>
  ),
});

function NewReferralInvoicesPage() {
  const { oppId } = useParams({ from: "/referrals/new/$oppId" });
  const opp = getOpportunity(oppId);
  const navigate = useNavigate();
  if (!opp) throw notFound();

  const dealer = opp.companyId ? getCompany(opp.companyId) : undefined;
  const applicant = opp.contactId ? getContact(opp.contactId) : undefined;

  // Lender bill
  const [billLender, setBillLender] = useState(true);
  const [lenderName, setLenderName] = useState("Marathon Speciality Finance");
  const [lenderEmail, setLenderEmail] = useState("ap@marathonsf.com");
  const [lenderAmount, setLenderAmount] = useState<string>(
    (opp.amountUsd * 0.0065).toFixed(2),
  );
  const [lenderRef, setLenderRef] = useState("");

  // Dealer payout (or skip). Dealers are paid the referral fee, never billed.
  const [dealerAction, setDealerAction] = useState<"payout" | "none">("payout");
  const [dealerName, setDealerName] = useState(dealer?.name ?? "");
  const [dealerAmount, setDealerAmount] = useState<string>(
    (opp.amountUsd * 0.00125).toFixed(2),
  );
  const [dealerRef, setDealerRef] = useState(lenderName);
  const [notes, setNotes] = useState("");

  const submit = () => {
    let count = 0;
    if (billLender && lenderName && Number(lenderAmount) > 0) {
      addReferral({
        type: "lender_bill",
        opportunity_id: opp.id,
        opportunity_name: opp.name,
        counterparty_name: lenderName,
        counterparty_email: lenderEmail || undefined,
        amount: Number(lenderAmount),
        currency: "USD",
        status: "approved",
        reference: lenderRef,
        notes: notes || undefined,
        created_by_name: opp.owner,
      });
      count++;
    }
    if (dealerAction !== "none" && dealerName && Number(dealerAmount) > 0) {
      addReferral({
        type: "dealer_payout",
        opportunity_id: opp.id,
        opportunity_name: opp.name,
        counterparty_name: dealerName,
        amount: Number(dealerAmount),
        currency: "USD",
        status: "draft",
        reference: dealerRef,
        notes: notes || undefined,
        created_by_name: opp.owner,
      });
      count++;
    }
    if (count === 0) {
      toast.error("Enable at least one record");
      return;
    }
    toast.success(`${count} referral record${count === 1 ? "" : "s"} created`);
    navigate({ to: "/referrals" });
  };

  return (
    <AppShell>
      <PageHeader
        title="Create referral invoices"
        subtitle={
          <span>
            {opp.name} · Applicant:{" "}
            {applicant ? `${applicant.firstName} ${applicant.lastName}` : "-"} ·
            Dealer: {dealer?.name ?? "-"}
          </span>
        }
        actions={
          <Button size="sm" variant="ghost" asChild>
            <Link to="/referrals">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back
            </Link>
          </Button>
        }
      />
      <PageBody>
        <div className="grid gap-4 md:grid-cols-2">
          {/* Lender bill card */}
          <section className="rounded-sm border border-border bg-surface p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Bill the lender</h2>
                <p className="text-[11px] text-muted-foreground">
                  YachtWay invoices the lender for the referral fee.
                </p>
              </div>
              <Switch checked={billLender} onCheckedChange={setBillLender} />
            </div>
            <fieldset disabled={!billLender} className="space-y-3 disabled:opacity-50">
              <div>
                <Label className="text-xs">Lender name</Label>
                <Input
                  value={lenderName}
                  onChange={(e) => setLenderName(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Lender email</Label>
                <Input
                  type="email"
                  value={lenderEmail}
                  onChange={(e) => setLenderEmail(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Amount (USD)</Label>
                  <CurrencyInput
                    value={Number(lenderAmount) || 0}
                    onChange={(n) => setLenderAmount(String(n))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Reference #</Label>
                  <Input
                    value={lenderRef}
                    onChange={(e) => setLenderRef(e.target.value)}
                    placeholder="INV-####"
                  />
                </div>
              </div>
            </fieldset>
          </section>

          {/* Dealer card */}
          <section className="rounded-sm border border-border bg-surface p-4 shadow-sm">
            <div className="mb-3">
              <h2 className="text-sm font-semibold">Dealer payout</h2>
              <p className="text-[11px] text-muted-foreground">
                Record the referral-fee payout owed to the dealer.
              </p>
            </div>
            <div className="mb-3 inline-flex rounded-md border border-border p-0.5 text-[11px]">
              {(["payout", "none"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setDealerAction(v)}
                  className={`rounded px-2.5 py-1 capitalize transition ${
                    dealerAction === v
                      ? "bg-brand text-brand-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {v === "none" ? "Skip" : "Pay dealer"}
                </button>
              ))}
            </div>
            <fieldset
              disabled={dealerAction === "none"}
              className="space-y-3 disabled:opacity-50"
            >
              <div>
                <Label className="text-xs">Dealer name</Label>
                <Input
                  value={dealerName}
                  onChange={(e) => setDealerName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Amount (USD)</Label>
                  <CurrencyInput
                    value={Number(dealerAmount) || 0}
                    onChange={(n) => setDealerAmount(String(n))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Reference</Label>
                  <Input
                    value={dealerRef}
                    onChange={(e) => setDealerRef(e.target.value)}
                    placeholder="Lender or PO #"
                  />
                </div>
              </div>
            </fieldset>
          </section>
        </div>

        <div className="mt-4 rounded-sm border border-border bg-surface p-4 shadow-sm">
          <Label className="text-xs">Notes (internal)</Label>
          <Textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any context for accounting…"
          />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" asChild>
            <Link to="/referrals">Cancel</Link>
          </Button>
          <Button onClick={submit}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            Create records
          </Button>
        </div>
      </PageBody>
    </AppShell>
  );
}
