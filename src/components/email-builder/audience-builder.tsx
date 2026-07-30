import { useMemo, useState } from "react";
import { Users2, Tag, Building2, Save, Trash2, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RecordFilterBar } from "@/components/record-filter-bar";
import { CONTACT_SECTIONS } from "@/lib/field-schema";
import { FIELD_OPTIONS } from "@/lib/field-options";
import { filterableFields, type FilterClause } from "@/lib/record-filter";
import { useAuth } from "@/lib/auth";
import {
  resolveAudience, contactTagsInUse, companyTagsInUse,
  saveAudience, deleteAudience, useAudiences, isAudienceEmpty,
  type AudienceDef,
} from "@/lib/audiences";

/** All selectable tags: catalog options plus any tag already in use on records. */
function allTags(inUse: string[]): string[] {
  return [...new Set([...(FIELD_OPTIONS.tags ?? []), ...inUse])].sort();
}

function TagPicker({
  label, icon: Icon, options, selected, onToggle,
}: {
  label: string;
  icon: typeof Tag;
  options: string[];
  selected: string[];
  onToggle: (tag: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-xs">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {label}
      </Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((t) => {
          const on = selected.includes(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => onToggle(t)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                on
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Builds an email sending list from contact filters, contact tags and company
 * tags (plus optional hand-typed addresses), with a live recipient count,
 * suppression summary and preview. Lists can be saved and reused.
 */
export function AudienceBuilder({
  value,
  onChange,
}: {
  value: AudienceDef;
  onChange: (next: AudienceDef) => void;
}) {
  const { user } = useAuth();
  const saved = useAudiences();
  const [showPreview, setShowPreview] = useState(false);
  const [listName, setListName] = useState("");
  const filterFields = useMemo(() => filterableFields(CONTACT_SECTIONS), []);
  const contactTagOptions = useMemo(() => allTags(contactTagsInUse()), []);
  const companyTagOptions = useMemo(() => allTags(companyTagsInUse()), []);

  const resolved = useMemo(() => resolveAudience(value), [value]);
  const { members, suppressed } = resolved;
  const suppressedTotal =
    suppressed.noEmail + suppressed.optedOut + suppressed.doNotContact + suppressed.duplicates;

  function patch(p: Partial<AudienceDef>) {
    onChange({ ...value, ...p });
  }
  function toggle(list: string[], tag: string): string[] {
    return list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag];
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-secondary/30 p-3">
      {/* Saved lists */}
      {saved.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">Saved lists</Label>
          <div className="flex flex-wrap gap-1.5">
            {saved.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface pl-2.5 pr-1 text-xs"
              >
                <button
                  type="button"
                  className="py-1 font-medium text-brand hover:underline"
                  onClick={() =>
                    onChange({
                      contactClauses: a.contactClauses,
                      contactTags: a.contactTags,
                      companyTags: a.companyTags,
                      manualEmails: a.manualEmails,
                    })
                  }
                  title="Load this list"
                >
                  {a.name}
                </button>
                <button
                  type="button"
                  onClick={() => deleteAudience(a.id)}
                  title="Delete list"
                  className="rounded p-1 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters over any contact field */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5 text-xs">
          <Users2 className="h-3.5 w-3.5 text-muted-foreground" /> Contact filters
        </Label>
        <RecordFilterBar
          fields={filterFields}
          query=""
          onQueryChange={() => {}}
          clauses={value.contactClauses}
          onClausesChange={(c: FilterClause[]) => patch({ contactClauses: c })}
          searchPlaceholder="Search fields…"
          hideSearch
        />
      </div>

      <TagPicker
        label="Contact tags"
        icon={Tag}
        options={contactTagOptions}
        selected={value.contactTags}
        onToggle={(t) => patch({ contactTags: toggle(value.contactTags, t) })}
      />

      <TagPicker
        label="Company tags (includes every contact at those companies)"
        icon={Building2}
        options={companyTagOptions}
        selected={value.companyTags}
        onToggle={(t) => patch({ companyTags: toggle(value.companyTags, t) })}
      />

      <div className="space-y-1.5">
        <Label htmlFor="aud-manual" className="text-xs">Additional addresses (optional)</Label>
        <Input
          id="aud-manual"
          value={value.manualEmails.join(", ")}
          onChange={(e) =>
            patch({ manualEmails: e.target.value.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean) })
          }
          placeholder="name@example.com, another@example.com"
          className="h-8 text-[13px]"
        />
      </div>

      {/* Live count + suppression summary */}
      <div className="rounded-md border border-border bg-surface px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-brand-deep tabular-nums">
            {members.length} recipient{members.length === 1 ? "" : "s"}
          </span>
          {isAudienceEmpty(value) && (
            <span className="text-xs text-muted-foreground">
              Add a filter, tag or address to build the list.
            </span>
          )}
          {members.length > 0 && (
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
            >
              {showPreview ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Preview
            </button>
          )}
        </div>

        {suppressedTotal > 0 && (
          <div className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <span>
              {suppressedTotal} excluded
              {suppressed.optedOut > 0 && ` · ${suppressed.optedOut} unsubscribed`}
              {suppressed.doNotContact > 0 && ` · ${suppressed.doNotContact} do-not-contact`}
              {suppressed.noEmail > 0 && ` · ${suppressed.noEmail} no email`}
              {suppressed.duplicates > 0 && ` · ${suppressed.duplicates} duplicate`}
            </span>
          </div>
        )}

        {showPreview && members.length > 0 && (
          <ul className="mt-2 max-h-40 divide-y divide-border overflow-y-auto rounded-sm border border-border">
            {members.slice(0, 100).map((m) => (
              <li key={m.email} className="flex items-center gap-2 px-2 py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{m.name}</span>{" "}
                  <span className="text-muted-foreground">{m.email}</span>
                </span>
                {m.companyName && (
                  <span className="hidden shrink-0 text-muted-foreground sm:inline">{m.companyName}</span>
                )}
                <Badge variant="outline" className="shrink-0 text-[10px] font-normal">{m.via}</Badge>
              </li>
            ))}
            {members.length > 100 && (
              <li className="px-2 py-1.5 text-xs text-muted-foreground">
                +{members.length - 100} more…
              </li>
            )}
          </ul>
        )}
      </div>

      {/* Save this list */}
      {!isAudienceEmpty(value) && (
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="aud-name" className="text-xs">Save this list as</Label>
            <Input
              id="aud-name"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              placeholder="e.g. Platinum dealers - newsletter"
              className="h-8 text-[13px]"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!listName.trim()}
            onClick={() => {
              saveAudience(listName, value, user.name);
              setListName("");
            }}
          >
            <Save className="mr-1.5 h-3.5 w-3.5" /> Save
          </Button>
        </div>
      )}
    </div>
  );
}
