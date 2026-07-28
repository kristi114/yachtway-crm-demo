/**
 * App-wide date formatting. We render dates as "19 Jul 2026" (day, short month
 * name, year) everywhere so the format is unambiguous regardless of the reader's
 * locale — no more mistaking 05.08.2026 for May vs August.
 *
 * The locale is pinned to en-GB purely to get day-before-month ordering with a
 * month *name*; the month name makes it region-neutral.
 */
export function formatDate(input: string | number | Date | null | undefined): string {
  if (input == null || input === "") return "—";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** "19 Jul 2026, 2:30 PM" — date in the unambiguous style plus a time. */
export function formatDateTime(input: string | number | Date | null | undefined): string {
  if (input == null || input === "") return "—";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${formatDate(d)}, ${time}`;
}
