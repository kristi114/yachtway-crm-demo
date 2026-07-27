import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { TASKS, getCompany, getContact, type Task } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";
import { EditTaskDialog } from "@/components/edit-task-dialog";

export const Route = createFileRoute("/tasks/")({
  component: TasksPage,
});

function priorityBadge(p: string) {
  const map: Record<string, string> = {
    High: "bg-destructive text-destructive-foreground",
    Med: "bg-warning text-warning-foreground",
    Low: "bg-muted text-muted-foreground",
  };
  return map[p] ?? "bg-muted text-muted-foreground";
}

function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>(TASKS);
  const [editing, setEditing] = useState<Task | null>(null);
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => {
    const g: Record<Task["status"], Task[]> = { Open: [], "In Progress": [], Done: [] };
    for (const t of tasks) g[t.status].push(t);
    return g;
  }, [tasks]);

  const openTask = (t: Task) => { setEditing(t); setOpen(true); };
  const saveTask = (patch: Task) =>
    setTasks((prev) => prev.map((x) => (x.id === patch.id ? patch : x)));
  const deleteTask = (id: string) =>
    setTasks((prev) => prev.filter((x) => x.id !== id));

  return (
    <AppShell>
      <PageHeader
        eyebrow="Tasks"
        title="All tasks"
        subtitle={`${tasks.length} across every record - click any row to edit or reschedule`}
      />
      <PageBody>
        <div className="space-y-4">
          {(["Open", "In Progress", "Done"] as const).map((status) => (
            <section key={status} className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
              <header className="flex items-center justify-between border-b border-border bg-secondary/60 px-4 py-2.5">
                <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
                  {status}
                </h3>
                <span className="text-xs text-muted-foreground">{grouped[status].length}</span>
              </header>
              <ul className="divide-y divide-border">
                {grouped[status].length === 0 && (
                  <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Nothing here.
                  </li>
                )}
                {grouped[status].map((t) => {
                  const co = t.relatedType === "company" ? getCompany(t.relatedId) : null;
                  const ct = t.relatedType === "contact" ? getContact(t.relatedId) : null;
                  return (
                    <li
                      key={t.id}
                      className="group flex cursor-pointer items-center justify-between px-4 py-2.5 text-[13px] hover:bg-muted/40"
                      onClick={() => openTask(t)}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-medium">
                          {t.title}
                          <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t.assignee} · Due {t.dueDate} ·{" "}
                          {co && (
                            <Link
                              to="/companies/$id"
                              params={{ id: co.id }}
                              className="text-brand hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {co.name}
                            </Link>
                          )}
                          {ct && (
                            <Link
                              to="/contacts/$id"
                              params={{ id: ct.id }}
                              className="text-brand hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {ct.firstName} {ct.lastName}
                            </Link>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priorityBadge(t.priority)}`}>
                          {t.priority}
                        </span>
                        <Badge variant="outline" className="text-[10px]">{t.status}</Badge>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </PageBody>

      <EditTaskDialog
        task={editing}
        open={open}
        onOpenChange={setOpen}
        onSave={saveTask}
        onDelete={deleteTask}
      />
    </AppShell>
  );
}
