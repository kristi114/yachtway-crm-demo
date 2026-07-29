import { formatDate, formatDateTime } from "@/lib/format-date";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  StickyNote, CheckSquare, Calendar, Briefcase, Plus, Mail,
  ArrowDownLeft, ArrowUpRight, MessageSquare, Phone, MessageCircle, CalendarDays,
  Lock, Users2, Globe2, MessagesSquare, ExternalLink, Pencil, ChevronDown, ShieldAlert, EyeOff,
} from "lucide-react";

import type { Note, NoteVisibility, RelatedType } from "@/lib/mock-data";
import { activitiesFor, getCompany } from "@/lib/mock-data";
import { useMoney, useAuth } from "@/lib/auth";
import {
  canEditNote, canViewNote, restrictedReason, toNoteViewer,
  VISIBILITY_OPTIONS, canCreateSecureNote,
} from "@/lib/note-access";
import {
  commsFor, subscribeComms, getCommsSnapshot,
  filterForChannel, updateCommsLogEntry,
  type CommsChannel, type CommsFilter, type CommsLogEntry,
} from "@/lib/comms-log";
import { tasksFor, subscribeTasks, getTasksSnapshot, updateTaskStatus } from "@/lib/tasks-log";
import { transactionalCommsForContact } from "@/lib/email-recipients";
import { useSentLog } from "@/lib/email-send";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LogCommsDialog } from "@/components/log-comms-dialog";
import { AddTaskDialog } from "@/components/add-task-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Tab = "comms" | "notes" | "emails" | "tasks" | "events" | "opportunities";

type EditableNote = {
  id: string;
  source: "comms" | "seed";
  author: string;
  visibility: NoteVisibility;
  createdAt: string;
  body: string;
  sortKey: string;
};

const COMMS_ICON: Record<CommsChannel, typeof Mail> = {
  Email: Mail,
  Call: Phone,
  SMS: MessageSquare,
  WhatsApp: MessageCircle,
  Meeting: CalendarDays,
  Note: StickyNote,
  Chat: MessagesSquare,
};

const COMMS_FILTERS: { id: CommsFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "emails", label: "Emails" },
  { id: "messaging", label: "iMessage / SMS" },
  { id: "calls", label: "Calls" },
  { id: "chats", label: "Chats" },
  { id: "crisp", label: "Crisp" },
];


function fmtDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function priorityBadge(p: string) {
  const map: Record<string, string> = {
    High: "bg-destructive text-destructive-foreground",
    Med: "bg-warning text-warning-foreground",
    Low: "bg-muted text-muted-foreground",
  };
  return map[p] ?? "bg-muted text-muted-foreground";
}

