import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckSquare, AlertTriangle } from "lucide-react";

import { TASKS, getCompany, getContact, type Task } from "@/lib/mock-data";
import { getTasksSnapshot, updateTaskStatus } from "@/lib/tasks-log";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format-date";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function priorityBadge(p: string) {
  const map: Record<string, string> = {
    High: "bg-destructive text-destructive-foreground",
    Med: "bg-warning text-warning-foreground",
    Low: "bg-muted text-muted-foreground",
  };
  return map[p] ?? "bg-muted text-muted-foreground";
}

/**
 * Home-dashboard panel: the signed-in user's open tasks, split into Overdue and
 * Upcoming. Mirrors the Tasks page scoping (assignee === user.name) so the two
 * views agree. Done tasks are omitted.
 */
export function MyTasksPanel() {
  const { user } = useAuth();
  const today = todayISO();
  // Bumped when a task is completed so the list recomputes and drops it.
  const [tick, setTick] = useState(0);

  const { overdue, upcoming } = useMemo(() => {
    // Store-added tasks + seeded tasks, scoped to the current user, open only.
    const all = [...getTasksSnapshot(), ...TASKS];
    const mine = all.filter((t) => t.assignee === user.name && t.status !== "Done");
    const isOverdue = (t: Task) => !!t.dueDate && t.dueDate < today;
    return {
      overdue: mine.filter(isOverdue).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
      upcoming: mine.filter((t) => !isOverdue(t)).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.name, today, tick]);

  function complete(id: string) {
    updateTaskStatus(id, "Done");
    setTick((n) => n + 1);
  }

  const total = overdue.length + upcoming.length;

  return (
    <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
      <header className="flex items-center justify-between border-b border-border bg-secondary/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-brand" />
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">My tasks</h2>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {overdue.length > 0 && (
            <span className="inline-flex items-center gap-1 font-semibold text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" /> {overdue.length} overdue
            </span>
          )}
          <Link to="/tasks" className="text-brand hover:underline">View all</Link>
        </div>
      </header>

      {total === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">You're all caught up — no open tasks.</p>
      ) : (
        <ul className="divide-y divide-border">
          {[...overdue, ...upcoming].slice(0, 8).map((t) => {
            const co = t.relatedType === "company" ? getCompany(t.relatedId) : null;
            const ct = t.relatedType === "contact" ? getContact(t.relatedId) : null;
            const isOverdue = !!t.dueDate && t.dueDate < today;
            return (
              <li key={t.id} className="grid grid-cols-[20px_minmax(0,1fr)_110px_72px] items-center gap-3 px-4 py-2.5 text-[13px]">
                <button
                  type="button"
                  onClick={() => complete(t.id)}
                  title="Mark as done"
                  aria-label={`Mark "${t.title}" as done`}
                  className="grid h-5 w-5 place-items-center rounded-[5px] border border-border text-transparent transition-colors hover:border-brand hover:bg-brand/10 hover:text-brand"
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                </button>
                <div className="min-w-0">
                  <Link to="/tasks" className="truncate font-medium hover:underline">{t.title}</Link>
                  {(co || ct) && (
                    <div className="truncate text-xs text-muted-foreground">
                      {co && (
                        <Link to="/companies/$id" params={{ id: co.id }} className="text-brand hover:underline">{co.name}</Link>
                      )}
                      {ct && (
                        <Link to="/contacts/$id" params={{ id: ct.id }} className="text-brand hover:underline">{ct.firstName} {ct.lastName}</Link>
                      )}
                    </div>
                  )}
                </div>
                <div className={`text-xs ${isOverdue ? "font-semibold text-destructive" : "text-foreground"}`}>
                  {formatDate(t.dueDate)}
                </div>
                <div>
                  <span className={`inline-block rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priorityBadge(t.priority)}`}>
                    {t.priority}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
