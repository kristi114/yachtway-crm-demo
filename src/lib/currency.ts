/**
 * Multi-currency support for the CRM.
 *
 * - Each Company has its own `currency` (set per-account).
 * - Each User has a home `region` and `currency` (EU reps → EUR, UK → GBP).
 * - The topbar lets a user override the display currency at will.
 *
 * `useMoney()` returns a formatter that resolves currency in this priority:
 *   1. User's active currency override (session)
 *   2. The entity's own currency (e.g. company.currency) passed to format()
 *   3. The signed-in user's home currency
 *   4. USD
 */

export type CurrencyCode = "USD" | "EUR" | "GBP";

export type Region = "US" | "EU" | "UK";

export const CURRENCIES: {
  code: CurrencyCode;
  label: string;
  symbol: string;
  region: Region;
}[] = [
  { code: "EUR", label: "Euro",      symbol: "€", region: "EU" },
  { code: "USD", label: "US Dollar", symbol: "$", region: "US" },
];

export const CURRENCY_SYMBOL: Record<CurrencyCode, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
};

export const REGION_CURRENCY: Record<Region, CurrencyCode> = {
  US: "USD",
  EU: "EUR",
  UK: "GBP",
};

/** Pure formatter - no React. */
export function formatMoney(
  amount: number,
  currency: CurrencyCode = "USD",
  opts: { maximumFractionDigits?: number } = {},
): string {
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : currency === "GBP" ? "en-GB" : "de-DE", {
    style: "currency",
    currency,
    maximumFractionDigits: opts.maximumFractionDigits ?? 0,
  }).format(amount);
}

/** Compact formatter e.g. €1.5M · £900k */
export function formatMoneyCompact(amount: number, currency: CurrencyCode = "USD"): string {
  const sym = CURRENCY_SYMBOL[currency];
  if (amount >= 1_000_000) return `${sym}${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${sym}${(amount / 1_000).toFixed(0)}k`;
  return `${sym}${Math.round(amount)}`;
}
