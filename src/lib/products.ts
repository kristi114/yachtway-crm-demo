import { useSyncExternalStore } from "react";

/**
 * Product / service catalog used when building estimates and invoices.
 * Most YachtWay Studio work is priced per vessel foot, so pricing models are
 * first-class here: `per_ft` (rate x LOA), `per_unit` (rate x qty) and `flat`.
 * localStorage-backed for the demo; replace with the API later.
 */

export type PricingModel = "per_ft" | "per_unit" | "flat";

export const PRICING_MODELS: { value: PricingModel; label: string; hint: string; unit: string }[] = [
  { value: "per_ft", label: "Per foot (LOA)", hint: "Rate is multiplied by the vessel length", unit: "ft" },
  { value: "per_unit", label: "Per unit / quantity", hint: "Rate is multiplied by a quantity", unit: "unit" },
  { value: "flat", label: "Flat fee", hint: "One fixed price regardless of size", unit: "each" },
];

export interface ProductVariableOption {
  value: string;
  label: string;
  /** Multiplies the base rate (1 = no change). */
  rateMultiplier?: number;
  /** Flat amount added to the line total. */
  priceDelta?: number;
}

export interface ProductVariable {
  key: string;
  label: string;
  type: "select" | "number" | "boolean" | "text";
  help?: string;
  required?: boolean;
  options?: ProductVariableOption[];
  /** number: amount added to the line total per entered unit. */
  pricePerUnit?: number;
  /** number: suffix shown next to the input (e.g. "cabins"). */
  unit?: string;
  /** boolean: flat amount added when enabled. */
  priceDelta?: number;
  defaultValue?: string | number | boolean;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  description?: string;
  pricingModel: PricingModel;
  /** Per-ft rate, per-unit rate, or flat price depending on the model. */
  baseRate: number;
  /** Optional currency override; by default the rate card applies 1:1 in EUR or USD. */
  currency?: "EUR" | "USD" | "GBP";

  /** Line total never falls below this (per-ft work usually has a floor). */
  minCharge?: number;
  unitLabel?: string;
  variables: ProductVariable[];
  active: boolean;
  custom?: boolean;
}

/** The Studio Pass membership subscription product. */
export const STUDIO_PASS_PRODUCT_ID = "prd_studio_pass";

/** Variable key that switches a Studio line between member and non-member rates. */
export const MEMBERSHIP_KEY = "membership";
export const MEMBER_VALUE = "member";
export const NON_MEMBER_VALUE = "non_member";

/** True when this product's price depends on holding an active Studio Pass. */
export function hasMembershipPricing(product?: Product): boolean {
  return !!product?.variables.some((v) => v.key === MEMBERSHIP_KEY);
}

/** Studio rate card is quoted for members; non-members pay the higher rate. */
function membership(nonMemberMultiplier: number): ProductVariable {
  return {
    key: MEMBERSHIP_KEY,
    label: "Membership",
    type: "select",
    required: true,
    defaultValue: NON_MEMBER_VALUE,
    help: "Member rates require an active YachtWay Studio Pass (199 / month).",
    options: [
      { value: MEMBER_VALUE, label: "Member (Studio Pass)", rateMultiplier: 1 },
      { value: NON_MEMBER_VALUE, label: "Non-member", rateMultiplier: nonMemberMultiplier },
    ],
  };
}


/** Standalone travel fee - added manually unless the shoot is in South Florida. */
export const TRAVEL_FEE_PRODUCT_ID = "prd_travel_fee";

export const TRAVEL_SCOPE_KEY = "travel_scope";

export const SHOOT_LOCATIONS = [
  { value: "south_florida", label: "South Florida" },
  { value: "regional_us", label: "Regional US" },
  { value: "international", label: "International" },
];

export function isSouthFloridaShoot(location?: string): boolean {
  return (location ?? "").toLowerCase() === "south_florida";
}

const TRAVEL_SCOPE: ProductVariable = {
  key: TRAVEL_SCOPE_KEY,
  label: "Travel scope",
  type: "select",
  required: true,
  defaultValue: "regional",
  help: "Regional travel covers shoots outside South Florida. International travel covers overseas shoots.",
  options: [
    { value: "regional", label: "Regional travel", priceDelta: 350 },
    { value: "intl", label: "International travel", priceDelta: 1200 },
  ],
};

