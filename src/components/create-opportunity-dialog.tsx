import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { OPPORTUNITIES, type Opportunity } from "@/lib/mock-data";
import { useAuth, type Role } from "@/lib/auth";

export type PipelineName = Opportunity["pipeline"];

export const PIPELINE_STAGES: Record<PipelineName, string[]> = {
  "SaaS Sales": ["Qualification", "Discovery", "Proposal Sent", "Negotiation", "Closed Won"],
  "Dealer Signups": ["Discovery", "Demo", "Proposal Sent", "Contract", "Onboarded"],
  "EasyFund": ["Prequalified", "Docs Collected", "Underwriting", "Approved", "Funded"],
  "MasterCover": ["New Opportunity", "Quote Sent", "Bound", "Active"],
  "Studio": ["New Opportunity", "Shoot Scheduled", "In Production", "Delivered", "Completed"],
  "EasyClose": ["New Opportunity", "Docs Prep", "In Escrow", "Closed"],
  "Referral Partners": ["Intro", "Discovery", "Contract", "Active"],
};

export const ROLE_PIPELINES: Record<Role, PipelineName[]> = {
  sales_rep: ["SaaS Sales", "Dealer Signups", "Studio", "Referral Partners"],
  fintech: ["EasyFund", "MasterCover", "EasyClose"],
  marketing: ["Studio"],
  admin: [
    "SaaS Sales", "Dealer Signups", "EasyFund", "MasterCover",
    "Studio", "EasyClose", "Referral Partners",
  ],
};

export type CreateOpportunityDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Restrict which pipelines are selectable. Defaults to the user's role pipelines. */
  pipelines?: PipelineName[];
  presetCompanyId?: string | null;
  presetContactId?: string | null;
  presetListingId?: string | null;
  defaultName?: string;
  onCreated?: (opp: Opportunity) => void;
};

export function CreateOpportunityDialog({
  open, onOpenChange, pipelines, presetCompanyId, presetContactId,
  presetListingId, defaultName, onCreated,
}: CreateOpportunityDialogProps) {
  const { user } = useAuth();
  const available = pipelines ?? ROLE_PIPELINES[user.role];

  const [pipeline, setPipeline] = useState<PipelineName | "">("");
  const [stage, setStage] = useState("");
  const [name, setName] = useState(defaultName ?? "");
  const [amount, setAmount] = useState("");
  const [closeDate, setCloseDate] = useState("");

  useEffect(() => {
    if (open) {
      setPipeline("");
      setStage("");
      setName(defaultName ?? "");
      setAmount("");
      setCloseDate("");
    }
  }, [open, defaultName]);

  const stages = pipeline ? PIPELINE_STAGES[pipeline] ?? [] : [];

  function formatCurrencyInput(value: string) {
    // Strip everything except digits and a single decimal point.
    const cleaned = value
      .replace(/[^0-9.]/g, "")
      .replace(/\.(?=.*\.)/g, "");
    const [whole, decimal] = cleaned.split(".");
    const formattedWhole = whole ? Number(whole).toLocaleString("en-US") : "";
    return decimal !== undefined ? `${formattedWhole}.${decimal.slice(0, 2)}` : formattedWhole;
  }

  function parseCurrencyInput(value: string) {
    return Number(value.replace(/,/g, "")) || 0;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pipeline || !stage || !name.trim()) return;
    const today = new Date().toISOString().slice(0, 10);
    const newOpp: Opportunity = {
      id: `opp_${Date.now().toString(36)}`,
      name: name.trim(),
      pipeline,
      stage,
      amountUsd: parseCurrencyInput(amount),
      closeDate: closeDate || today,
      owner: user.name ?? "Me",
      companyId: presetCompanyId ?? null,
      contactId: presetContactId ?? null,
      listingId: presetListingId ?? null,
      probability: 10,
      stageEnteredAt: today,
      lostReason: null,
      closeReason: "",
    };
    // Push into the shared mock store so the Opportunities page picks it up.
    OPPORTUNITIES.unshift(newOpp);
    onCreated?.(newOpp);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={submit}>
          <DialogHeader className="space-y-1.5">
            <DialogTitle className="text-2xl font-semibold tracking-tight text-brand-deep">
              New opportunity
            </DialogTitle>
            <DialogDescription className="text-base text-muted-foreground">
              Create a new opportunity and place it in the right pipeline stage.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 py-6">
            <div className="grid gap-2">
              <Label htmlFor="opp-name" className="text-sm font-medium">Opportunity name</Label>
              <Input
                id="opp-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Acme 50-seat rollout"
                className="h-11 text-base"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="opp-pipeline" className="text-sm font-medium">Pipeline</Label>
                <Select
                  value={pipeline}
                  onValueChange={(value) => {
                    setPipeline(value as PipelineName);
                    setStage("");
                  }}
                >
                  <SelectTrigger id="opp-pipeline" className="h-11 text-base">
                    <SelectValue placeholder="Select pipeline" />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="opp-stage" className="text-sm font-medium">Stage</Label>
                <Select value={stage} onValueChange={setStage} disabled={!pipeline}>
                  <SelectTrigger id="opp-stage" className="h-11 text-base">
                    <SelectValue placeholder={pipeline ? "Select stage" : "Choose pipeline first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="opp-amount" className="text-sm font-medium">Opportunity amount (USD)</Label>
                <Input
                  id="opp-amount"
                  value={amount}
                  onChange={(e) => setAmount(formatCurrencyInput(e.target.value))}
                  placeholder="0"
                  inputMode="decimal"
                  className="h-11 text-base"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="opp-close" className="text-sm font-medium">Close date</Label>
                <Input
                  id="opp-close"
                  type="date"
                  value={closeDate}
                  onChange={(e) => setCloseDate(e.target.value)}
                  className="h-11 text-base"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={!pipeline || !stage || !name.trim()}>
              Create opportunity
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
