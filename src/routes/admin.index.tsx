import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { EyeOff, Eye, RotateCcw, Search, Sparkles, ListChecks } from "lucide-react";

import { PageBody } from "@/components/page-header";
import { OptionsDialog } from "@/components/admin/options-dialog";
import type { AdminField } from "@/lib/admin-config";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth, type ResourceClass } from "@/lib/auth";
import {
  OBJECTS, SENSITIVITY_OPTIONS, adminFields, resetFieldOverride,
  setFieldOverride, useAdminConfig, type ObjectKey,
} from "@/lib/admin-config";

export const Route = createFileRoute("/admin/")({
  component: AdminFieldsPage,
});

function AdminFieldsPage() {
  const { user } = useAuth();
  const { overrides } = useAdminConfig();
  const [object, setObject] = useState<ObjectKey>("company");
  const [q, setQ] = useState("");
  const [onlyCustom, setOnlyCustom] = useState(false);

  const actor = { name: user.name, role: user.role };
  const fields = useMemo(() => adminFields(object, overrides), [object, overrides]);
  const [optDialog, setOptDialog] = useState<{ open: boolean; field: AdminField | null }>({ open: false, field: null });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return fields.filter((f) => {
      if (onlyCustom && !f.customized) return false;
      if (!needle) return true;
      return (
        f.label.toLowerCase().includes(needle) ||
        f.key.toLowerCase().includes(needle) ||
        f.sectionTitle.toLowerCase().includes(needle)
      );
    });
  }, [fields, q, onlyCustom]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const f of filtered) {
      const list = map.get(f.sectionTitle) ?? [];
      list.push(f);
      map.set(f.sectionTitle, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const customCount = fields.filter((f) => f.customized).length;
  const hiddenCount = fields.filter((f) => f.hidden).length;

  return (
    <PageBody>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border bg-surface p-0.5">
            {OBJECTS.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setObject(o.key)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  object === o.key
                    ? "bg-brand text-brand-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search fields by name or key"
              className="pl-9"
            />
          </div>

          <label className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <Switch checked={onlyCustom} onCheckedChange={setOnlyCustom} />
            <span className="text-muted-foreground">Customized only</span>
          </label>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>{fields.length} fields</span>
          <span>·</span>
          <span>{customCount} customized</span>
          <span>·</span>
          <span>{hiddenCount} hidden</span>
        </div>

        {grouped.length === 0 && (
          <div className="rounded-sm border border-border bg-surface px-4 py-10 text-center text-sm text-muted-foreground">
            No fields match this filter.
          </div>
        )}

        {grouped.map(([section, list]) => (
          <section key={section} className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
            <header className="flex items-center justify-between border-b border-border bg-secondary/60 px-4 py-2.5">
              <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">{section}</h3>
              <span className="text-xs text-muted-foreground">{list.length}</span>
            </header>
            <ul className="divide-y divide-border">
              {list.map((f) => (
                <li
                  key={f.key}
                  className={`grid grid-cols-1 gap-3 px-4 py-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_auto] md:items-center ${
                    f.hidden ? "bg-muted/40" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Input
                        value={f.label}
                        onChange={(e) =>
                          setFieldOverride(object, f.key, { label: e.target.value }, actor)
                        }
                        onBlur={(e) => {
                          if (e.target.value !== f.defaultLabel) {
                            setFieldOverride(object, f.key, {}, actor, {
                              action: "Field renamed",
                              before: f.defaultLabel,
                              after: e.target.value,
                            });
                          }
                        }}
                        className="h-8 max-w-[280px] text-sm"
                      />
                      {f.customized && (
                        <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand" aria-label="Customized" />
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <code className="rounded bg-secondary px-1 py-0.5">{f.key}</code>
                      <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal">
                        {f.type}
                      </Badge>
                      {f.required && (
                        <Badge className="h-4 bg-warning px-1.5 text-[10px] text-warning-foreground">
                          Required
                        </Badge>
                      )}
                    </div>
                  </div>

                  <Select
                    value={f.sensitivity}
                    onValueChange={(v) =>
                      setFieldOverride(object, f.key, { sensitivity: v as ResourceClass }, actor, {
                        action: "Field sensitivity changed",
                        before: f.sensitivity,
                        after: v,
                      })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SENSITIVITY_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex items-center justify-end gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Switch
                        checked={f.required}
                        onCheckedChange={(v) =>
                          setFieldOverride(object, f.key, { required: v }, actor, {
                            action: v ? "Field marked required" : "Field marked optional",
                          })
                        }
                      />
                      Required
                    </label>
                    {(f.type === "single_option" || f.type === "multi_option") && (
                      <button
                        type="button"
                        title="Edit options"
                        onClick={() => setOptDialog({ open: true, field: f })}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <ListChecks className="h-3.5 w-3.5" />
                        {(f.options?.length ?? 0)} options
                      </button>
                    )}
                    <button
                      type="button"
                      title={f.hidden ? "Show field" : "Hide field"}
                      onClick={() =>
                        setFieldOverride(object, f.key, { hidden: !f.hidden }, actor, {
                          action: f.hidden ? "Field shown" : "Field hidden",
                        })
                      }
                      className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      {f.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      title="Reset to catalog default"
                      disabled={!f.customized}
                      onClick={() => resetFieldOverride(object, f.key, actor)}
                      className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {optDialog.field && (
        <OptionsDialog
          open={optDialog.open}
          onOpenChange={(v) => setOptDialog((s) => ({ ...s, open: v }))}
          fieldLabel={optDialog.field.label}
          options={optDialog.field.options ?? []}
          defaultOptions={optDialog.field.defaultOptions}
          onSave={(opts) => {
            const fld = optDialog.field;
            if (!fld) return;
            setFieldOverride(object, fld.key, { options: opts }, actor, {
              action: "Field options edited",
              before: String((fld.options ?? []).length),
              after: String(opts.length),
            });
          }}
        />
      )}
    </PageBody>
  );
}
