import { Send, CalendarClock, Layers3, Rss, Sparkles, Globe, AlertTriangle } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  WEEKDAYS, ALL_WEEKDAYS, TIMEZONES, offsetLabel, batchPlan, scheduleErrors,
  type SendSchedule, type SendMode, type RepeatUnit, type Weekday,
} from "@/lib/email-scheduling";

const MODES: { id: SendMode; label: string; icon: typeof Send; blurb: string }[] = [
  { id: "now", label: "Send Now", icon: Send, blurb: "Send the email campaign immediately" },
  { id: "at", label: "Schedule", icon: CalendarClock, blurb: "Send once at a specific date and time" },
  { id: "batch", label: "Batch Schedule", icon: Layers3, blurb: "Schedule to large groups of contacts in drip mode" },
  { id: "rss", label: "RSS Schedule", icon: Rss, blurb: "Send whenever a watched feed publishes something new" },
  { id: "smart", label: "Smart Send", icon: Sparkles, blurb: "Deliver at each recipient's best engagement time" },
];

/** Numeric field with −/+ steppers, matching the batch controls. */
function Stepper({
  id, value, min = 1, max = 100000, onChange,
}: {
  id: string; value: number; min?: number; max?: number; onChange: (n: number) => void;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div className="inline-flex items-center overflow-hidden rounded-md border border-border bg-surface">
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        className="px-2 py-1.5 text-muted-foreground hover:bg-accent"
        aria-label="Decrease"
      >
        −
      </button>
      <input
        id={id}
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(clamp(Number(e.target.value) || min))}
        className="w-16 border-x border-border bg-transparent px-2 py-1.5 text-center text-[13px] tabular-nums outline-none"
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        className="px-2 py-1.5 text-muted-foreground hover:bg-accent"
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-2 border-t border-border py-3 sm:grid-cols-[11rem_1fr] sm:items-start sm:gap-4">
      <div>
        <Label className="text-[13px]">{label}</Label>
        {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * Dispatch mode picker plus the settings for the chosen mode. Mirrors the
 * campaign-sender pattern: pick how it goes out, then configure only that mode.
 */
export function SendSchedulePanel({
  value,
  onChange,
  recipients,
}: {
  value: SendSchedule;
  onChange: (next: SendSchedule) => void;
  recipients: number;
}) {
  const mode = MODES.find((m) => m.id === value.mode)!;
  const errors = scheduleErrors(value);
  const plan = batchPlan(recipients, value.batch);

  function patch(p: Partial<SendSchedule>) {
    onChange({ ...value, ...p });
  }
  function patchBatch(p: Partial<SendSchedule["batch"]>) {
    onChange({ ...value, batch: { ...value.batch, ...p } });
  }
  function toggleDay(day: Weekday) {
    const has = value.batch.sendOnDays.includes(day);
    patchBatch({
      sendOnDays: has
        ? value.batch.sendOnDays.filter((d) => d !== day)
        : [...value.batch.sendOnDays, day],
    });
  }

  return (
    <div className="space-y-3">
      {/* Mode strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {MODES.map(({ id, label, icon: Icon }) => {
          const active = value.mode === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => patch({ mode: id })}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[13px] font-medium transition-colors ${
                active
                  ? "border-brand bg-brand/5 text-brand-deep"
                  : "border-border bg-surface text-muted-foreground hover:bg-accent"
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  active ? "bg-brand/15 text-brand" : "bg-secondary text-muted-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>

      <div>
        <h4 className="text-sm font-semibold text-brand-deep">{mode.label}</h4>
        <p className="text-xs text-muted-foreground">{mode.blurb}</p>
      </div>

      {/* ---- Schedule / Batch: start time + timezone ---- */}
      {(value.mode === "at" || value.mode === "batch") && (
        <Row
          label="Start On"
          hint={
            <span className="inline-flex items-center gap-1">
              <Globe className="h-3 w-3" /> {offsetLabel(value.timezone)} {value.timezone}
            </span>
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="datetime-local"
              value={value.startAt}
              onChange={(e) => patch({ startAt: e.target.value })}
              className="h-9 w-[15rem] text-[13px]"
            />
            <select
              value={value.timezone}
              onChange={(e) => patch({ timezone: e.target.value })}
              className="native-select h-9 rounded-md border border-border bg-surface px-2 text-[13px]"
              aria-label="Timezone"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
        </Row>
      )}

      {/* ---- Batch drip ---- */}
      {value.mode === "batch" && (
        <>
          <Row label="Batch Quantity">
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <Stepper id="batch-qty" value={value.batch.quantity} onChange={(n) => patchBatch({ quantity: n })} />
              <span className="text-muted-foreground">contacts, repeat after</span>
              <Stepper id="batch-every" value={value.batch.repeatAfter} onChange={(n) => patchBatch({ repeatAfter: n })} />
              <select
                value={value.batch.repeatUnit}
                onChange={(e) => patchBatch({ repeatUnit: e.target.value as RepeatUnit })}
                className="native-select h-9 rounded-md border border-border bg-surface px-2 text-[13px]"
                aria-label="Repeat unit"
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </div>
            {recipients > 0 && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {plan.batches} batch{plan.batches === 1 ? "" : "es"} of {plan.perBatch} ·{" "}
                {plan.spanLabel} to reach all {recipients}
              </p>
            )}
          </Row>

          <Row label="Send On">
            <div className="flex flex-wrap items-center gap-1.5">
              {WEEKDAYS.map(({ day, label }) => {
                const on = value.batch.sendOnDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    aria-pressed={on}
                    className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                      on
                        ? "bg-brand text-brand-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() =>
                  patchBatch({
                    sendOnDays:
                      value.batch.sendOnDays.length === 7 ? [1, 2, 3, 4, 5] : [...ALL_WEEKDAYS],
                  })
                }
                className="ml-1 text-xs text-brand hover:underline"
              >
                {value.batch.sendOnDays.length === 7 ? "Weekdays only" : "All days"}
              </button>
            </div>
          </Row>

          <Row label="Daily window" hint="Optional — only send between these times">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="time"
                value={value.batch.startsAt}
                onChange={(e) => patchBatch({ startsAt: e.target.value })}
                className="h-9 w-32 text-[13px]"
                aria-label="Starts at"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="time"
                value={value.batch.endsAt}
                onChange={(e) => patchBatch({ endsAt: e.target.value })}
                className="h-9 w-32 text-[13px]"
                aria-label="Ends at"
              />
              {(value.batch.startsAt || value.batch.endsAt) && (
                <button
                  type="button"
                  onClick={() => patchBatch({ startsAt: "", endsAt: "" })}
                  className="text-xs text-brand hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          </Row>

          {plan.warning && (
            <p className="flex items-start gap-1.5 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {plan.warning}
            </p>
          )}
        </>
      )}

      {/* ---- RSS ---- */}
      {value.mode === "rss" && (
        <>
          <Row label="Feed URL">
            <Input
              value={value.rss.feedUrl}
              onChange={(e) => onChange({ ...value, rss: { ...value.rss, feedUrl: e.target.value } })}
              placeholder="https://yachtway.com/blog/rss.xml"
              className="h-9 text-[13px]"
            />
          </Row>
          <Row label="Check for new items">
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <select
                value={value.rss.checkEvery}
                onChange={(e) =>
                  onChange({
                    ...value,
                    rss: { ...value.rss, checkEvery: e.target.value as "hourly" | "daily" | "weekly" },
                  })
                }
                className="native-select h-9 rounded-md border border-border bg-surface px-2 text-[13px]"
              >
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
              <span className="text-muted-foreground">and send when at least</span>
              <Stepper
                id="rss-min"
                value={value.rss.minItems}
                min={1}
                max={50}
                onChange={(n) => onChange({ ...value, rss: { ...value.rss, minItems: n } })}
              />
              <span className="text-muted-foreground">new item(s) are waiting</span>
            </div>
          </Row>
        </>
      )}

      {/* ---- Smart Send ---- */}
      {value.mode === "smart" && (
        <>
          <Row
            label="Delivery window"
            hint="Recipient's local time — nothing is delivered outside this range"
          >
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <Stepper
                id="smart-early"
                value={value.smart.earliestHour}
                min={0}
                max={23}
                onChange={(n) => onChange({ ...value, smart: { ...value.smart, earliestHour: n } })}
              />
              <span className="text-muted-foreground">:00 to</span>
              <Stepper
                id="smart-late"
                value={value.smart.latestHour}
                min={1}
                max={23}
                onChange={(n) => onChange({ ...value, smart: { ...value.smart, latestHour: n } })}
              />
              <span className="text-muted-foreground">:00</span>
            </div>
          </Row>
          <Row label="Spread over" hint="Hours either side of each contact's best time">
            <Stepper
              id="smart-window"
              value={value.smart.windowHours}
              min={1}
              max={48}
              onChange={(n) => onChange({ ...value, smart: { ...value.smart, windowHours: n } })}
            />
          </Row>
          <p className="text-xs text-muted-foreground">
            Contacts with no engagement history fall back to the middle of the window.
          </p>
        </>
      )}

      {errors.length > 0 && (
        <ul className="space-y-1">
          {errors.map((e) => (
            <li key={e} className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {e}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
