import { useEffect, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import {
  clearScreenshotEvents,
  listScreenshotEvents,
  screenshotCountsByUser,
  subscribeScreenshotEvents,
  type ScreenshotEvent,
} from "@/lib/screenshot-log";

function fmt(ts: number) {
  return new Date(ts).toLocaleString();
}

export function ScreenshotLogPanel() {
  const [events, setEvents] = useState<ScreenshotEvent[]>([]);
  const [counts, setCounts] = useState(() => screenshotCountsByUser());

  useEffect(() => {
    const refresh = () => {
      setEvents(listScreenshotEvents());
      setCounts(screenshotCountsByUser());
    };
    refresh();
    return subscribeScreenshotEvents(refresh);
  }, []);

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-brand-deep flex items-center gap-2">
            <Camera className="h-4 w-4" /> Screenshot attempts
          </h2>
          <p className="text-xs text-muted-foreground">
            Best-effort browser detection. Users are warned and each attempt is
            logged against their account.
          </p>
        </div>
        {events.length > 0 && (
          <button
            onClick={() => {
              if (confirm("Clear all recorded screenshot events?")) {
                clearScreenshotEvents();
              }
            }}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            <Trash2 className="h-3 w-3" /> Clear log
          </button>
        )}
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          No screenshot attempts recorded.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              By user
            </div>
            <ul className="divide-y divide-border">
              {counts.map((c) => (
                <li key={c.userId} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <div className="font-medium text-foreground">{c.userName}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.userEmail} · {c.role}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-destructive tabular-nums">
                      {c.count}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      last {fmt(c.lastAt)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent events
            </div>
            <ul className="divide-y divide-border max-h-72 overflow-auto">
              {events.slice(0, 50).map((e) => (
                <li key={e.id} className="py-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{e.userName}</span>
                    <span className="text-muted-foreground">{fmt(e.at)}</span>
                  </div>
                  <div className="text-muted-foreground">
                    {e.method} · <span className="font-mono">{e.path || "/"}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
