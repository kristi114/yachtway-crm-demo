import { useEffect, useMemo } from "react";
import { BadgeCheck, GripVertical, Lock, Package, Plus, Ruler, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CurrencyInput } from "@/components/currency-input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatMoney, type CurrencyCode } from "@/lib/currency";
import { discountAmount, type Discount } from "@/lib/billing";
import type { LineItem } from "@/lib/billing";
import {
  defaultVariableValues, getProduct, priceProduct, unitLabelFor,
  describeVariables, hasMembershipPricing, listProducts,
  MEMBERSHIP_KEY, MEMBER_VALUE, NON_MEMBER_VALUE, STUDIO_PASS_PRODUCT_ID,
  TRAVEL_FEE_PRODUCT_ID, SHOOT_LOCATIONS, isSouthFloridaShoot,
  type Product, type VariableValues,
} from "@/lib/products";


export interface LineDraft {
  key: string;
  productId?: string;
  description: string;
  /** For per-ft lines this is the vessel LOA in feet. */
  quantity: number;
  unit_price: number;
  unit_label?: string;
  vessel_name?: string;
  variables: VariableValues;
}

export const newBlankLine = (partial: Partial<LineDraft> = {}): LineDraft => ({
  key: `ln_${Math.random().toString(36).slice(2, 8)}`,
  description: "",
  quantity: 1,
  unit_price: 0,
  variables: {},
  ...partial,
});

export const lineFromProduct = (product: Product, lengthFt?: number): LineDraft => {
  const variables = defaultVariableValues(product);
  const qty = product.pricingModel === "per_ft" ? lengthFt || 0 : 1;
  return {
    key: `ln_${Math.random().toString(36).slice(2, 8)}`,
    productId: product.id,
    description: product.name,
    quantity: qty,
    unit_price: product.baseRate,
    unit_label: unitLabelFor(product),
    variables,
  };
};

/**
 * Reconciles the picker selection with the current draft lines:
 * - custom (non-catalog) lines are kept untouched
 * - products still ticked keep their existing line (length refreshed when provided)
 * - products unticked are removed
 * - newly ticked products are appended once — never duplicated
 */
