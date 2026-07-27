import { useEffect, useMemo, useState } from "react";
import { Plus, Search, PackagePlus, Trash2, Check, Ruler } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/currency-input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatMoney, type CurrencyCode } from "@/lib/currency";
import {
  PRICING_MODELS, saveProduct, useProducts, unitLabelFor, membershipRates,
  type PricingModel, type Product, type ProductVariable,
} from "@/lib/products";
import { toast } from "sonner";

interface VarDraft {
  key: string;
  label: string;
  type: ProductVariable["type"];
  amount: number;
  unit: string;
  optionsText: string;
}

const emptyVar = (): VarDraft => ({
  key: "",
  label: "",
  type: "select",
  amount: 0,
  unit: "",
  optionsText: "Standard, Priority x1.25, Rush x1.5",
});

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Parses "Standard, Priority x1.25, Regional +350" into select options. */
function parseOptions(text: string) {
  return text
    .split(/[,\n]/)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      let label = raw;
      let rateMultiplier: number | undefined;
      let priceDelta: number | undefined;
      const mult = raw.match(/\sx\s*([\d.]+)$/i);
      if (mult) {
        rateMultiplier = Number(mult[1]);
        label = raw.slice(0, mult.index).trim();
      }
      const add = label.match(/\s\+\s*([\d.]+)$/);
      if (add) {
        priceDelta = Number(add[1]);
        label = label.slice(0, add.index).trim();
      }
      return { value: slug(label) || label, label, rateMultiplier, priceDelta };
    });
}

