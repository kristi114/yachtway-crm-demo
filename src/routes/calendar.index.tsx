import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, CheckSquare, Camera, CalendarDays, Clock, User as UserIcon, Plus } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { STUDIO_BOOKINGS, TASKS, getCompany } from "@/lib/mock-data";
import { useEventsStore, listEvents, eventLocationLine } from "@/lib/events";
import { useStudioTours, allStudioTours } from "@/lib/studio-tours";
import { useAuth, DEMO_USER_LIST } from "@/lib/auth";
import { usePersonalEntries, listPersonalEntries, type PersonalEntry } from "@/lib/personal-calendar";
import { CalendarEntryDialog } from "@/components/calendar-entry-dialog";

export const Route = createFileRoute("/calendar/")({
  head: () => ({
    meta: [
      { title: "Calendar - YachtWay CRM" },
      { name: "description", content: "One timeline for tasks, Studio shoots, 3D tour renewals and dealer events." },
      { property: "og:title", content: "Calendar - YachtWay CRM" },
      { property: "og:description", content: "One timeline for tasks, Studio shoots, 3D tour renewals and dealer events." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CalendarPage,
});

type Kind = "task" | "shoot" | "renewal" | "event" | "personal";

interface CalItem {
  id: string;
  kind: Kind;
  date: string; // yyyy-mm-dd
  time?: string;
  title: string;
  subtitle?: string;
  /** YachtWay user this item belongs to (assignee / account owner / creator). */
  ownerUserId?: string | null;
  to?: { to: string; params?: Record<string, string> };
  /** Personal entries are editable in place. */
  entry?: PersonalEntry;
}

const KIND_META: Record<Kind, { label: string; icon: typeof CheckSquare; dot: string; chip: string }> = {
  task: { label: "Tasks", icon: CheckSquare, dot: "bg-brand", chip: "bg-brand/10 text-brand-deep" },
  shoot: { label: "Studio shoots", icon: Camera, dot: "bg-emerald-500", chip: "bg-emerald-500/10 text-emerald-700" },
  renewal: { label: "3D tour renewals", icon: Clock, dot: "bg-amber-500", chip: "bg-amber-500/10 text-amber-700" },
  event: { label: "Dealer events", icon: CalendarDays, dot: "bg-violet-500", chip: "bg-violet-500/10 text-violet-700" },
  personal: { label: "My entries", icon: UserIcon, dot: "bg-sky-500", chip: "bg-sky-500/10 text-sky-700" },
};

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function CalendarPage() {
  useEventsStore();
  useStudioTours();
  const personalEntries = usePersonalEntries();
  const { can, user } = useAuth();
  const isAdmin = user.role === "admin";
  // Everyone lands on their own calendar; admins can switch to any teammate.
  const [personId, setPersonId] = useState<string>(user.id);
  const [entryOpen, setEntryOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<PersonalEntry | undefined>(undefined);

  // Mock data records people by display name; map those back to user ids.
  const userIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of DEMO_USER_LIST) map.set(u.name.toLowerCase(), u.id);
    return map;
  }, []);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [hidden, setHidden] = useState<Kind[]>([]);

  const items = useMemo<CalItem[]>(() => {
    const out: CalItem[] = [];

    for (const t of TASKS) {
      out.push({
        id: `task_${t.id}`,
        kind: "task",
        date: t.dueDate.slice(0, 10),
        title: t.title,
        subtitle: `${t.assignee} · ${t.priority} priority · ${t.status}`,
        ownerUserId: userIdByName.get(t.assignee.toLowerCase()) ?? null,
        to: { to: "/tasks" },
      });
    }

    for (const b of STUDIO_BOOKINGS) {
      out.push({
        id: `shoot_${b.id}`,
        kind: "shoot",
        date: b.scheduledAt.slice(0, 10),
        time: b.scheduledAt.slice(11, 16),
        title: b.vessel,
        subtitle: `${b.package} · ${b.photographer} · ${b.location}`,
        ownerUserId: getCompany(b.companyId)?.ownerUserId ?? null,
        to: { to: "/companies/$id", params: { id: b.companyId } },
      });
    }

    for (const tour of allStudioTours()) {
      const company = tour.companyId ? getCompany(tour.companyId) : undefined;
      out.push({
        id: `renewal_${tour.id}`,
        kind: "renewal",
        date: (tour.renewed_until ?? tour.expires_at).slice(0, 10),
        title: `Storage expires - ${tour.opportunity.name}`,
        subtitle: `${company?.name ?? "Unassigned"} · $${tour.renewal_price_usd} renewal`,
        ownerUserId: company?.ownerUserId ?? null,
        to: tour.companyId ? { to: "/companies/$id", params: { id: tour.companyId } } : undefined,
      });
    }

    for (const e of listEvents()) {
      if (e.isCancelled || !e.isActive) continue;
      out.push({
        id: `event_${e.id}`,
        kind: "event",
        date: e.eventStartDate,
        time: e.eventStartTime,
        title: e.eventName,
        subtitle: `${e.dealerName} · ${eventLocationLine(e)}`,
        ownerUserId:
          getCompany(e.dealerId)?.ownerUserId ??
          userIdByName.get(e.createdByName.toLowerCase()) ??
          null,
        to: { to: "/events" },
      });
    }

    for (const e of listPersonalEntries()) {
      out.push({
        id: `personal_${e.id}`,
        kind: "personal",
        date: e.date,
        time: e.time || undefined,
        title: e.title,
        subtitle: [e.endTime ? `until ${e.endTime}` : null, e.location || null, e.notes || null]
          .filter(Boolean)
          .join(" · "),
        ownerUserId: e.userId,
        entry: e,
      });
    }

    return out
      .filter((i) => Boolean(i.date))
      .sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
  }, [userIdByName, personalEntries]);

  // "Whole team" shows everything (minus other people's personal entries);
  // otherwise the calendar is scoped to the selected person.
  const scoped = useMemo(() => {
    if (personId === "all") return items.filter((i) => i.kind !== "personal" || i.ownerUserId === user.id);
    return items.filter((i) => i.ownerUserId === personId);
  }, [items, personId, user.id]);

  const visible = useMemo(
    () => scoped.filter((i) => !hidden.includes(i.kind) && (i.kind !== "event" || can("events"))),
    [scoped, hidden, can],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    for (const i of visible) {
      const list = map.get(i.date) ?? [];
      list.push(i);
      map.set(i.date, list);
    }
    return map;
  }, [visible]);

  // Build a Monday-first 6x7 grid for the cursor month.
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - offset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const todayIso = iso(new Date());

  const monthItems = visible.filter((i) => i.date.startsWith(iso(cursor).slice(0, 7)));
  const upcoming = visible.filter((i) => i.date >= todayIso).slice(0, 12);

  const toggle = (k: Kind) =>
    setHidden((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  return (
    <AppShell>
      <PageHeader
        eyebrow="Overview"
        title="Calendar"
        subtitle={`${monthItems.length} items in ${monthLabel} - ${
          personId === "all"
            ? "whole team: tasks, Studio shoots, tour renewals and dealer events"
            : `${personId === user.id ? "your" : `${DEMO_USER_LIST.find((u) => u.id === personId)?.name ?? "teammate"}'s`} tasks, shoots, renewals, events and calendar entries`
        }`}
        actions={
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setEditEntry(undefined);
                setEntryOpen(true);
              }}
              className="mr-1 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-secondary"
            >
              <Plus className="h-4 w-4" />
              New entry
            </button>
            <select
              aria-label="Calendar owner"
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              className="mr-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-secondary"
            >
              <option value={user.id}>My calendar</option>
              <option value="all">Whole team</option>
              {isAdmin &&
                DEMO_USER_LIST.filter((u) => u.id !== user.id).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              className="rounded-lg border border-border bg-surface p-2 hover:bg-secondary"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                const n = new Date();
                setCursor(new Date(n.getFullYear(), n.getMonth(), 1));
              }}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-secondary"
            >
              Today
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              className="rounded-lg border border-border bg-surface p-2 hover:bg-secondary"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        }
      />
      <PageBody>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(Object.keys(KIND_META) as Kind[]).map((k) => {
            const meta = KIND_META[k];
            const on = !hidden.includes(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggle(k)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  on ? "border-border bg-surface text-foreground" : "border-dashed border-border bg-transparent text-muted-foreground"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${on ? meta.dot : "bg-muted-foreground/40"}`} />
                {meta.label}
                <span className="text-muted-foreground">
                  {scoped.filter((i) => i.kind === k).length}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
            <header className="flex items-center justify-between border-b border-border bg-secondary/60 px-4 py-2.5">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">{monthLabel}</h2>
            </header>
            <div className="grid grid-cols-7 border-b border-border bg-secondary/30 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d} className="py-2">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((d) => {
                const key = iso(d);
                const inMonth = d.getMonth() === cursor.getMonth();
                const dayItems = byDate.get(key) ?? [];
                return (
                  <div
                    key={key}
                    className={`min-h-[104px] border-b border-r border-border p-1.5 last:border-r-0 ${
                      inMonth ? "bg-surface" : "bg-secondary/30 text-muted-foreground"
                    }`}
                  >
                    <div
                      className={`mb-1 inline-flex h-6 min-w-6 items-center justify-center rounded-lg px-1 text-xs font-semibold ${
                        key === todayIso ? "bg-brand text-brand-foreground" : ""
                      }`}
                    >
                      {d.getDate()}
                    </div>
                    <ul className="space-y-1">
                      {dayItems.slice(0, 3).map((i) => {
                        const meta = KIND_META[i.kind];
                        const body = (
                          <span className="flex items-start gap-1 truncate">
                            <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
                            <span className="truncate">{i.time ? `${i.time} ` : ""}{i.title}</span>
                          </span>
                        );
                        return (
                          <li key={i.id} className={`truncate rounded-md px-1 py-0.5 text-[11px] ${meta.chip}`}>
                            {i.entry ? (
                              <button
                                type="button"
                                className="w-full truncate text-left"
                                title="Edit entry"
                                onClick={() => {
                                  setEditEntry(i.entry);
                                  setEntryOpen(true);
                                }}
                              >
                                {body}
                              </button>
                            ) : i.to ? (
                              <Link to={i.to.to} params={i.to.params as never} title={i.title}>
                                {body}
                              </Link>
                            ) : (
                              body
                            )}
                          </li>
                        );
                      })}
                      {dayItems.length > 3 && (
                        <li className="px-1 text-[11px] text-muted-foreground">+{dayItems.length - 3} more</li>
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
            <header className="border-b border-border bg-secondary/60 px-4 py-2.5">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">Up next</h2>
            </header>
            <ul className="divide-y divide-border">
              {upcoming.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing scheduled ahead.</li>
              )}
              {upcoming.map((i) => {
                const meta = KIND_META[i.kind];
                const Icon = meta.icon;
                const inner = (
                  <div className="flex gap-3 px-4 py-3">
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${meta.chip}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{i.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {new Date(`${i.date}T00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        {i.time ? ` · ${i.time}` : ""}
                        {i.subtitle ? ` · ${i.subtitle}` : ""}
                      </p>
                    </div>
                  </div>
                );
                return (
                  <li key={i.id} className="hover:bg-secondary/50">
                    {i.entry ? (
                      <button
                        type="button"
                        className="block w-full text-left"
                        onClick={() => {
                          setEditEntry(i.entry);
                          setEntryOpen(true);
                        }}
                      >
                        {inner}
                      </button>
                    ) : i.to ? (
                      <Link to={i.to.to} params={i.to.params as never} className="block">
                        {inner}
                      </Link>
                    ) : (
                      inner
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </PageBody>
      <CalendarEntryDialog
        key={editEntry?.id ?? "new"}
        open={entryOpen}
        onOpenChange={(v) => {
          setEntryOpen(v);
          if (!v) setEditEntry(undefined);
        }}
        entry={editEntry}
      />
    </AppShell>
  );
}