export const applyProductSelection = (
  lines: LineDraft[],
  products: Product[],
  lengthFt?: number,
): LineDraft[] => {
  const picked = new Map(products.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const kept: LineDraft[] = [];

  for (const line of lines) {
    if (!line.productId) {
      kept.push(line);
      continue;
    }
    const product = picked.get(line.productId);
    if (!product || seen.has(line.productId)) continue;
    seen.add(line.productId);
    const isPerFt = product.pricingModel === "per_ft";
    kept.push({
      ...line,
      quantity: isPerFt && lengthFt ? lengthFt : line.quantity,
    });
  }

  for (const product of products) {
    if (seen.has(product.id)) continue;
    seen.add(product.id);
    kept.push(lineFromProduct(product, lengthFt));
  }

  return kept;
};


export const draftsFromLineItems = (items: LineItem[]): LineDraft[] =>
  items.map((li) => ({
    key: li.id || `ln_${Math.random().toString(36).slice(2, 8)}`,
    productId: li.productId,
    description: li.description,
    quantity: li.quantity,
    unit_price: li.unit_price,
    unit_label: li.unit_label,
    vessel_name: li.vessel_name,
    variables: li.variables ?? {},
  }));

export function lineTotal(line: LineDraft): number {
  const product = getProduct(line.productId);
  if (!product) return (Number(line.quantity) || 0) * (Number(line.unit_price) || 0);
  return priceProduct(product, Number(line.quantity) || 0, line.variables).total;
}

export function lineMemberSavings(line: LineDraft): number {
  const product = getProduct(line.productId);
  if (!product || !hasMembershipPricing(product)) return 0;
  const qty = Number(line.quantity) || 0;
  const nonMember = priceProduct(product, qty, { ...line.variables, [MEMBERSHIP_KEY]: NON_MEMBER_VALUE }).total;
  const member = priceProduct(product, qty, { ...line.variables, [MEMBERSHIP_KEY]: MEMBER_VALUE }).total;
  return Math.round((nonMember - member) * 100) / 100;
}

export function draftsTotal(lines: LineDraft[]): number {
  return lines.reduce((s, l) => s + lineTotal(l), 0);
}

export interface LineValidationError {
  key: string;
  message: string;
}

/** Validates drafts before they become stored line items. */
export function validateLineItems(lines: LineDraft[]): LineValidationError[] {
  const errors: LineValidationError[] = [];
  for (const line of lines) {
    const product = getProduct(line.productId);
    if (!line.description.trim()) {
      errors.push({ key: line.key, message: "Description is required" });
    }
    if (product?.pricingModel === "per_ft" && !(Number(line.quantity) > 0)) {
      errors.push({ key: line.key, message: "Vessel length (ft) is required" });
    }
    if (product && !(Number(line.quantity) > 0) && product.pricingModel !== "flat") {
      errors.push({ key: line.key, message: `Quantity${line.unit_label ? ` (${line.unit_label})` : ""} is required` });
    }
  }
  return errors;
}

/** Converts drafts into stored billing line items (qty x unit_price === total). */
export function toLineItems(lines: LineDraft[]): LineItem[] {
  return lines
    .filter((l) => l.description.trim())
    .map((l) => {
      const product = getProduct(l.productId);
      const total = lineTotal(l);
      const qty = product?.pricingModel === "flat" ? 1 : Math.max(Number(l.quantity) || 0, 0);
      const unitPrice = qty > 0 ? total / qty : total;
      return {
        id: `li_${Math.random().toString(36).slice(2, 8)}`,
        description: l.description.trim(),
        quantity: qty || 1,
        unit_price: Math.round(unitPrice * 100) / 100,
        productId: l.productId,
        unit_label: l.unit_label,
        vessel_name: l.vessel_name?.trim() || undefined,
        vessel_length_ft: product?.pricingModel === "per_ft" ? qty : undefined,
        options_summary: product ? describeVariables(product, l.variables) || undefined : undefined,
        variables: product && Object.keys(l.variables).length ? l.variables : undefined,
      } satisfies LineItem;
    })
    .filter((l) => l.quantity > 0);
}

function VariableField({
  variable,
  value,
  onChange,
  disabledOptions,
  hint,
}: {
  variable: Product["variables"][number];
  value: string | number | boolean | undefined;
  onChange: (v: string | number | boolean) => void;
  disabledOptions?: string[];
  hint?: string;
}) {
  if (variable.type === "select") {
    return (
      <div className="space-y-1.5">
        <Label className="text-[11px]">{variable.label}</Label>
        <Select value={String(value ?? "")} onValueChange={onChange}>
          <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>
            {(variable.options ?? []).map((o) => (
              <SelectItem key={o.value} value={o.value} disabled={disabledOptions?.includes(o.value)}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </div>
    );
  }

  if (variable.type === "boolean") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
        <Label className="text-[11px]">{variable.label}</Label>
        <Switch checked={!!value} onCheckedChange={onChange} />
      </div>
    );
  }
  if (variable.type === "number") {
    return (
      <div className="space-y-1.5">
        <Label className="text-[11px]">
          {variable.label}
          {variable.unit ? <span className="text-muted-foreground"> ({variable.unit})</span> : null}
        </Label>
        <Input
          type="number"
          min={0}
          value={String(value ?? 0)}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px]">{variable.label}</Label>
      <Input value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export interface VesselOption {
  id: string;
  label: string;
  lengthFt: number;
}

export function LineItemsBuilder({
  lines,
  onChange,
  currency,
  onAddProduct,
  defaultLengthFt,
  vessels,
  studioPassActive = false,
  shootLocation,
  discount,
  onDiscountChange,
}: {
  lines: LineDraft[];
  onChange: (next: LineDraft[]) => void;
  currency: CurrencyCode;
  onAddProduct: () => void;
  defaultLengthFt?: number;
  vessels?: VesselOption[];
  /** Company already holds a paid, active Studio Pass. */
  studioPassActive?: boolean;
  /** Studio shoot location - drives whether travel fees are applicable. */
  shootLocation?: string;
  /** When provided, shows an editable discount + Subtotal/Discount/Total breakdown. */
  discount?: Discount;
  onDiscountChange?: (d: Discount | undefined) => void;
}) {

  const total = useMemo(() => draftsTotal(lines), [lines]);
  const showDiscount = Boolean(onDiscountChange);
  const discAmt = discountAmount(total, discount);
  const netTotal = total - discAmt;

  const passOnDoc = lines.some((l) => l.productId === STUDIO_PASS_PRODUCT_ID);
  /** Member rates are only unlockable with an active pass, or by selling one here. */
  const memberAllowed = studioPassActive || passOnDoc;
  const hasMemberPricedLines = lines.some((l) => hasMembershipPricing(getProduct(l.productId)));

  /** Non-member premium currently on the document - the Studio Pass pitch. */
  const memberDelta = useMemo(() => {
    let delta = 0;
    for (const l of lines) {
      const product = getProduct(l.productId);
      if (!product || !hasMembershipPricing(product)) continue;
      const qty = Number(l.quantity) || 0;
      const nonMember = priceProduct(product, qty, {
        ...l.variables,
        [MEMBERSHIP_KEY]: NON_MEMBER_VALUE,
      }).total;
      const member = priceProduct(product, qty, {
        ...l.variables,
        [MEMBERSHIP_KEY]: MEMBER_VALUE,
      }).total;
      delta += nonMember - member;
    }
    return Math.round(delta * 100) / 100;
  }, [lines]);

  const patch = (key: string, next: Partial<LineDraft>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...next } : l)));

  // Member rates flip on the moment the 199 pass is on the invoice, and off if it's removed.
  useEffect(() => {
    const target = memberAllowed ? MEMBER_VALUE : NON_MEMBER_VALUE;
    const needsFix = lines.some(
      (l) =>
        hasMembershipPricing(getProduct(l.productId)) && l.variables?.[MEMBERSHIP_KEY] !== target,
    );
    if (!needsFix) return;
    onChange(
      lines.map((l) =>
        hasMembershipPricing(getProduct(l.productId))
          ? { ...l, variables: { ...l.variables, [MEMBERSHIP_KEY]: target } }
          : l,
      ),
    );
  }, [memberAllowed, lines, onChange]);


  const addStudioPass = () => {
    if (passOnDoc) return;
    const pass = listProducts().find((p) => p.id === STUDIO_PASS_PRODUCT_ID);
    if (!pass) return;
    onChange([...lines, lineFromProduct(pass)]);
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= lines.length) return;
    const next = [...lines];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <section className="space-y-3 rounded-sm border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
            Products &amp; services
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Most Studio work is billed per vessel foot - enter the LOA and the rate does the rest.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={onAddProduct}>
            <Package className="mr-1.5 h-3.5 w-3.5" /> Add from catalog
          </Button>
          <Button size="sm" variant="outline" onClick={() => onChange([...lines, newBlankLine()])}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Custom line
          </Button>
        </div>
      </div>

      {memberAllowed ? (
        hasMemberPricedLines && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-600/30 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
            <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
            <span>
              {studioPassActive
                ? "Studio Pass active on this account - member rates applied."
                : "Studio Pass added to this invoice - member rates applied to every Studio line."}
              {memberDelta > 0 && (
                <> Saving {formatMoney(memberDelta, currency)} vs non-member rates.</>
              )}
            </span>
          </div>
        )
      ) : hasMemberPricedLines ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-600/30 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          <span className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            Member rates are locked: this account has no active Studio Pass. Studio Pass is an annual
            subscription paid monthly ({formatMoney(199, currency)}/month) and the member is locked into
            it. Adding the pass to this invoice saves {formatMoney(memberDelta, currency)} on the Studio
            lines below.
          </span>
          <Button size="sm" variant="outline" onClick={addStudioPass}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Studio Pass
          </Button>
        </div>
      ) : null}

      {/* Travel fee guidance */}
      {shootLocation && isSouthFloridaShoot(shootLocation) && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-600/30 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
          <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
          <span>
            South Florida shoot — travel is included. No travel fee should be added.
          </span>
        </div>
      )}
      {shootLocation && !isSouthFloridaShoot(shootLocation) && !lines.some((l) => l.productId === TRAVEL_FEE_PRODUCT_ID) && (
        <div className="flex items-center gap-2 rounded-md border border-amber-600/30 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          <span>
            Shoot location is {SHOOT_LOCATIONS.find((l) => l.value === shootLocation)?.label ?? shootLocation}. Travel fees are not auto-added — add a Travel Fee line manually from the catalog if applicable.
          </span>
        </div>
      )}
      {shootLocation && isSouthFloridaShoot(shootLocation) && lines.some((l) => l.productId === TRAVEL_FEE_PRODUCT_ID) && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          <Trash2 className="h-3.5 w-3.5 shrink-0" />
          <span>
            Travel fee should not appear on South Florida shoots. Remove the Travel Fee line below.
          </span>
        </div>
      )}

      <div className="space-y-3">
        {lines.map((line, idx) => {
          const product = getProduct(line.productId);
          const price = product ? priceProduct(product, Number(line.quantity) || 0, line.variables) : null;
          const isPerFt = product?.pricingModel === "per_ft";
          const isFlat = product?.pricingModel === "flat";
          const lineSavings = lineMemberSavings(line);
          return (
            <div key={line.key} className="rounded-md border border-border bg-secondary/20 p-3">
              <div className="flex items-start gap-2">
                <div className="flex flex-col pt-1">
                  <button
                    type="button"
                    aria-label="Move line up"
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={idx === 0}
                    onClick={() => move(idx, -1)}
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                </div>

                <div className="min-w-0 flex-1 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <div className="space-y-1.5">
                      <Label className="text-[11px]">Description</Label>
                      <Input
                        value={line.description}
                        onChange={(e) => patch(line.key, { description: e.target.value })}
                        placeholder="e.g. 3D Virtual Tour - M/Y Serenity"
                      />
                      {product && (
                        <p className="text-[11px] text-muted-foreground">
                          {product.category} · {formatMoney(product.baseRate, currency)}
                          {isFlat ? " flat" : `/${unitLabelFor(product)}`}
                          {product.minCharge ? ` · min ${formatMoney(product.minCharge, currency)}` : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex items-start justify-end gap-2 pt-5">
                      <span className="text-base font-semibold tabular-nums text-brand-deep">
                        {formatMoney(lineTotal(line), currency)}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Remove line"
                        onClick={() => onChange(lines.filter((l) => l.key !== line.key))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {isPerFt && (
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1 text-[11px]">
                          <Ruler className="h-3 w-3" /> Length (in ft) <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          required
                          value={String(line.quantity)}
                          onChange={(e) => patch(line.key, { quantity: Number(e.target.value) })}
                          placeholder={defaultLengthFt ? String(defaultLengthFt) : "e.g. 62"}
                        />
                      </div>
                    )}
                    {!isPerFt && !isFlat && (
                      <div className="space-y-1.5">
                        <Label className="text-[11px]">
                          {product?.category?.startsWith("Studio") ? "Length (in ft)" : `Quantity${line.unit_label ? ` (${line.unit_label})` : ""}`}
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          value={String(line.quantity)}
                          onChange={(e) => patch(line.key, { quantity: Number(e.target.value) })}
                        />
                      </div>
                    )}
                    {!product && (
                      <div className="space-y-1.5">
                        <Label className="text-[11px]">Unit price</Label>
                        <CurrencyInput
                          value={line.unit_price}
                          onChange={(n) => patch(line.key, { unit_price: n })}
                        />
                      </div>
                    )}
                    {isPerFt && (
                      <div className="space-y-1.5">
                        <Label className="text-[11px]">Vessel Make, Model</Label>
                        {vessels && vessels.length > 0 ? (
                          <Select
                            value={line.vessel_name || "custom"}
                            onValueChange={(v) => {
                              if (v === "custom") { patch(line.key, { vessel_name: "" }); return; }
                              const vessel = vessels.find((x) => x.label === v);
                              patch(line.key, {
                                vessel_name: v,
                                quantity: vessel?.lengthFt ?? line.quantity,
                              });
                            }}
                          >
                            <SelectTrigger><SelectValue placeholder="Pick a listing…" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="custom">Other / not listed</SelectItem>
                              {vessels.map((v) => (
                                <SelectItem key={v.id} value={v.label}>
                                  {v.label} · {v.lengthFt} ft
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={line.vessel_name ?? ""}
                            onChange={(e) => patch(line.key, { vessel_name: e.target.value })}
                            placeholder="M/Y Serenity"
                          />
                        )}
                      </div>
                    )}

                    {product?.variables
                      .filter((v) => !(isPerFt && v.key === "vesselName"))
                      .map((v) => (
                      <VariableField
                        key={v.key}
                        variable={v}
                        value={line.variables[v.key]}
                        disabledOptions={
                          v.key === MEMBERSHIP_KEY && !memberAllowed ? [MEMBER_VALUE] : undefined
                        }
                        hint={
                          v.key === MEMBERSHIP_KEY
                            ? memberAllowed
                              ? undefined
                              : "Requires an active Studio Pass (199/month)"
                            : undefined
                        }
                        onChange={(val) =>
                          patch(line.key, { variables: { ...line.variables, [v.key]: val } })
                        }
                      />
                      ))}

                  </div>

                  {price && (
                    <div className="space-y-1 rounded-md border border-border bg-surface p-2.5 text-[11px]">
                      {!isFlat && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {formatMoney(price.effectiveRate, currency)} × {price.quantity} {price.unitLabel}
                          </span>
                          <span className="tabular-nums">
                            {formatMoney(price.effectiveRate * price.quantity, currency)}
                          </span>
                        </div>
                      )}
                      {isFlat && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Base price</span>
                          <span className="tabular-nums">{formatMoney(price.effectiveRate, currency)}</span>
                        </div>
                      )}
                      {price.addOns.map((a) => (
                        <div key={a.label} className="flex justify-between">
                          <span className="text-muted-foreground">{a.label}</span>
                          <span className="tabular-nums">+{formatMoney(a.amount, currency)}</span>
                        </div>
                      ))}
                      {price.minApplied && (
                        <div className="flex justify-between text-amber-700">
                          <span>Minimum charge applied</span>
                          <span className="tabular-nums">{formatMoney(price.total, currency)}</span>
                        </div>
                      )}
                      {lineSavings > 0 && (
                        <div className="flex justify-between border-t border-dashed border-border pt-1 text-emerald-700">
                          <span>
                            {memberAllowed
                              ? `Your customer saves with Studio Pass`
                              : `Your customer could save with Studio Pass`}

                          </span>
                          <span className="tabular-nums">-{formatMoney(lineSavings, currency)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {lines.length === 0 && (
          <button
            type="button"
            onClick={onAddProduct}
            className="w-full rounded-md border border-dashed border-border py-8 text-sm text-muted-foreground hover:border-brand-deep/40 hover:text-foreground"
          >
            Add your first product or service
          </button>
        )}
      </div>

      <div className="space-y-1 border-t border-border pt-3 text-sm">
        {memberDelta > 0 && (
          <div className="flex items-center justify-end gap-2 text-emerald-700">
            <span>
              {memberAllowed
                ? "Your customer saves with Studio Pass"
                : "Your customer could save with Studio Pass"}

            </span>
            <span className="font-semibold tabular-nums">
              -{formatMoney(memberDelta, currency)}
            </span>
          </div>
        )}
        {showDiscount ? (
          <>
            <div className="flex items-center justify-end gap-2">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{formatMoney(total, currency)}</span>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="text-muted-foreground">Discount</span>
              <div className="inline-flex rounded-md border border-border p-0.5">
                {(["amount", "percent"] as const).map((t) => {
                  const on = (discount?.type ?? "amount") === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onDiscountChange?.({ type: t, value: discount?.value ?? 0 })}
                      className={`rounded px-2 py-0.5 text-xs font-medium ${on ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {t === "amount" ? "Amount" : "%"}
                    </button>
                  );
                })}
              </div>
              <input
                type="number"
                min={0}
                step={discount?.type === "percent" ? 1 : 0.01}
                value={discount?.value ? String(discount.value) : ""}
                onChange={(e) => {
                  const v = Math.max(0, Number(e.target.value) || 0);
                  onDiscountChange?.(v > 0 ? { type: discount?.type ?? "amount", value: v } : undefined);
                }}
                placeholder="0"
                className="native-select h-8 w-24 rounded-md border border-border bg-surface px-2 text-right text-sm"
              />
              <span className="w-24 text-right tabular-nums text-destructive">
                {discAmt > 0 ? `-${formatMoney(discAmt, currency)}` : formatMoney(0, currency)}
              </span>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border pt-2">
              <span className="text-muted-foreground">Total</span>
              <span className="text-lg font-semibold tabular-nums text-brand-deep">
                {formatMoney(netTotal, currency)}
              </span>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-end gap-2">
            <span className="text-muted-foreground">Total</span>
            <span className="text-lg font-semibold tabular-nums text-brand-deep">
              {formatMoney(total, currency)}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
