import { useMemo, useState, type FormEvent } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/currency-input";
import { CURRENCY_SYMBOL } from "@/lib/currency";
import { DEMO_USER_LIST } from "@/lib/auth";
import {
  DEFAULT_TARGETS, TARGET_METRICS, getTargets, setTargets, repUsers,
  type TargetPeriod, type TargetSet,
} from "@/lib/targets";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialUserId?: string;
  initialPeriod?: TargetPeriod;
}

const PERIODS: { id: TargetPeriod; label: string }[] = [
  { id: "month", label: "Monthly" },
  { id: "quarter", label: "Quarterly" },
  { id: "year", label: "Annual" },
];

export function EditTargetsDialog({ open, onOpenChange, initialUserId, initialPeriod = "month" }: Props) {
  const reps = useMemo(repUsers, []);
  const [userId, setUserId] = useState(initialUserId ?? reps[0]?.id ?? "");
  const [period, setPeriod] = useState<TargetPeriod>(initialPeriod);
  const [values, setValues] = useState<TargetSet>(() =>
    userId ? getTargets(userId, period) : DEFAULT_TARGETS[period],
  );
  const currency = DEMO_USER_LIST.find((u) => u.id === userId)?.currency ?? "USD";
  const currencySymbol = CURRENCY_SYMBOL[currency];

  // Re-sync when key inputs change
  useMemo(() => {
    if (userId) setValues(getTargets(userId, period));
  }, [userId, period]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setTargets(userId, period, values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Set sales targets</DialogTitle>
          <DialogDescription>
            Admin-only. Update the {period === "month" ? "monthly" : period === "quarter" ? "quarterly" : "annual"} goals for a rep at the start of the period.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tgt-user">Sales rep</Label>
              <select
                id="tgt-user"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              >
                {reps.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Period</Label>
              <div className="flex rounded-md border border-input p-0.5">
                {PERIODS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPeriod(p.id)}
                    className={`flex-1 rounded px-2 py-1 text-xs font-medium transition ${
                      period === p.id ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-3">
            {TARGET_METRICS.map((m) => (
              <div key={m.key} className="grid grid-cols-[1fr_auto] items-center gap-3">
                <div>
                  <Label htmlFor={`tgt-${m.key}`} className="text-sm">{m.label}</Label>
                  <p className="text-[11px] text-muted-foreground">{m.hint}</p>
                </div>
                <div className="flex items-center gap-1">
                  {m.unit === "usd" && <span className="text-xs text-muted-foreground">$</span>}
                  {m.unit === "usd" ? (
                    <CurrencyInput
                      id={`tgt-${m.key}`}
                      value={values[m.key]}
                      onChange={(n) => setValues((v) => ({ ...v, [m.key]: n }))}
                      min={0}
                      step={500}
                      className="h-8 w-28 text-right tabular-nums"
                    />
                  ) : (
                    <Input
                      id={`tgt-${m.key}`}
                      type="number"
                      min={0}
                      step={m.unit === "percent" ? 1 : 1}
                      max={m.unit === "percent" ? 100 : undefined}
                      value={values[m.key]}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [m.key]: Number(e.target.value) || 0 }))
                      }
                      className="h-8 w-28 text-right tabular-nums"
                    />
                  )}
                  {m.unit === "percent" && <span className="text-xs text-muted-foreground">%</span>}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="button" variant="outline" onClick={() => setValues(DEFAULT_TARGETS[period])}>
              Reset to defaults
            </Button>
            <Button type="submit">Save targets</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
