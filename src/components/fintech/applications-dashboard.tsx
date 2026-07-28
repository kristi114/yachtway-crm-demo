import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Search, ArrowUp, ArrowDown, ChevronsUpDown, HelpCircle, Pencil } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isClosedStatus, type Deal, type DashboardConfig } from "@/lib/fintech-dashboards";

type SortKey = "applicant" | "amount" | "submittedOn" | "status" | "stage" | "vessel" | "closedDate";

/** Explicit date-format hint appended to date labels so dd.mm.yyyy is never
 *  misread across regions (e.g. US vs EU day/month order). Matches fmtDate(). */
const DATE_FMT = "dd.mm.yyyy";

function statusClass(status: string): string {
  switch (status) {
    case "Funded":
    case "Approved":
    case "Bound":
    case "Active":
    case "Completed":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600";
    case "In Progress":
      return "border-amber-400/50 bg-amber-400/10 text-amber-600";
    case "New":
    case "Quote":
    case "Requested":
      return "border-rose-300/60 bg-rose-500/5 text-rose-600";
    case "Rejected":
    case "Lapsed":
    case "Declined":
      return "border-transparent bg-red-600 text-white";
    default:
      return "border-border bg-secondary text-muted-foreground";
  }
}

function stageDot(stage: string): string {
  const s = stage.toLowerCase();
  if (s.includes("fund") || s.includes("bound") || s.includes("complete") || s.includes("renew")) return "bg-emerald-500";
  if (s.includes("approval")) return "bg-blue-500";
  if (s.includes("underwrit") || s.includes("titling")) return "bg-purple-500";
  if (s.includes("inspection")) return "bg-cyan-500";
  return "bg-amber-500";
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function SortableHead({ label, col, sort, onSort, hint }: { label: string; col: SortKey; sort: { key: SortKey; dir: "asc" | "desc" }; onSort: (c: SortKey) => void; hint?: boolean }) {
  const active = sort.key === col;
  return (
    <TableHead>
      <button type="button" onClick={() => onSort(col)} className="inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground">
        {label}
        {hint && <HelpCircle className="h-3 w-3 opacity-50" />}
        {active ? (sort.dir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />) : <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />}
      </button>
    </TableHead>
  );
}

function EditDealDialog({
  deal,
  config,
  onOpenChange,
  onSave,
}: {
  deal: Deal;
  config: DashboardConfig;
  onOpenChange: (v: boolean) => void;
  onSave: (id: string, patch: Partial<Deal>) => void;
}) {
  const [status, setStatus] = useState(deal.status);
  const [stage, setStage] = useState(deal.stage);
  const [amount, setAmount] = useState(String(deal.amount));
  const [closedDate, setClosedDate] = useState((deal.closedDate ?? "").slice(0, 10));
  const showClosed = isClosedStatus(status);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit deal — {deal.applicant}</DialogTitle>
          <DialogDescription>{deal.vessel}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {config.statusOptions.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Stage</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {config.stageOptions.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{config.amountLabel} (USD)</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          {showClosed && (
            <div className="space-y-1.5">
              <Label>{config.closedDateLabel} ({DATE_FMT})</Label>
              <Input type="date" value={closedDate} onChange={(e) => setClosedDate(e.target.value)} />
            </div>
          )}
          {deal.contactId && (
            <p className="text-xs text-muted-foreground">
              Applicant:{" "}
              <Link to="/contacts/$id" params={{ id: deal.contactId }} className="text-brand hover:underline">
                {deal.applicant}
              </Link>
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => {
              onSave(deal.id, {
                status,
                stage,
                amount: Number(amount) || 0,
                closedDate: showClosed ? (closedDate ? new Date(closedDate).toISOString() : undefined) : undefined,
              });
              toast.success("Deal updated", { description: deal.applicant });
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ApplicationsDashboard({
  config,
  rows: allRows,
  editable = false,
  onSaveDeal,
  banner,
}: {
  config: DashboardConfig;
  rows: Deal[];
  editable?: boolean;
  onSaveDeal?: (id: string, patch: Partial<Deal>) => void;
  banner?: ReactNode;
}) {
  const [tab, setTab] = useState(config.tabs[0]?.key ?? "");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "submittedOn", dir: "desc" });
  const [editing, setEditing] = useState<Deal | null>(null);

  function onSort(col: SortKey) {
    setSort((s) => (s.key === col ? { key: col, dir: s.dir === "asc" ? "desc" : "asc" } : { key: col, dir: "asc" }));
  }

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = allRows.filter(
      (r) => r.tab === tab && (!needle || r.applicant.toLowerCase().includes(needle) || r.vessel.toLowerCase().includes(needle)),
    );
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (r: Deal) =>
      sort.key === "amount"
        ? r.amount
        : sort.key === "submittedOn"
          ? r.submittedOn
          : sort.key === "closedDate"
            ? r.closedDate ?? ""
            : String(r[sort.key] ?? "").toLowerCase();
    return [...filtered].sort((a, b) => {
      const av = val(a), bv = val(b);
      return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
    });
  }, [allRows, tab, q, sort]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of config.tabs) m[t.key] = allRows.filter((r) => r.tab === t.key).length;
    return m;
  }, [config, allRows]);

  const showClosed = tab === config.closedTab;
  const colCount = 6 + (showClosed ? 1 : 0) + (editable ? 1 : 0);

  return (
    <div>
      {banner}
      <div className="border-b border-border">
        <nav className="flex gap-6">
          {config.tabs.map((t) => {
            const active = t.key === tab;
            return (
              <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 pt-1 text-sm font-medium transition-colors ${active ? "border-brand text-brand-deep" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                <t.icon className="h-4 w-4" />
                {t.label}
                <span className="text-xs text-muted-foreground">({counts[t.key] ?? 0})</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="mt-4">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name…" className="pl-8" />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Applicant" col="applicant" sort={sort} onSort={onSort} />
              <SortableHead label={config.amountLabel} col="amount" sort={sort} onSort={onSort} hint />
              <SortableHead label={`Submitted On (${DATE_FMT})`} col="submittedOn" sort={sort} onSort={onSort} />
              {showClosed && <SortableHead label={`${config.closedDateLabel} (${DATE_FMT})`} col="closedDate" sort={sort} onSort={onSort} />}
              <SortableHead label="Status" col="status" sort={sort} onSort={onSort} />
              <SortableHead label="Stage" col="stage" sort={sort} onSort={onSort} />
              <SortableHead label="Vessel Make & Model" col="vessel" sort={sort} onSort={onSort} />
              {editable && <TableHead className="w-16 text-right">Edit</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount} className="py-10 text-center text-sm text-muted-foreground">
                  No records in “{config.tabs.find((t) => t.key === tab)?.label}”.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    {r.contactId ? (
                      <Link to="/contacts/$id" params={{ id: r.contactId }} className="font-medium text-brand hover:underline">
                        {r.applicant}
                      </Link>
                    ) : (
                      <span className="font-medium">{r.applicant}</span>
                    )}
                  </TableCell>
                  <TableCell className="font-semibold">${r.amount.toLocaleString()}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(r.submittedOn)}</TableCell>
                  {showClosed && (
                    <TableCell className="text-sm text-muted-foreground">
                      {r.closedDate ? fmtDate(r.closedDate) : "—"}
                    </TableCell>
                  )}
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusClass(r.status)}`}>{r.status}</span>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      {r.stage}
                      <span className={`h-1.5 w-1.5 rounded-full ${stageDot(r.stage)}`} />
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{r.vessel}</TableCell>
                  {editable && (
                    <TableCell className="text-right">
                      <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="Edit deal" onClick={() => setEditing(r)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {editing && onSaveDeal && (
        <EditDealDialog deal={editing} config={config} onOpenChange={(v) => !v && setEditing(null)} onSave={onSaveDeal} />
      )}
    </div>
  );
}
