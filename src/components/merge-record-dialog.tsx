import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeftRight } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  COMPANIES, CONTACTS, OPPORTUNITIES,
  mergeCompanies, mergeContacts, mergeOpportunities,
} from "@/lib/mock-data";

export type MergeKind = "company" | "contact" | "opportunity";

type Winner = "source" | "target";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: MergeKind;
  /** The record the user is currently viewing - becomes the SURVIVOR by default. */
  currentId: string;
  onMerged?: (survivorId: string) => void;
};

/* ---------- helpers ---------- */

function labelOf(kind: MergeKind, r: Record<string, unknown>): string {
  if (kind === "company") return String(r.name ?? "");
  if (kind === "contact") {
    const first = String(r.firstName ?? "");
    const last = String(r.lastName ?? "");
    return `${first} ${last}`.trim() || String(r.email ?? "");
  }
  return String(r.name ?? "");
}
function subLabel(kind: MergeKind, r: Record<string, unknown>): string {
  if (kind === "company") {
    return [r.companyType, r.billingCity, r.billingCountry].filter(Boolean).join(" · ");
  }
  if (kind === "contact") {
    return [r.email, r.contactType].filter(Boolean).join(" · ");
  }
  return [r.pipeline, r.stage].filter(Boolean).join(" · ");
}

/** Fields to reconcile per kind. Everything else keeps target's value. */
const FIELDS: Record<MergeKind, string[]> = {
  company: [
    "name", "companyType", "status", "website", "phone",
    "billingCity", "billingState", "billingCountry", "currency",
    "yachtwayDbAccountId", "sfAccountId", "yachtwayDealerPage",
    "ownerUserId", "primaryContactId", "dealerTier",
    "lastContactedAt", "lastLogin", "lastStudioSessionAt",
  ],
  contact: [
    "firstName", "lastName", "email", "phone", "contactType",
    "companyId", "lifecycleStage", "leadSource",
    "brokerLicenseNumber", "brokerLicenseState", "roleAtDealership",
    "lastLoginAt",
  ],
  opportunity: [
    "name", "pipeline", "stage", "amountUsd", "closeDate", "owner",
    "companyId", "contactId", "listingId", "probability",
  ],
};

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/* ---------- component ---------- */