export const SEED_PRODUCTS: Product[] = [
  {
    id: "prd_photo_video",
    name: "Photo & Video Listing",
    category: "Studio",
    description:
      "Pro yacht photo + video: drone + interior/exterior; 1-min horizontal + 20-sec vertical; TV-grade editing.",
    pricingModel: "per_ft",
    baseRate: 21,
    unitLabel: "ft",
    active: true,
    variables: [membership(31 / 21)],
  },
  {
    id: "prd_3d_tour",
    name: "3D Tour Package",
    category: "Studio",
    description:
      "Always-on 3D virtual tours - explore anytime; built for next-gen buyers (AHPO world-first).",
    pricingModel: "per_ft",
    baseRate: 8,
    unitLabel: "ft",
    active: true,
    variables: [membership(11 / 8)],
  },
  {
    id: "prd_spotlight",
    name: "YachtWay Spotlight",
    category: "Studio",
    description: "1.7M+ monthly impressions via pro walkthroughs highlighting your yacht.",
    pricingModel: "per_ft",
    baseRate: 61,
    unitLabel: "ft",
    active: true,
    variables: [membership(86 / 61)],
  },
  {
    id: "prd_sky",
    name: "YachtWay Sky Package",
    category: "Studio",
    description:
      "Helicopter aerials: cinematic, precision shots from a private helicopter for elite listings.",
    pricingModel: "flat",
    baseRate: 10900,
    active: true,
    variables: [membership(15600 / 10900), { key: "vesselName", label: "Vessel Make, Model", type: "text" }],
  },
  {
    id: "prd_editorial",
    name: "Editorial Package",
    category: "Studio",
    description: "Full-day cinematic shoot with complete deliverables and print rights.",
    pricingModel: "per_unit",
    baseRate: 5500,
    unitLabel: "day",
    active: true,
    variables: [membership(7850 / 5500)],
  },
  {
    id: "prd_show_reel",
    name: "Boat Show Reel",
    category: "Studio - Boat Show",
    description: "Drone + dynamic footage, next-day edits, posted to 1.8M+ followers.",
    pricingModel: "per_unit",
    baseRate: 450,
    unitLabel: "clip",
    active: true,
    variables: [membership(650 / 450)],
  },
  {
    id: "prd_show_spotlight",
    name: "Spotlight at the Boat Show",
    category: "Studio - Boat Show",
    description: "On-site yacht walkthrough on YouTube (1.7M+ monthly impressions).",
    pricingModel: "per_ft",
    baseRate: 35,
    unitLabel: "ft",
    active: true,
    variables: [membership(50 / 35)],
  },
  {
    id: "prd_show_editorial_photos",
    name: "Editorial Photos at the Boat Show",
    category: "Studio - Boat Show",
    description: "5 editorial-grade show images with pro retouching and full print rights.",
    pricingModel: "per_unit",
    baseRate: 500,
    unitLabel: "shoot",
    active: true,
    variables: [membership(715 / 500)],
  },
  {
    id: STUDIO_PASS_PRODUCT_ID,
    name: "YachtWay Studio Pass",
    category: "Studio",
    description:
      "Month-to-month membership (199 / month) that unlocks member rates across the Studio price list. Auto-charged monthly until cancelled.",
    pricingModel: "per_unit",
    baseRate: 199,
    unitLabel: "month",
    active: true,
    variables: [],
  },
  {
    id: TRAVEL_FEE_PRODUCT_ID,
    name: "Travel Fee",
    category: "Studio",
    description:
      "Manually added travel expense for shoots outside South Florida. Not applicable for South Florida shoots.",
    pricingModel: "flat",
    baseRate: 0,
    active: true,
    variables: [TRAVEL_SCOPE],
  },
  {
    id: "prd_tour_renewal",
    name: "3D Tour Annual Hosting Renewal",
    category: "Studio",
    description: "Keeps a published 3D tour live for another 12 months.",
    pricingModel: "flat",
    baseRate: 99,
    active: true,
    variables: [{ key: "vesselName", label: "Vessel Make, Model", type: "text" }],
  },

];


const STORAGE_KEY = "yw:products:v1";

let cache: Product[] | null = null;
const listeners = new Set<() => void>();

function read(): Product[] {
  if (cache) return cache;
  if (typeof window === "undefined") return SEED_PRODUCTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const custom = raw ? (JSON.parse(raw) as Product[]) : [];
    const ids = new Set(custom.map((p) => p.id));
    cache = [...SEED_PRODUCTS.filter((p) => !ids.has(p.id)), ...custom];
  } catch {
    cache = SEED_PRODUCTS;
  }
  return cache;
}

function persist(next: Product[]) {
  cache = next;
  if (typeof window !== "undefined") {
    const seedIds = new Set(SEED_PRODUCTS.map((p) => p.id));
    const overridesAndCustom = next.filter((p) => p.custom || !seedIds.has(p.id) || isOverridden(p));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overridesAndCustom));
  }
  listeners.forEach((l) => l());
}

function isOverridden(p: Product) {
  const seed = SEED_PRODUCTS.find((s) => s.id === p.id);
  return seed ? JSON.stringify(seed) !== JSON.stringify(p) : true;
}

export function listProducts(): Product[] {
  return read();
}

export function getProduct(id?: string): Product | undefined {
  if (!id) return undefined;
  return read().find((p) => p.id === id);
}

