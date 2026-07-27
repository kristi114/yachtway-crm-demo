import { useMemo, useState, type FormEvent } from "react";
import { CreditCard, Plus, Trash2, AlertTriangle, User, Calendar } from "lucide-react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/currency-input";
import { useAuth } from "@/lib/auth";
import { CURRENCY_SYMBOL, type CurrencyCode, formatMoney } from "@/lib/currency";
import {
  addCreditEntry, getCreditBalance, getCreditEntries, removeCreditEntry,
  useCreditStore,
} from "@/lib/dealer-credit";

interface Props {
  companyId: string;
  companyName: string;
  currency: CurrencyCode;
}

export function DealerCreditPanel({ companyId, companyName, currency }: Props) {
  useCreditStore(); // re-render on changes
  const { user } = useAuth();
  const [addOpen, setAddOpen] = useState(false);

  const entries = getCreditEntries(companyId);
  const balance = getCreditBalance(companyId);
  const hasCredit = balance !== 0;

  return (
    <section
      className={`overflow-hidden rounded-2xl border shadow-sm ${
        hasCredit
          ? "border-brand/40 bg-brand/5"
          : "border-border bg-surface"
      }`}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-center gap-3">
          <div className={`grid h-9 w-9 place-items-center rounded-chip ${
            hasCredit ? "bg-brand text-brand-foreground" : "bg-secondary text-muted-foreground"
          }`}>
            <CreditCard className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-brand-deep">
              YachtWay credit
            </h3>
            <p className="text-xs text-muted-foreground">
              {hasCredit
                ? `Outstanding credit available to ${companyName}.`
                : "No credit on file. Add one to record why & what it references."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Balance
            </div>
            <div className={`text-2xl font-semibold tabular-nums ${
              hasCredit ? "text-brand-deep" : "text-muted-foreground"
            }`}>
              {formatMoney(balance, currency)}
            </div>
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add credit
          </Button>
        </div>
      </header>

      {entries.length > 0 ? (
        <ul className="divide-y divide-border">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-start gap-4 px-5 py-3">
              <div className="min-w-[110px]">
                <div className={`text-base font-semibold tabular-nums ${
                  e.amount >= 0 ? "text-success" : "text-warning"
                }`}>
                  {e.amount >= 0 ? "+" : ""}{formatMoney(e.amount, e.currency)}
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {new Date(e.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-sm text-foreground">
                  <span className="font-medium text-brand-deep">Reason: </span>
                  {e.reason}
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-brand-deep">Reference: </span>
                  {e.reference}
                </div>
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <User className="h-3 w-3" />
                  Recorded by {e.created_by_name}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (confirm("Remove this credit entry?")) removeCreditEntry(companyId, e.id);
                }}
                className="rounded-chip p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                title="Remove entry"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-5 py-6 text-center text-sm text-muted-foreground">
          No credit entries yet.
        </div>
      )}

      <AddCreditDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        companyId={companyId}
        companyName={companyName}
        currency={currency}
        userId={user.id}
        userName={user.name}
      />
    </section>
  );
}

interface AddProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  companyName: string;
  currency: CurrencyCode;
  userId: string;
  userName: string;
}

function AddCreditDialog({
  open, onOpenChange, companyId, companyName, currency, userId, userName,
}: AddProps) {
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [sign, setSign] = useState<"credit" | "consume">("credit");

  const reasonTrim = reason.trim();
  const referenceTrim = reference.trim();
  const canSubmit =
    amount > 0 && reasonTrim.length >= 10 && referenceTrim.length >= 3;

  const validationHint = useMemo(() => {
    if (amount <= 0) return "Enter an amount greater than 0.";
    if (reasonTrim.length < 10) return "Reason must be at least 10 characters - explain WHY.";
    if (referenceTrim.length < 3) return "Reference must be at least 3 characters - e.g. invoice #, deal id, ticket.";
    return null;
  }, [amount, reasonTrim, referenceTrim]);

  const reset = () => {
    setAmount(0);
    setReason("");
    setReference("");
    setSign("credit");
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    addCreditEntry({
      companyId: companyId,
      amount: sign === "credit" ? amount : -amount,
      currency,
      reason: reasonTrim,
      reference: referenceTrim,
      created_by_user_id: userId,
      created_by_name: userName,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-tight text-brand-deep">
            Record credit for {companyName}
          </DialogTitle>
          <DialogDescription>
            Every credit entry must include a clear reason and a reference so
            others can audit it later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="credit-type">Entry type</Label>
              <div className="flex rounded-chip border border-border bg-background p-0.5">
                {(["credit", "consume"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSign(k)}
                    className={`flex-1 rounded-[10px] px-2.5 py-1.5 text-xs font-medium transition ${
                      sign === k
                        ? "bg-brand text-brand-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {k === "credit" ? "Issue credit" : "Consume / reverse"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="credit-amount">
                Amount ({CURRENCY_SYMBOL[currency]} {currency})
              </Label>
              <CurrencyInput
                id="credit-amount"
                value={amount}
                onChange={setAmount}
                min={0}
                className="h-11"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="credit-reason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="credit-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this credit is being granted (e.g. compensation for Studio session cancelled last-minute)."
              rows={3}
              maxLength={500}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="credit-reference">
              Reference <span className="text-destructive">*</span>
            </Label>
            <Input
              id="credit-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Invoice #INV-2418, Deal OPP-1177, Ticket SUP-903…"
              maxLength={120}
              required
              className="h-11"
            />
          </div>

          {validationHint && (
            <div className="flex items-start gap-2 rounded-chip border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{validationHint}</span>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              Save entry
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
