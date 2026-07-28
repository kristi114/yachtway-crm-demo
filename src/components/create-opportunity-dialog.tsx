import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { OPPORTUNITIES, type Opportunity } from "@/lib/mock-data";
import { useAuth, type Role } from "@/lib/auth";

export type PipelineName = Opportunity["pipeline"];

// Stages for the four product pipelines that match the Field Catalog "Picklist
// Options" reference (rows 60-73, GHL-live) come verbatim from that sheet, in
// order. SaaS Sales / Dealer Signups / Referral Partners have no catalog
// counterpart, so they keep their existing stages.
export const PIPELINE_STAGES: Record<PipelineName, string[]> = {
  "SaaS Sales": ["Qualification", "Discovery", "Proposal Sent", "Negotiation", "Closed Won"],
  "Dealer Signups": ["Discovery", "Demo", "Proposal Sent", "Contract", "Onboarded"],
  // EasyFund (catalog-derived, YachtWay-adjusted stage order)
  "EasyFund": [
    "Pre-Qual Complete", "Still Shopping", "Partial Application", "Application Complete",
    "Underwriting", "Approved", "Loan Closed", "Closed",
  ],
  // MasterCover (catalog-derived, YachtWay-adjusted stage order)
  "MasterCover": ["New Lead", "Contacted", "Still Shopping", "Application Complete", "Quote Sent", "Bound", "Closed"],
  // Studio (catalog-derived, YachtWay-adjusted stage order)
  "Studio": ["Service Requested", "Studio Booked", "Shoot Complete", "In Production", "Content Delivered", "Closed"],
  // Catalog · EasyClose
  "EasyClose": ["Service Requested", "Deliverables In Progress", "Delivered", "Closed"],
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
  // External partners can't create CRM opportunities — scoped to their product only.
  lender_partner: ["EasyFund"],
  insurance_partner: ["MasterCover"],
};

// A red asterisk marking a required field, per the Field Catalog.
function RequiredMark() {
  return <span className="text-destructive" aria-hidden="true"> *</span>;
}

/**
 * Extra required fields that only apply to specific pipelines, taken from the
 * Field Catalog's Opportunity sheet ("Conditionally required" + "Required
 * conditions"). Opportunity Name and Stage are always-required for every
 * pipeline and are handled directly in the form. The Opportunity Id is a
 * system identifier — auto-generated on create, never entered here.
 */
type ExtraField = { key: string; label: string; control: "text" | "textarea" };

const PIPELINE_REQUIRED_FIELDS: Record<PipelineName, ExtraField[]> = {
  // Catalog: `lender` required "If pipeline=easyfund".
  "EasyFund": [{ key: "lender", label: "Lender", control: "text" }],
  // Catalog: `insurance_company` required "If pipeline=mastercover".
  "MasterCover": [{ key: "insuranceCompany", label: "Insurance company", control: "text" }],
  // Catalog: `access_information` required "If pipeline=studio".
  "Studio": [{ key: "accessInformation", label: "Access information", control: "textarea" }],
  // No pipeline-specific always/pipeline-required fields in the catalog.
  "SaaS Sales": [],
  "Dealer Signups": [],
  "EasyClose": [],
  "Referral Partners": [],
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
  // Values for the pipeline-specific required fields (keyed by ExtraField.key).
  const [extras, setExtras] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setPipeline("");
      setStage("");
      setName(defaultName ?? "");
      setAmount("");
      setCloseDate("");
      setExtras({});
    }
  }, [open, defaultName]);

  const stages = pipeline ? PIPELINE_STAGES[pipeline] ?? [] : [];
  // Required fields that appear only once a pipeline is chosen.
  const requiredExtras = pipeline ? PIPELINE_REQUIRED_FIELDS[pipeline] ?? [] : [];

  // The form is valid only when every required field is filled: the always-
  // required Name + Pipeline + Stage, plus each pipeline-specific required field.
  const missingRequired =
    !name.trim() ||
    !pipeline ||
    !stage ||
    requiredExtras.some((f) => !(extras[f.key] ?? "").trim());

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
    // `!pipeline` is included in missingRequired; repeating it here narrows the
    // type from `PipelineName | ""` to `PipelineName` for the assignment below.
    if (missingRequired || !pipeline) return;
    const today = new Date().toISOString().slice(0, 10);
    // Only carry the required extras that belong to the selected pipeline.
    const extraValues = Object.fromEntries(
      requiredExtras.map((f) => [f.key, (extras[f.key] ?? "").trim()]),
    );
    const newOpp: Opportunity = {
      // Opportunity Id is a system identifier: generated here, never entered by
      // the user. Randomised so concurrent creates can't collide.
      id: `opp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
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
      ...extraValues,
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
              <Label htmlFor="opp-name" className="text-sm font-medium">Opportunity name<RequiredMark /></Label>
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
                <Label htmlFor="opp-pipeline" className="text-sm font-medium">Pipeline<RequiredMark /></Label>
                <Select
                  value={pipeline}
                  onValueChange={(value) => {
                    setPipeline(value as PipelineName);
                    setStage("");
                    // Different pipeline = different required fields; clear old values.
                    setExtras({});
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
                <Label htmlFor="opp-stage" className="text-sm font-medium">Stage<RequiredMark /></Label>
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

            {/* Pipeline-specific required fields (revealed once a pipeline is chosen). */}
            {requiredExtras.map((f) => (
              <div key={f.key} className="grid gap-2">
                <Label htmlFor={`opp-${f.key}`} className="text-sm font-medium">
                  {f.label}
                  <RequiredMark />
                </Label>
                {f.control === "textarea" ? (
                  <Textarea
                    id={`opp-${f.key}`}
                    value={extras[f.key] ?? ""}
                    onChange={(e) => setExtras((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={`Enter ${f.label.toLowerCase()}`}
                    className="min-h-[76px] text-base"
                  />
                ) : (
                  <Input
                    id={`opp-${f.key}`}
                    value={extras[f.key] ?? ""}
                    onChange={(e) => setExtras((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={`Enter ${f.label.toLowerCase()}`}
                    className="h-11 text-base"
                  />
                )}
              </div>
            ))}

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
            <Button type="submit" size="lg" disabled={missingRequired}>
              Create opportunity
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