export function MergeRecordDialog({ open, onOpenChange, kind, currentId, onMerged }: Props) {
  const pool = useMemo(() => {
    if (kind === "company") return COMPANIES as unknown as Record<string, unknown>[];
    if (kind === "contact") return CONTACTS as unknown as Record<string, unknown>[];
    return OPPORTUNITIES as unknown as Record<string, unknown>[];
  }, [kind]);

  // Step: pick duplicate → reconcile → confirm.
  const [step, setStep] = useState<"pick" | "reconcile" | "confirm">("pick");
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string>(currentId);
  const [query, setQuery] = useState("");
  const [winners, setWinners] = useState<Record<string, Winner>>({});
  const [confirmText, setConfirmText] = useState("");

  const reset = () => {
    setStep("pick"); setSourceId(null); setTargetId(currentId);
    setQuery(""); setWinners({}); setConfirmText("");
  };
  const close = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const current = pool.find((r) => (r as { id: string }).id === currentId);
  const source = pool.find((r) => (r as { id: string }).id === sourceId);
  const target = pool.find((r) => (r as { id: string }).id === targetId);

  const candidates = pool
    .filter((r) => (r as { id: string }).id !== currentId)
    .filter((r) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return labelOf(kind, r).toLowerCase().includes(q) || subLabel(kind, r).toLowerCase().includes(q);
    })
    .slice(0, 30);

  const kindLabel = kind === "company" ? "companies" : kind === "contact" ? "contacts" : "opportunities";
  const singular = kind;

  /* ---------- Step: pick ---------- */
  if (!current) return null;

  const goReconcile = (dupId: string) => {
    // Current record is the SURVIVOR (target) by default; picked duplicate is source.
    setSourceId(dupId);
    setTargetId(currentId);
    // Seed winners: prefer target's value unless target is empty and source has one.
    const seed: Record<string, Winner> = {};
    for (const f of FIELDS[kind]) {
      const t = (current as Record<string, unknown>)[f];
      const s = (pool.find((r) => (r as { id: string }).id === dupId) as Record<string, unknown>)[f];
      const tEmpty = t === null || t === undefined || t === "";
      const sHas = !(s === null || s === undefined || s === "");
      seed[f] = tEmpty && sHas ? "source" : "target";
    }
    setWinners(seed);
    setStep("reconcile");
  };

  const swapSurvivor = () => {
    // Flip which record is target (survivor). Winners semantics stay: "source" = pick source's value.
    if (!sourceId || !targetId) return;
    setSourceId(targetId);
    setTargetId(sourceId);
    // Invert all winners so the user's field-level choices are preserved visually.
    setWinners((w) => {
      const flipped: Record<string, Winner> = {};
      for (const [k, v] of Object.entries(w)) flipped[k] = v === "source" ? "target" : "source";
      return flipped;
    });
  };

  const doMerge = () => {
    if (!source || !target) return;
    const sId = (source as { id: string }).id;
    const tId = (target as { id: string }).id;
    if (kind === "company") mergeCompanies(sId, tId, winners);
    else if (kind === "contact") mergeContacts(sId, tId, winners);
    else mergeOpportunities(sId, tId, winners);
    onMerged?.(tId);
    close(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Merge {singular} - {step === "pick" ? "pick duplicate" : step === "reconcile" ? "choose winning values" : "final confirmation"}
          </DialogTitle>
          <DialogDescription>
            Merging is <span className="font-medium text-foreground">permanent</span>. All related records
            (opportunities, listings, invoices, references) will be re-pointed to the surviving {singular}.
          </DialogDescription>
        </DialogHeader>

        {step === "pick" && (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-secondary/40 p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Keeping (survivor)</div>
              <div className="font-semibold">{labelOf(kind, current)}</div>
              <div className="text-xs text-muted-foreground">{subLabel(kind, current)}</div>
            </div>
            <Input
              placeholder={`Search other ${kindLabel} to merge in…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="max-h-[340px] overflow-y-auto rounded-md border border-border divide-y divide-border">
              {candidates.length === 0 && (
                <div className="p-4 text-sm text-muted-foreground">No matches.</div>
              )}
              {candidates.map((r) => {
                const id = (r as { id: string }).id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => goReconcile(id)}
                    className="w-full text-left px-3 py-2 hover:bg-secondary/60 flex items-center gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{labelOf(kind, r)}</div>
                      <div className="text-xs text-muted-foreground truncate">{subLabel(kind, r)}</div>
                    </div>
                    <Badge variant="outline" className="text-[10px]">Select</Badge>
                  </button>
                );
              })}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => close(false)}>Cancel</Button>
            </DialogFooter>
          </div>
        )}

        {step === "reconcile" && source && target && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border border-border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Losing (deleted)</div>
                  <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">Source</Badge>
                </div>
                <div className="font-semibold truncate">{labelOf(kind, source)}</div>
                <div className="text-xs text-muted-foreground truncate">{subLabel(kind, source)}</div>
              </div>
              <div className="rounded-md border border-brand/40 bg-brand/5 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-wide text-brand-deep">Keeping (survivor)</div>
                  <Badge variant="outline" className="text-[10px] border-brand/40 text-brand-deep">Target</Badge>
                </div>
                <div className="font-semibold truncate">{labelOf(kind, target)}</div>
                <div className="text-xs text-muted-foreground truncate">{subLabel(kind, target)}</div>
              </div>
            </div>
            <div className="flex items-center justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={swapSurvivor}>
                <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" />
                Swap - keep the other one instead
              </Button>
            </div>

            <div className="overflow-hidden rounded-md border border-border">
              <div className="grid grid-cols-[minmax(0,180px)_1fr_1fr] gap-2 border-b border-border bg-secondary/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <div>Field</div><div>Source value</div><div>Target value</div>
              </div>
              {FIELDS[kind].map((f) => {
                const s = (source as Record<string, unknown>)[f];
                const t = (target as Record<string, unknown>)[f];
                const winner = winners[f] ?? "target";
                const same = fmtVal(s) === fmtVal(t);
                return (
                  <div key={f} className={`grid grid-cols-[minmax(0,180px)_1fr_1fr] gap-2 border-b border-border/60 px-3 py-2 text-[13px] last:border-b-0 ${same ? "opacity-60" : ""}`}>
                    <div className="text-xs font-medium text-muted-foreground">{f}</div>
                    <button
                      type="button"
                      disabled={same}
                      onClick={() => setWinners((w) => ({ ...w, [f]: "source" }))}
                      className={`rounded-sm border px-2 py-1 text-left truncate ${winner === "source" ? "border-brand bg-brand/10 text-brand-deep font-medium" : "border-border hover:bg-secondary/60"}`}
                      title={fmtVal(s)}
                    >
                      {fmtVal(s)}
                    </button>
                    <button
                      type="button"
                      disabled={same}
                      onClick={() => setWinners((w) => ({ ...w, [f]: "target" }))}
                      className={`rounded-sm border px-2 py-1 text-left truncate ${winner === "target" ? "border-brand bg-brand/10 text-brand-deep font-medium" : "border-border hover:bg-secondary/60"}`}
                      title={fmtVal(t)}
                    >
                      {fmtVal(t)}
                    </button>
                  </div>
                );
              })}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep("pick")}>Back</Button>
              <Button type="button" onClick={() => { setConfirmText(""); setStep("confirm"); }}>
                Review & confirm
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "confirm" && source && target && (
          <div className="space-y-4">
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-foreground">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold text-destructive">This cannot be undone.</div>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">“{labelOf(kind, source)}”</span> will be
                    deleted. All of its related records will be re-pointed to
                    <span className="font-medium text-foreground"> “{labelOf(kind, target)}”</span>.
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-border p-3 text-[13px] space-y-1">
              <div><span className="text-muted-foreground">Fields taken from source:</span>{" "}
                <span className="font-medium">
                  {Object.entries(winners).filter(([, w]) => w === "source").length}
                </span>
              </div>
              <div><span className="text-muted-foreground">Fields kept from target:</span>{" "}
                <span className="font-medium">
                  {Object.entries(winners).filter(([, w]) => w === "target").length}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">
                Type <code className="rounded bg-muted px-1 py-0.5 font-mono">MERGE</code> to confirm
              </label>
              <Input
                autoFocus
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="MERGE"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep("reconcile")}>Back</Button>
              <Button
                type="button"
                variant="destructive"
                disabled={confirmText !== "MERGE"}
                onClick={doMerge}
              >
                Merge permanently
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