export function saveProduct(input: Omit<Product, "id"> & { id?: string }): Product {
  const list = read();
  const product: Product = {
    ...input,
    id: input.id ?? `prd_${Math.random().toString(36).slice(2, 8)}`,
  };
  const idx = list.findIndex((p) => p.id === product.id);
  const next = idx >= 0 ? list.map((p) => (p.id === product.id ? product : p)) : [...list, product];
  persist(next);
  return product;
}

export function useProducts(): Product[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => read(),
    () => SEED_PRODUCTS,
  );
}

/* ---------------------------------------------------------------- pricing */

export type VariableValues = Record<string, string | number | boolean>;

export interface PriceBreakdownRow {
  label: string;
  amount: number;
}

export interface PriceResult {
  /** Rate per unit after multipliers. */
  effectiveRate: number;
  quantity: number;
  unitLabel: string;
  /** Flat add-ons from variables. */
  addOns: PriceBreakdownRow[];
  subtotal: number;
  /** True when the min charge floor kicked in. */
  minApplied: boolean;
  total: number;
}

export function defaultVariableValues(product: Product): VariableValues {
  const out: VariableValues = {};
  for (const v of product.variables) {
    if (v.defaultValue !== undefined) out[v.key] = v.defaultValue;
    else if (v.type === "select") out[v.key] = v.options?.[0]?.value ?? "";
    else if (v.type === "number") out[v.key] = 0;
    else if (v.type === "boolean") out[v.key] = false;
    else out[v.key] = "";
  }
  return out;
}

export function unitLabelFor(product: Product): string {
  if (product.unitLabel) return product.unitLabel;
  return PRICING_MODELS.find((m) => m.value === product.pricingModel)?.unit ?? "unit";
}

/**
 * The two rates a membership-priced product carries. The catalog stores the
 * member rate as `baseRate`, so the list price a non-member actually pays is
 * `baseRate x nonMemberMultiplier`.
 */
export function membershipRates(
  product: Product,
): { member: number; nonMember: number } | null {
  const v = product.variables.find((x) => x.key === MEMBERSHIP_KEY);
  if (!v?.options) return null;
  const member = v.options.find((o) => o.value === MEMBER_VALUE)?.rateMultiplier ?? 1;
  const nonMember = v.options.find((o) => o.value === NON_MEMBER_VALUE)?.rateMultiplier ?? 1;
  return {
    member: Math.round(product.baseRate * member * 100) / 100,
    nonMember: Math.round(product.baseRate * nonMember * 100) / 100,
  };
}

export function priceProduct(
  product: Product,
  quantity: number,
  values: VariableValues,
): PriceResult {
  let rate = product.baseRate;
  const addOns: PriceBreakdownRow[] = [];

  for (const v of product.variables) {
    const raw = values[v.key];
    if (v.type === "select") {
      const opt = v.options?.find((o) => o.value === raw);
      if (!opt) continue;
      if (opt.rateMultiplier && opt.rateMultiplier !== 1) rate *= opt.rateMultiplier;
      if (opt.priceDelta) addOns.push({ label: `${v.label}: ${opt.label}`, amount: opt.priceDelta });
    } else if (v.type === "boolean") {
      if (raw && v.priceDelta) addOns.push({ label: v.label, amount: v.priceDelta });
    } else if (v.type === "number") {
      const n = Number(raw) || 0;
      if (n && v.pricePerUnit) {
        addOns.push({
          label: `${v.label} (${n}${v.unit ? ` ${v.unit}` : ""})`,
          amount: n * v.pricePerUnit,
        });
      }
    }
  }

  const qty = product.pricingModel === "flat" ? 1 : Math.max(0, quantity || 0);
  const base = rate * qty;
  const addOnTotal = addOns.reduce((s, a) => s + a.amount, 0);
  const subtotal = base + addOnTotal;
  const minApplied = !!product.minCharge && subtotal < product.minCharge;
  const total = minApplied ? product.minCharge! : subtotal;

  return {
    effectiveRate: round2(rate),
    quantity: qty,
    unitLabel: unitLabelFor(product),
    addOns,
    subtotal: round2(subtotal),
    minApplied,
    total: round2(total),
  };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function describeVariables(product: Product, values: VariableValues): string {
  const parts: string[] = [];
  for (const v of product.variables) {
    const raw = values[v.key];
    if (raw === undefined || raw === "" || raw === false) continue;
    if (v.type === "select") {
      const opt = v.options?.find((o) => o.value === raw);
      if (opt) parts.push(`${v.label}: ${opt.label}`);
    } else if (v.type === "boolean") {
      parts.push(v.label);
    } else if (v.type === "number") {
      if (Number(raw)) parts.push(`${v.label}: ${raw}${v.unit ? ` ${v.unit}` : ""}`);
    } else {
      parts.push(`${v.label}: ${raw}`);
    }
  }
  return parts.join(" · ");
}
