import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { TASKS, getCompany, getContact, type Task } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EditTaskDialog } from "@/components/edit-task-dialog";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format-date";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function blankTask(assignee: string): Task {
  return {
    id: `task_${Math.random().toString(36).slice(2, 9)}`,
    relatedType: "contact",
    relatedId: "",
    title: "",
    assignee,
    dueDate: todayISO(),
    status: "Open",
    priority: "Med",
    notes: "",
  };
}

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
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>(TASKS);
  const [editing, setEditing] = useState<Task | null>(null);
  const [open, setOpen] = useState(false);

  const today = todayISO();
  const isOverdue = (t: Task) => t.status !== "Done" && !!t.dueDate && t.dueDate < today;

  // Overdue is its own bucket (past-due & not Done), pulled out of Open/In Progress
  // so each task shows once.
  const sections = useMemo(
    () =>
      ({
        Overdue: tasks.filter(isOverdue).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
        Open: tasks.filter((t) => t.status === "Open" && !isOverdue(t)),
        "In Progress": tasks.filter((t) => t.status === "In Progress" && !isOverdue(t)),
        Done: tasks.filter((t) => t.status === "Done"),
      }) as Record<"Overdue" | "Open" | "In Progress" | "Done", Task[]>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, today],
  );

  const openTask = (t: Task) => { setEditing(t); setOpen(true); };
  const createTask = () => { setEditing(blankTask(user.name)); setOpen(true); };
  // Upsert: a brand-new task (id not yet in the list) is inserted; canceling the
  // dialog adds nothing because we only commit on save.
  const saveTask = (patch: Task) =>
    setTasks((prev) => (prev.some((x) => x.id === patch.id) ? prev.map((x) => (x.id === patch.id ? patch : x)) : [patch, ...prev]));
  const deleteTask = (id: string) =>
    setTasks((prev) => prev.filter((x) => x.id !== id));

  return (
    <AppShell>
      <PageHeader
        eyebrow="Tasks"
        title="All tasks"
        subtitle={`${tasks.length} across every record - click any row to edit or reschedule`}
        actions={
          <Button onClick={createTask}>
            <Plus className="h-4 w-4" /> Create task
          </Button>
        }
      />
      <PageBody>
        <div className="space-y-4">
          {(["Overdue", "Open", "In Progress", "Done"] as const).map((section) => {
            const list = sections[section];
            const overdueSection = section === "Overdue";
            return (
              <section key={section} className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
                <header className="flex items-center justify-between border-b border-border bg-secondary/60 px-4 py-2.5">
                  <h3 className={`text-[13px] font-semibold uppercase tracking-wide ${overdueSection ? "text-destructive" : "text-brand-deep"}`}>
                    {section}
                  </h3>
                  <span className={`text-xs ${overdueSection && list.length > 0 ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                    {list.length}
                  </span>
                </header>
                <ul className="divide-y divide-border">
                  {list.length === 0 ? (
                    <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                      {overdueSection ? "Nothing overdue." : "Nothing here."}
                    </li>
                  ) : (
                    <li className="grid grid-cols-[minmax(0,1fr)_120px_88px_120px] items-center gap-3 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <span>Task</span>
                      <span>Due</span>
                      <span>Priority</span>
                      <span>Status</span>
                    </li>
                  )}
                  {list.map((t) => {
                    const co = t.relatedType === "company" ? getCompany(t.relatedId) : null;
                    const ct = t.relatedType === "contact" ? getContact(t.relatedId) : null;
                    const overdue = isOverdue(t);
                    return (
                      <li
                        key={t.id}
                        className="group grid cursor-pointer grid-cols-[minmax(0,1fr)_120px_88px_120px] items-center gap-3 px-4 py-2.5 text-[13px] hover:bg-muted/40"
                        onClick={() => openTask(t)}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 font-medium">
                            <span className="truncate">{t.title}</span>
                            <Pencil className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {t.assignee}
                            {(co || ct) && " · "}
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

                        <div className={`text-xs ${overdue ? "font-semibold text-destructive" : "text-foreground"}`}>
                          {formatDate(t.dueDate)}
                        </div>

                        <div>
                          <span className={`inline-block rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priorityBadge(t.priority)}`}>
                            {t.priority}
                          </span>
                        </div>

                        <div>
                          <Badge variant="outline" className="text-[10px]">{t.status}</Badge>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
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