export function ActivityPanel({
  type,
  id,
}: {
  type: RelatedType;
  id: string;
}) {
  const [commsFilter, setCommsFilter] = useState<CommsFilter>("all");
  const [logOpen, setLogOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<EditableNote | null>(null);
  const [, refreshSeedNotes] = useState(0);
  const { format: fmtMoney } = useMoney();
  const { user, can } = useAuth();
  const viewer = useMemo(() => toNoteViewer(user), [user]);
  // Subscribe to in-memory stores so newly added items appear immediately.
  useSyncExternalStore(subscribeComms, getCommsSnapshot, getCommsSnapshot);
  useSyncExternalStore(subscribeTasks, getTasksSnapshot, getTasksSnapshot);
  useSentLog(); // re-render when sends change (transactional email flows into the timeline)
  // Transactional (Gmail) emails sent to this contact surface in the interaction
  // timeline alongside logged calls/chats. System (SES) and marketing (Mailgun)
  // email is intentionally excluded here - it lives in the Emails tab.
  const commsBase = commsFor(type, id);
  const comms = type === "contact"
    ? [...commsBase, ...transactionalCommsForContact(id)].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))
    : commsBase;
  const { notes, events, opportunities } = activitiesFor(type, id);
  const tasks = tasksFor(type, id);
  // Notes count includes internal notes logged via the Comms dialog.
  const noteCommsCount = comms.filter((c) => c.channel === "Note").length;

  const commsCounts = useMemo(() => {
    const c = { all: 0, emails: 0, messaging: 0, calls: 0, chats: 0, crisp: 0 } as Record<CommsFilter, number>;
    for (const e of comms) {
      if (e.channel === "Note") continue; // notes live in their own tab
      c.all += 1;
      const bucket = filterForChannel(e.channel);
      if (bucket !== "notes") c[bucket] += 1;
      if (e.channel === "Chat" && e.chat_provider === "Crisp") c.crisp += 1;
    }
    return c;
  }, [comms]);

  const visibleComms = useMemo(() => {
    const nonNotes = comms.filter((e) => e.channel !== "Note");
    if (commsFilter === "all") return nonNotes;
    if (commsFilter === "crisp") return nonNotes.filter((e) => e.channel === "Chat" && e.chat_provider === "Crisp");
    return nonNotes.filter((e) => filterForChannel(e.channel) === commsFilter);
  }, [comms, commsFilter]);


  const notesCount = notes.length + noteCommsCount;

  function saveNote(note: EditableNote) {
    if (note.source === "comms") {
      updateCommsLogEntry(note.id, { body: note.body.trim(), visibility: note.visibility });
      return;
    }

    const seeded = notes.find((n: Note) => n.id === note.id);
    if (seeded) {
      seeded.body = note.body.trim();
      seeded.visibility = note.visibility;
      refreshSeedNotes((v) => v + 1);
    }
  }


  const noteComms = comms.filter((c) => c.channel === "Note");
  const mergedNotes: EditableNote[] = [
    ...noteComms.map((c) => ({
      id: c.id,
      source: "comms" as const,
      author: c.author,
      visibility: c.visibility ?? "team",
      createdAt: fmtDateTime(c.occurred_at),
      body: c.body,
      sortKey: c.occurred_at,
    })),
    ...notes.map((n) => ({
      id: n.id,
      source: "seed" as const,
      author: n.author,
      visibility: n.visibility,
      createdAt: n.createdAt,
      body: n.body,
      sortKey: n.createdAt,
    })),
  ].sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1));

  return (
    <section className="@container overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-border bg-secondary/60 px-3 py-2.5">
        <div className="flex items-center gap-2 text-base font-semibold text-brand-deep">
          <MessageSquare className="h-5 w-5" /> Activity
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 px-2 text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setTaskOpen(true)}
            title="Add task"
          >
            <CheckSquare className="h-4 w-4" /> Task
          </Button>
          <Button
            size="sm"
            variant="default"
            className="h-8 gap-1.5 text-sm"
            onClick={() => setLogOpen(true)}
          >
            <Plus className="h-4 w-4" /> Log activity
          </Button>
        </div>
      </header>

      {can("opportunity.general") && (
      <Section title="Opportunities" icon={Briefcase} count={opportunities.length}>
        <div className="divide-y divide-border">
          {opportunities.length === 0 ? <Empty label="opportunities" /> : opportunities.map((o) => (
            <div key={o.id} className="px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold">{o.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {o.pipeline} · {o.stage} · Owner: {o.owner}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-base tabular-nums font-semibold">{fmtMoney(o.amountUsd, o.companyId ? getCompany(o.companyId)?.currency : undefined)}</div>
                  <div className="text-sm text-muted-foreground">Close {formatDate(o.closeDate)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>
      )}

      <Section title="Comms" icon={MessageSquare} count={commsCounts.all}>
        <div className="flex items-center gap-2 border-b border-border bg-background/40 px-3 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Filter
          </span>
          <div className="inline-flex items-center rounded-md border border-border bg-background p-0.5">
            {COMMS_FILTERS.map((f) => {
              const on = commsFilter === f.id;
              const count = commsCounts[f.id];
              return (
                <button
                  key={f.id}
                  onClick={() => setCommsFilter(f.id)}
                  className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors ${
                    on
                      ? "bg-brand text-brand-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span>{f.label}</span>
                  {count > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-xs leading-none tabular-nums ${
                        on ? "bg-brand-foreground/20 text-brand-foreground" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="divide-y divide-border">
          {visibleComms.length === 0 ? (
            <div className="px-4 py-8 text-center text-base text-muted-foreground">
              {commsCounts.all === 0 ? (
                <>
                  No logged communications yet.{" "}
                  <button className="font-medium text-brand hover:underline" onClick={() => setLogOpen(true)}>
                    Log the first one
                  </button>
                  .
                </>
              ) : (
                <>Nothing in this view.</>
              )}
            </div>
          ) : (
            visibleComms.map((c) => <CommsRow key={c.id} entry={c} />)
          )}
        </div>
      </Section>

      <Section title="Notes" icon={StickyNote} count={notesCount}>
        <div className="divide-y divide-border">
          {mergedNotes.length === 0 ? (
            <Empty label="notes" />
          ) : (
            mergedNotes.map((n) => {
              const visible = canViewNote(n.visibility, n.author, viewer);
              const editable = visible && canEditNote(n.visibility, n.author, viewer);
              return (
              <div key={n.id} className="px-4 py-3 transition-colors hover:bg-background/40">
                <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-brand-deep">{n.author}</span>
                    {n.visibility && <VisibilityBadge visibility={n.visibility} />}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-muted-foreground">{formatDate(n.createdAt)}</span>
                    {editable && (
                      <button
                        type="button"
                        onClick={() => setEditingNote(n)}
                        className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium text-brand hover:bg-brand/10 hover:text-brand-deep"
                        title="Open / edit note"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                    )}
                  </div>
                </div>
                {visible ? (
                  <p className="mt-1.5 whitespace-pre-wrap text-base text-foreground">{n.body}</p>
                ) : (
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm italic text-muted-foreground">
                    <EyeOff className="h-4 w-4 shrink-0" />
                    {restrictedReason(n.visibility)}
                  </p>
                )}
              </div>
              );
            })
          )}
        </div>
      </Section>

      <Section title="Tasks" icon={CheckSquare} count={tasks.length}>
        <div className="divide-y divide-border">
          {tasks.length === 0 ? (
            <div className="px-4 py-8 text-center text-base text-muted-foreground">
              No tasks yet.{" "}
              <button className="font-medium text-brand hover:underline" onClick={() => setTaskOpen(true)}>
                Add the first one
              </button>
              .
            </div>
          ) : tasks.map((t) => {
            const done = t.status === "Done";
            return (
              <div key={t.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div className="flex min-w-0 items-start gap-2">
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={(e) => updateTaskStatus(t.id, e.target.checked ? "Done" : "Open")}
                    className="mt-1 h-4 w-4 shrink-0 accent-brand"
                    aria-label={done ? "Mark as open" : "Mark as done"}
                  />
                  <div className="min-w-0">
                    <div className={`text-base font-medium ${done ? "text-muted-foreground line-through" : ""}`}>
                      {t.title}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {t.assignee} · Due {formatDate(t.dueDate)}
                      {t.notes ? ` · ${t.notes}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-sm px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${priorityBadge(t.priority)}`}>
                    {t.priority}
                  </span>
                  <Badge variant="outline" className="text-xs">{t.status}</Badge>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Events" icon={Calendar} count={events.length}>
        <div className="divide-y divide-border">
          {events.length === 0 ? <Empty label="events" /> : events.map((e) => (
            <div key={e.id} className="px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <div className="text-base font-medium">{e.title}</div>
                <div className="text-sm text-muted-foreground">
                  {e.startAt.replace("T", " · ")}
                </div>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {e.location} · {e.attendees.join(", ")}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <LogCommsDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        relatedType={type}
        relatedId={id}
      />
      <AddTaskDialog
        open={taskOpen}
        onOpenChange={setTaskOpen}
        relatedType={type}
        relatedId={id}
      />
      <EditNoteDialog
        note={editingNote}
        open={Boolean(editingNote)}
        onOpenChange={(open) => { if (!open) setEditingNote(null); }}
        onSave={saveNote}
      />
    </section>
  );
}

function Section({
  title,
  icon: Icon,
  count,
  children,
}: {
  title: string;
  icon: typeof StickyNote;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(count > 0);
  return (
    <div className="border-t border-border first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 bg-background/40 px-3 py-2.5 text-left text-sm font-semibold text-brand-deep transition-colors hover:bg-background/60"
      >
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
        <Icon className="h-4 w-4 shrink-0" />
        <span>{title}</span>
        {count > 0 && (
          <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium leading-none tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}



function EditNoteDialog({
  note,
  open,
  onOpenChange,
  onSave,
}: {
  note: EditableNote | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (note: EditableNote) => void;
}) {
  const { user } = useAuth();
  const allowSecure = canCreateSecureNote(toNoteViewer(user));
  const [draft, setDraft] = useState<EditableNote | null>(note);

  useEffect(() => {
    setDraft(note);
  }, [note]);

  if (!draft) return null;

  const canSave = draft.body.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit note</DialogTitle>
          <DialogDescription>
            Update the note text or visibility.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-sm border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{draft.author}</span> · {formatDateTime(draft.createdAt)}
          </div>

          <div>
            <Label htmlFor="note-body" className="mb-1.5 block text-sm uppercase tracking-wide text-muted-foreground">
              Note
            </Label>
            <Textarea
              id="note-body"
              value={draft.body}
              onChange={(e) => setDraft((d) => (d ? { ...d, body: e.target.value } : d))}
              rows={8}
              maxLength={2000}
              autoFocus
            />
          </div>

          <div>
            <Label className="mb-1.5 block text-sm uppercase tracking-wide text-muted-foreground">
              Visibility
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {VISIBILITY_OPTIONS.filter(
                (opt) => opt.id !== "secure" || allowSecure || draft.visibility === "secure",
              ).map((opt) => {
                const on = draft.visibility === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDraft((d) => (d ? { ...d, visibility: opt.id } : d))}
                    className={`flex flex-col items-start rounded-sm border px-2.5 py-1.5 text-sm font-medium ${
                      on
                        ? "border-brand bg-brand text-brand-foreground"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span>{opt.label}</span>
                    <span className={`text-xs ${on ? "text-brand-foreground/80" : "text-muted-foreground"}`}>
                      {opt.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSave}
            onClick={() => {
              if (!canSave) return;
              onSave({ ...draft, body: draft.body.trim() });
              onOpenChange(false);
            }}
          >
            Save note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function Empty({ label }: { label: string }) {
  return (
    <div className="px-4 py-8 text-center text-base text-muted-foreground">
      No {label} yet.
    </div>
  );
}

function CommsRow({ entry: c }: { entry: CommsLogEntry }) {
  const [open, setOpen] = useState(false);
  const Icon = COMMS_ICON[c.channel];
  const DirIcon = c.direction === "inbound" ? ArrowDownLeft : c.direction === "outbound" ? ArrowUpRight : null;
  const isChat = c.channel === "Chat";
  const transcript = c.chat_transcript ?? [];

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 text-sm">
        <Icon className="h-4 w-4 text-brand" />
        <span className="font-semibold uppercase tracking-wide text-brand-deep">
          {isChat && c.chat_provider ? `${c.chat_provider} chat` : c.channel}
        </span>
        {DirIcon && <DirIcon className={`h-3.5 w-3.5 ${c.direction === "inbound" ? "text-brand" : "text-muted-foreground"}`} />}
        {c.channel === "Email" && (
          <span className="rounded-full bg-brand/10 px-1.5 py-0.5 text-xs font-medium text-brand-deep">
            {c.email_provider === "gmail" || !c.email_provider ? "Gmail" : c.email_provider} · transactional
          </span>
        )}
        {c.channel === "Note" && c.visibility && <VisibilityBadge visibility={c.visibility} />}
        {c.contactName && <span className="text-muted-foreground">· {c.contactName}</span>}
        {isChat && c.chat_matched_by && (
          <span className="rounded-full bg-brand/10 px-1.5 py-0.5 text-xs font-medium text-brand-deep">
            matched by {c.chat_matched_by.replace("_", " ")}
          </span>
        )}
        <span className="ml-auto text-muted-foreground">{fmtDateTime(c.occurred_at)}</span>
      </div>
      {c.subject && (
        <div className="mt-1.5 text-base font-medium text-foreground">{c.subject}</div>
      )}
      <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground/90">{c.body}</p>

      {isChat && transcript.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-xs font-medium text-brand hover:underline"
          >
            {open ? "Hide" : "Show"} full transcript ({transcript.length} messages)
          </button>
          {open && (
            <div className="mt-2 space-y-1.5 rounded-sm border border-border bg-background/50 p-2">
              {transcript.map((m, i) => (
                <div key={i} className="flex gap-2 text-sm">
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold uppercase ${
                      m.from === "visitor"
                        ? "bg-brand/15 text-brand-deep"
                        : m.from === "agent"
                        ? "bg-muted text-foreground"
                        : "bg-warning/15 text-warning"
                    }`}
                  >
                    {m.from}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted-foreground">
                      {m.author} · {fmtDateTime(m.at)}
                    </div>
                    <div className="whitespace-pre-wrap text-foreground/90">{m.text}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        <span>Logged by {c.author}</span>
        {c.follow_up_at && (
          <span className="rounded-sm bg-warning/15 px-1.5 py-0.5 font-medium text-warning">
            Follow up {formatDate(c.follow_up_at)}
          </span>
        )}
        {isChat && c.chat_url && (
          <a
            href={c.chat_url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 font-medium text-brand hover:underline"
          >
            Open in Crisp <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

const VISIBILITY_META: Record<NoteVisibility, { icon: typeof Lock; label: string; className: string }> = {
  private: { icon: Lock, label: "Private", className: "bg-destructive/10 text-destructive" },
  team: { icon: Users2, label: "Team", className: "bg-brand/10 text-brand-deep" },
  public: { icon: Globe2, label: "Public", className: "bg-muted text-muted-foreground" },
  secure: { icon: ShieldAlert, label: "Secure", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
};

function VisibilityBadge({ visibility }: { visibility: NoteVisibility }) {
  const meta = VISIBILITY_META[visibility];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${meta.className}`}>
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}

