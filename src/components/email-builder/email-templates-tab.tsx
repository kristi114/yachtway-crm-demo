import { useMemo } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Mail, Plus, Code2, LayoutTemplate, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useEmailTemplatesStore,
  deleteEmailTemplate,
  newTemplateId,
  type EmailTemplate,
} from "@/lib/email-templates";

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

function ModeBadge({ mode }: { mode: EmailTemplate["mode"] }) {
  return mode === "design" ? (
    <Badge className="gap-1 bg-brand/10 text-brand hover:bg-brand/10">
      <LayoutTemplate className="h-3 w-3" /> Designer
    </Badge>
  ) : (
    <Badge variant="secondary" className="gap-1">
      <Code2 className="h-3 w-3" /> HTML
    </Badge>
  );
}

export function EmailTemplatesTab() {
  const store = useEmailTemplatesStore();
  const templates = useMemo(
    () => [...store].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [store],
  );
  const navigate = useNavigate();

  if (templates.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-dashed border-border bg-surface p-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
          <Mail className="h-5 w-5 text-muted-foreground" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">No templates yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Create your first template with the visual designer or by writing HTML.
        </p>
        <Button
          className="mt-4"
          onClick={() => navigate({ to: "/emails/$id", params: { id: newTemplateId() } })}
        >
          <Plus className="h-4 w-4" /> New email
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {templates.map((t) => (
        <div
          key={t.id}
          className="group flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-shadow hover:shadow-sm"
        >
          <Link to="/emails/$id" params={{ id: t.id }} className="flex flex-1 flex-col p-4">
            <div className="flex items-start justify-between gap-2">
              <ModeBadge mode={t.mode} />
              <span className="text-[11px] text-muted-foreground">{relTime(t.updatedAt)}</span>
            </div>
            <h3 className="mt-3 line-clamp-1 text-sm font-semibold">{t.name}</h3>
            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{t.subject}</p>
            <div className="mt-3 flex-1 overflow-hidden rounded border border-border bg-[#f4f5f7]">
              <iframe
                title={`Preview of ${t.name}`}
                sandbox="allow-same-origin"
                tabIndex={-1}
                className="pointer-events-none h-40 w-full origin-top-left"
                srcDoc={t.html}
              />
            </div>
          </Link>
          <div className="flex items-center justify-between border-t border-border px-4 py-2">
            <span className="text-[11px] text-muted-foreground">Updated by {t.updatedBy}</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive"
              onClick={() => {
                if (confirm(`Delete "${t.name}"?`)) deleteEmailTemplate(t.id);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
