import { useMemo } from "react";
import { format, differenceInCalendarDays, subDays } from "date-fns";
import { CalendarDays } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface RangeValue {
  from: Date;
  to: Date;
}

/** Length of the range in days (inclusive). */
export function rangeDays(v: RangeValue): number {
  return differenceInCalendarDays(v.to, v.from) + 1;
}

/** The equal-length window immediately preceding the selected range. */
export function previousRange(v: RangeValue): RangeValue {
  const span = rangeDays(v);
  return { from: subDays(v.from, span), to: subDays(v.to, span) };
}

const fmt = (d: Date) => format(d, "MMM d, yyyy");

/**
 * Date-range picker with an automatic comparison window (the equal-length
 * period immediately before the selection), shown as "range vs previous range".
 */
export function DateRangePicker({
  value, onChange,
}: {
  value: RangeValue;
  onChange: (v: RangeValue) => void;
}) {
  const prev = useMemo(() => previousRange(value), [value]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span>{fmt(value.from)} – {fmt(value.to)}</span>
          <span className="text-muted-foreground">vs {fmt(prev.from)} – {fmt(prev.to)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <div className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
          Comparing to <span className="font-medium text-foreground">{fmt(prev.from)} – {fmt(prev.to)}</span>
        </div>
        <Calendar
          mode="range"
          numberOfMonths={2}
          defaultMonth={value.from}
          selected={{ from: value.from, to: value.to } as DateRange}
          onSelect={(r?: DateRange) => {
            if (r?.from && r?.to) onChange({ from: r.from, to: r.to });
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
