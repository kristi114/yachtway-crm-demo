import { guarded } from "@/components/require-access";
import { createFileRoute, useNavigate, Link, useParams, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getReferral,
  updateReferral,
  removeReferral,
  useReferralsStore,
  REFERRAL_STATUS_LABEL,
  REFERRAL_TYPE_LABEL,
  type ReferralStatus,
  type ReferralType,
} from "@/lib/referrals";
import { toast } from "sonner";

export const Route = createFileRoute("/referrals/$id/edit")({
  component: guarded("referrals", "Referrals", EditReferralPage),
  notFoundComponent: () => (
    <AppShell>
      <PageBody>
        <div className="p-6 text-sm text-muted-foreground">
          Referral record not found.
        </div>
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

const STATUS_OPTIONS: ReferralStatus[] = [
  "draft",
  "approved",
  "sent",
  "paid",
  "credit",
  "bill",
];
const TYPE_OPTIONS: ReferralType[] = ["lender_bill", "dealer_bill", "dealer_payout"];

function EditReferralPage() {
  useReferralsStore();
  const { id } = useParams({ from: "/referrals/$id/edit" });
  const rec = getReferral(id);
  const navigate = useNavigate();
  if (!rec) throw notFound();

  const [type, setType] = useState<ReferralType>(rec.type);
  const [counterpartyName, setCounterpartyName] = useState(rec.counterparty_name);
  const [counterpartyEmail, setCounterpartyEmail] = useState(rec.counterparty_email ?? "");
  const [amount, setAmount] = useState<string>(String(rec.amount));
  const [status, setStatus] = useState<ReferralStatus>(rec.status);
  const [reference, setReference] = useState(rec.reference);
  const [notes, setNotes] = useState(rec.notes ?? "");

  const save = () => {
    updateReferral(rec.id, {
      type,
      counterparty_name: counterpartyName,
      counterparty_email: counterpartyEmail || undefined,
      amount: Number(amount),
      status,
      reference,
      notes: notes || undefined,
    });
    toast.success("Referral record updated");
    navigate({ to: "/referrals" });
  };

  const remove = () => {
    if (!confirm("Delete this referral record? This also removes the mirrored invoice.")) return;
    removeReferral(rec.id);
    toast.success("Referral record deleted");
    navigate({ to: "/referrals" });
  };

  return (
    <AppShell>
      <PageHeader
        title="Edit referral record"
        subtitle={<span>{rec.opportunity_name}</span>}
        actions={
          <Button size="sm" variant="ghost" asChild>
            <Link to="/referrals">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back
            </Link>
          </Button>
        }
      />
      <PageBody>
        <div className="max-w-2xl space-y-4 rounded-sm border border-border bg-surface p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Record type</Label>
              <Select value={type} onValueChange={(v) => setType(v as ReferralType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>{REFERRAL_TYPE_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ReferralStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{REFERRAL_STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Bill to / pay to</Label>
            <Input
              value={counterpartyName}
              onChange={(e) => setCounterpartyName(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input
              type="email"
              value={counterpartyEmail}
              onChange={(e) => setCounterpartyEmail(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Amount ({rec.currency})</Label>
              <CurrencyInput
                value={Number(amount) || 0}
                onChange={(n) => setAmount(String(n))}
              />
            </div>
            <div>
              <Label className="text-xs">Reference</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" onClick={remove} className="text-destructive hover:text-destructive">
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" asChild>
                <Link to="/referrals">Cancel</Link>
              </Button>
              <Button onClick={save}>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                Save changes
              </Button>
            </div>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Status changes on billable records sync to the mirrored invoice under
          All invoices in Accounting.
        </p>
      </PageBody>
    </AppShell>
  );
}
