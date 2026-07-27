import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/currency-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { updateOpportunity, type Opportunity } from "@/lib/mock-data";
import { PIPELINE_STAGES, type PipelineName } from "@/components/create-opportunity-dialog";

const LOST_REASONS = [
  "Price", "Timing", "Competitor", "No decision", "Lost contact", "Other",
] as const;

export type EditOpportunityDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity: Opportunity;
  onSaved?: (opp: Opportunity) => void;
};

export function EditOpportunityDialog({
  open, onOpenChange, opportunity, onSaved,
}: EditOpportunityDialogProps) {
  const [name, setName] = useState(opportunity.name);
  const [pipeline, setPipeline] = useState<PipelineName>(opportunity.pipeline);
  const [stage, setStage] = useState(opportunity.stage);
  const [amount, setAmount] = useState(String(opportunity.amountUsd ?? 0));
  const [probability, setProbability] = useState(String(opportunity.probability ?? 0));
  const [closeDate, setCloseDate] = useState(opportunity.closeDate ?? "");
  const [owner, setOwner] = useState(opportunity.owner ?? "");
  const [lostReason, setLostReason] = useState<string>(opportunity.lostReason ?? "");
  const [closeNotes, setCloseNotes] = useState(opportunity.closeReason ?? "");

  useEffect(() => {
    if (!open) return;
    setName(opportunity.name);
    setPipeline(opportunity.pipeline);
    setStage(opportunity.stage);
    setAmount(String(opportunity.amountUsd ?? 0));
    setProbability(String(opportunity.probability ?? 0));
    setCloseDate(opportunity.closeDate ?? "");
    setOwner(opportunity.owner ?? "");
    setLostReason(opportunity.lostReason ?? "");
    setCloseNotes(opportunity.closeReason ?? "");
  }, [open, opportunity]);

  const stages = PIPELINE_STAGES[pipeline] ?? [];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !stage) return;
    const updated = updateOpportunity(opportunity.id, {
      name: name.trim(),
      pipeline,
      stage,
      amountUsd: Number(amount) || 0,
      probability: Math.max(0, Math.min(100, Number(probability) || 0)),
      closeDate: closeDate,
      owner: owner.trim() || opportunity.owner,
      lostReason: (lostReason || null) as Opportunity["lostReason"],
      closeReason: closeNotes,
    });
    if (updated) onSaved?.(updated);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={submit}>
          <DialogHeader className="space-y-1.5">
            <DialogTitle className="text-2xl font-semibold tracking-tight text-brand-deep">
              Edit opportunity
            </DialogTitle>
            <DialogDescription className="text-base text-muted-foreground">
              Update stage, amount, forecast, or ownership.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 py-6">
            <div className="grid gap-2">
              <Label htmlFor="opp-edit-name" className="text-sm font-medium">Name</Label>
              <Input id="opp-edit-name" value={name} onChange={(e) => setName(e.target.value)} className="h-11 text-base" autoFocus />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label className="text-sm font-medium">Pipeline</Label>
                <Select
                  value={pipeline}
                  onValueChange={(v) => {
                    const p = v as PipelineName;
                    setPipeline(p);
                    if (!PIPELINE_STAGES[p]?.includes(stage)) setStage("");
                  }}
                >
                  <SelectTrigger className="h-11 text-base"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(PIPELINE_STAGES).map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label className="text-sm font-medium">Stage</Label>
                <Select value={stage} onValueChange={setStage}>
                  <SelectTrigger className="h-11 text-base"><SelectValue placeholder="Select stage" /></SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="opp-edit-amount" className="text-sm font-medium">Amount (USD)</Label>
                <CurrencyInput id="opp-edit-amount" value={Number(amount) || 0}
                  onChange={(n) => setAmount(String(n))}
                  className="h-11 text-base" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="opp-edit-prob" className="text-sm font-medium">Probability (%)</Label>
                <Input id="opp-edit-prob" inputMode="numeric" value={probability}
                  onChange={(e) => setProbability(e.target.value.replace(/[^0-9]/g, ""))}
                  className="h-11 text-base" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="opp-edit-close" className="text-sm font-medium">Close date</Label>
                <Input id="opp-edit-close" type="date" value={closeDate}
                  onChange={(e) => setCloseDate(e.target.value)} className="h-11 text-base" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="opp-edit-owner" className="text-sm font-medium">Owner</Label>
                <Input id="opp-edit-owner" value={owner}
                  onChange={(e) => setOwner(e.target.value)} className="h-11 text-base" />
              </div>
              <div className="grid gap-2">
                <Label className="text-sm font-medium">Lost reason</Label>
                <Select value={lostReason || "__none"} onValueChange={(v) => setLostReason(v === "__none" ? "" : v)}>
                  <SelectTrigger className="h-11 text-base"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">- None -</SelectItem>
                    {LOST_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="opp-edit-notes" className="text-sm font-medium">Close notes</Label>
              <Textarea id="opp-edit-notes" value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={!name.trim() || !stage}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
