/**
 * Force-correct brand casing as the user types.
 * Any casing of "yachtway" becomes "YachtWay". Replacement is the same
 * length as the match, so the caret position is preserved.
 */
const BRAND_RE = /yachtway/gi;

export function correctBrandCase(value: string): string {
  if (!value) return value;
  return value.replace(BRAND_RE, "YachtWay");
}

/**
 * Input types where auto-correction should not apply.
 * Email and URL fields ARE corrected — the brand stays capitalized even in
 * addresses like www.YachtWay.com or jane@YachtWay.com.
 */
const SKIPPED_TYPES = new Set(["password", "number", "tel", "date", "time", "datetime-local", "file", "color", "range", "checkbox", "radio"]);


export function shouldCorrectInputType(type?: string): boolean {
  return !type || !SKIPPED_TYPES.has(type);
}
