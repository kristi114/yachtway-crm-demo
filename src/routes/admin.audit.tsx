import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { History, ArrowRight } from "lucide-react";

import { PageBody } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS } from "@/lib/auth";
import { useAdminConfig } from "@/lib/admin-config";

export const Route = createFileRoute("/admin/audit")({
  component: AdminAuditPage,
});

function when(iso: string) {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function AdminAuditPage() {
  const { audit } = useAdminConfig();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return audit;
    return audit.filter(
      (e) =>
        e.action.toLowerCase().includes(n) ||
        e.target.toLowerCase().includes(n) ||
        e.actor.toLowerCase().includes(n),
    );
  }, [audit, q]);

  return (
    <PageBody>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by action, record or actor"
            className="max-w-xs"
          />
          <span className="text-xs text-muted-foreground">{filtered.length} entries</span>
        </div>

        <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
          <header className="flex items-center gap-2 border-b border-border bg-secondary/60 px-4 py-2.5">
            <History className="h-4 w-4 text-brand-deep" />
            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
              Audit log
            </h3>
          </header>
          <ul className="divide-y divide-border">
            {filtered.map((e) => (
              <li key={e.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{e.action}</span>
                    <code className="rounded bg-secondary px-1.5 py-0.5 text-[11px]">{e.target}</code>
                  </div>
                  {(e.before || e.after) && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="line-through">{e.before || "empty"}</span>
                      <ArrowRight className="h-3 w-3" />
                      <span className="text-foreground">{e.after || "empty"}</span>
                    </div>
                  )}
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {e.actor}
                    <Badge variant="outline" className="ml-2 h-4 px-1.5 text-[10px] font-normal">
                      {ROLE_LABELS[e.actorRole]}
                    </Badge>
                  </div>
                </div>
                <span className="whitespace-nowrap text-xs text-muted-foreground">{when(e.at)}</span>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                Nothing logged yet.
              </li>
            )}
          </ul>
        </section>
      </div>
    </PageBody>
  );
}