export function ProductPickerDialog({
  open,
  onOpenChange,
  currency,
  onPick,
  defaultLengthFt,
  studioPassActive = false,
  selectedProductIds = [],
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currency: CurrencyCode;
  /** Whether the company holds an active Studio Pass (drives which rate applies). */
  studioPassActive?: boolean;
  /** Called with the selected products and the vessel length entered in the dialog. */
  onPick: (products: Product[], lengthFt?: number) => void;
  defaultLengthFt?: number;
  /** Product IDs that are already on the document — they stay ticked when reopening the picker. */
  selectedProductIds?: string[];
}) {
  const products = useProducts();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lengthFt, setLengthFt] = useState<number | "">(defaultLengthFt ?? "");

  const [name, setName] = useState("");
  const [category, setCategory] = useState("Studio");
  const [description, setDescription] = useState("");
  const [pricingModel, setPricingModel] = useState<PricingModel>("per_ft");
  const [baseRate, setBaseRate] = useState(0);
  const [minCharge, setMinCharge] = useState(0);
  const [unitLabel, setUnitLabel] = useState("");
  const [vars, setVars] = useState<VarDraft[]>([]);

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const filtered = products.filter(
      (p) =>
        p.active &&
        (!term ||
          p.name.toLowerCase().includes(term) ||
          p.category.toLowerCase().includes(term) ||
          (p.description ?? "").toLowerCase().includes(term)),
    );
    const map = new Map<string, Product[]>();
    for (const p of filtered) {
      map.set(p.category, [...(map.get(p.category) ?? []), p]);
    }
    return [...map.entries()];
  }, [products, q]);

  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(selectedProductIds));
      setLengthFt(defaultLengthFt ?? "");
      setCreating(false);
    }
  }, [open, defaultLengthFt, selectedProductIds]);

  const toggleProduct = (p: Product) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(p.id)) next.delete(p.id);
      else next.add(p.id);
      return next;
    });
  };

  const addSelected = () => {
    const selected = products.filter((p) => selectedIds.has(p.id));
    if (selected.length === 0) return;
    onPick(selected, lengthFt === "" ? undefined : Number(lengthFt));
    onOpenChange(false);
  };

  const resetForm = () => {
    setName(""); setCategory("Studio"); setDescription("");
    setPricingModel("per_ft"); setBaseRate(0); setMinCharge(0); setUnitLabel(""); setVars([]);
  };

  const create = () => {
    if (!name.trim()) { toast.error("Give the product a name"); return; }
    if (!baseRate) { toast.error("Set a rate or price"); return; }
    const variables: ProductVariable[] = vars
      .filter((v) => v.label.trim())
      .map((v) => {
        const base: ProductVariable = {
          key: v.key.trim() || slug(v.label),
          label: v.label.trim(),
          type: v.type,
        };
        if (v.type === "select") base.options = parseOptions(v.optionsText);
        if (v.type === "number") { base.pricePerUnit = v.amount || undefined; base.unit = v.unit || undefined; }
        if (v.type === "boolean") base.priceDelta = v.amount || undefined;
        return base;
      });
    const product = saveProduct({
      name: name.trim(),
      category: category.trim() || "Other",
      description: description.trim() || undefined,
      pricingModel,
      baseRate,
      minCharge: minCharge || undefined,
      unitLabel: unitLabel.trim() || undefined,
      variables,
      active: true,
      custom: true,
    });
    toast.success(`${product.name} added to the catalog`);
    resetForm();
    setCreating(false);
    setSelectedIds((prev) => new Set(prev).add(product.id));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setCreating(false); }}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{creating ? "New product" : "Add product or service"}</DialogTitle>
          <DialogDescription>
            {creating
              ? "Define how this product is priced. It will be saved to the catalog for reuse."
              : "Tick as many products as you need — you can add several at once — or create a new product with its own pricing variables."}
          </DialogDescription>
        </DialogHeader>

        {!creating && (
          <div
            className={[
              "rounded-md border px-3 py-2 text-[11px]",
              studioPassActive
                ? "border-emerald-500/30 bg-emerald-500/10 text-foreground"
                : "border-amber-500/30 bg-amber-500/10 text-foreground",
            ].join(" ")}
          >
            {studioPassActive
              ? "This company holds an active YachtWay Studio Pass — member (pass) rates apply. List price is shown struck through."
              : "This company is not a Studio Pass holder — the list (non-member) price applies. The pass rate is shown for comparison."}
          </div>
        )}

        {!creating ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
              <div className="flex min-w-0 flex-col">
                <Label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                  Search
                </Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search products…"
                    className="w-full pl-8"
                  />
                </div>
                <p className="mt-1 text-[10px] text-transparent">&nbsp;</p>
              </div>
              <div className="min-w-0 lg:w-56">
                <Label htmlFor="boat-length" className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                  Boat Length
                </Label>
                <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 has-[input:focus]:ring-1 has-[input:focus]:ring-ring">
                  <Ruler className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <Input
                    id="boat-length"
                    type="number"
                    min={0}
                    value={lengthFt}
                    onChange={(e) => setLengthFt(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="ft"
                    className="h-auto min-w-0 flex-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
                  />
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Used for per-foot pricing.
                </p>
              </div>
              <div className="flex min-w-0 flex-col items-start">
                <Label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                  Actions
                </Label>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setCreating(true)}>
                    <PackagePlus className="mr-1.5 h-3.5 w-3.5" /> New product
                  </Button>
                  <Button disabled={selectedIds.size === 0} onClick={addSelected}>
                    Add selected {selectedIds.size > 0 && `(${selectedIds.size})`}
                  </Button>
                </div>
                <p className="mt-1 text-[10px] text-transparent">&nbsp;</p>
              </div>
            </div>

            <div className="space-y-4">
              {groups.map(([cat, items]) => (
                <div key={cat} className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {cat}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {items.map((p) => {
                      const selected = selectedIds.has(p.id);
                      const rates = membershipRates(p);
                      const cur = p.currency ?? currency;
                      const suffix = p.pricingModel === "flat" ? "" : `/${unitLabelFor(p)}`;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => toggleProduct(p)}
                          className={[
                            "relative rounded-md border p-3 text-left transition",
                            selected
                              ? "border-brand-deep bg-brand-deep/5 hover:bg-brand-deep/10"
                              : "border-border bg-surface hover:border-brand-deep/40 hover:bg-secondary/40",
                          ].join(" ")}
                        >
                          <span
                            aria-hidden
                            className={[
                              "absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-[6px] border transition",
                              selected
                                ? "border-brand-deep bg-brand-deep text-white"
                                : "border-border bg-surface text-transparent",
                            ].join(" ")}
                          >
                            <Check className="h-3 w-3" />
                          </span>

                          <div className="flex items-start justify-between gap-2 pr-6">
                            <span className="text-sm font-medium text-foreground">{p.name}</span>
                            <span className="whitespace-nowrap text-right text-sm font-semibold tabular-nums text-brand-deep">
                              {rates ? (
                                <>
                                  <span className={studioPassActive ? "text-muted-foreground line-through" : ""}>
                                    {formatMoney(rates.nonMember, cur)}
                                    <span className="text-[11px] font-normal text-muted-foreground">{suffix}</span>
                                  </span>
                                  <span className="block text-[11px] font-medium text-emerald-600">
                                    {studioPassActive ? "Pass rate " : "Pass holder "}
                                    {formatMoney(rates.member, cur)}
                                    {suffix}
                                  </span>
                                </>
                              ) : (
                                <>
                                  {formatMoney(p.baseRate, cur)}
                                  <span className="text-[11px] font-normal text-muted-foreground">{suffix}</span>
                                </>
                              )}
                            </span>
                          </div>

                          {p.description && (
                            <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{p.description}</p>
                          )}

                          {(() => {
                            const qty = p.pricingModel === "per_ft" ? Number(lengthFt || 0) : 1;
                            if (p.pricingModel === "per_ft" && !qty) {
                              return (
                                <p className="mt-1.5 text-[11px] text-muted-foreground">
                                  Enter a vessel length to see this price.
                                </p>
                              );
                            }
                            const rate = rates
                              ? studioPassActive
                                ? rates.member
                                : rates.nonMember
                              : p.baseRate;
                            const est = Math.max(rate * qty, p.minCharge ?? 0);
                            const passEst = rates
                              ? Math.max(rates.member * qty, p.minCharge ?? 0)
                              : null;
                            return (
                              <p className="mt-1.5 text-[11px] text-foreground">
                                <span className="font-semibold tabular-nums">
                                  {formatMoney(est, cur)}
                                </span>
                                <span className="text-muted-foreground">
                                  {p.pricingModel === "per_ft" ? ` for ${qty} ft` : " total"}
                                </span>
                                {passEst !== null && !studioPassActive && (
                                  <span className="text-emerald-600">
                                    {" · "}
                                    {formatMoney(passEst, cur)} with Studio Pass
                                  </span>
                                )}
                              </p>
                            );
                          })()}
                          <div className="mt-2 flex flex-wrap gap-1">
                            <span className="rounded-full border border-border bg-secondary/50 px-2 py-0.5 text-[10px]">
                              {PRICING_MODELS.find((m) => m.value === p.pricingModel)?.label}
                            </span>
                            {p.minCharge ? (
                              <span className="rounded-full border border-border bg-secondary/50 px-2 py-0.5 text-[10px]">
                                min {formatMoney(p.minCharge, p.currency ?? currency)}
                              </span>
                            ) : null}

                            {p.variables.length > 0 && (
                              <span className="rounded-full border border-border bg-secondary/50 px-2 py-0.5 text-[10px]">
                                {p.variables.length} option{p.variables.length > 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {groups.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No products match “{q}”.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Interior 3D scan" />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Studio" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Description</Label>
                <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Pricing model</Label>
                <Select value={pricingModel} onValueChange={(v) => setPricingModel(v as PricingModel)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRICING_MODELS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {PRICING_MODELS.find((m) => m.value === pricingModel)?.hint}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>{pricingModel === "flat" ? "Flat price" : "Rate"}</Label>
                <CurrencyInput value={baseRate} onChange={setBaseRate} />
              </div>
              {pricingModel !== "flat" && (
                <>
                  <div className="space-y-1.5">
                    <Label>Unit label</Label>
                    <Input
                      value={unitLabel}
                      onChange={(e) => setUnitLabel(e.target.value)}
                      placeholder={pricingModel === "per_ft" ? "ft" : "unit"}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Minimum charge (optional)</Label>
                    <CurrencyInput value={minCharge} onChange={setMinCharge} />
                  </div>
                </>
              )}
            </div>

            <div className="space-y-2 rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-[12px]">Product variables</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Choices that change the price - e.g. turnaround (multiplier), add-ons (flat), counts (per unit).
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setVars((p) => [...p, emptyVar()])}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add variable
                </Button>
              </div>
              {vars.map((v, i) => (
                <div key={i} className="grid gap-2 rounded-md bg-secondary/30 p-2 sm:grid-cols-[1fr_140px_1fr_36px]">
                  <Input
                    placeholder="Label (e.g. Turnaround)"
                    value={v.label}
                    onChange={(e) => setVars((p) => p.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  />
                  <Select
                    value={v.type}
                    onValueChange={(t) => setVars((p) => p.map((x, j) => (j === i ? { ...x, type: t as VarDraft["type"] } : x)))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="select">Choice</SelectItem>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="boolean">Yes / no add-on</SelectItem>
                      <SelectItem value="text">Free text</SelectItem>
                    </SelectContent>
                  </Select>
                  {v.type === "select" ? (
                    <Input
                      placeholder="Standard, Priority x1.25, Regional +350"
                      value={v.optionsText}
                      onChange={(e) => setVars((p) => p.map((x, j) => (j === i ? { ...x, optionsText: e.target.value } : x)))}
                    />
                  ) : v.type === "text" ? (
                    <div className="flex items-center text-[11px] text-muted-foreground">No price impact</div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <CurrencyInput
                        value={v.amount}
                        onChange={(n) => setVars((p) => p.map((x, j) => (j === i ? { ...x, amount: n } : x)))}
                      />
                      {v.type === "number" && (
                        <Input
                          className="w-24"
                          placeholder="unit"
                          value={v.unit}
                          onChange={(e) => setVars((p) => p.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))}
                        />
                      )}
                    </div>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remove variable"
                    onClick={() => setVars((p) => p.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          {creating ? (
            <>
              <Button variant="outline" onClick={() => setCreating(false)}>Back to catalog</Button>
              <Button onClick={create}>Save &amp; add to document</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              <Button disabled={selectedIds.size === 0} onClick={addSelected}>
                Add selected {selectedIds.size > 0 && `(${selectedIds.size})`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


