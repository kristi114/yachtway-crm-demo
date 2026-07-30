import { useState } from "react";
import { Braces, Copy, Check, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  MERGE_TAG_GROUPS, mergeTagsByGroup, tagToken, unknownTagsIn,
} from "@/lib/merge-tags";

/**
 * Merge-tag picker. Click a tag to insert it (into the focused field, via the
 * `onInsert` callback) or copy it to paste into the designer/HTML.
 */
export function MergeTagHelper({
  onInsert,
  label = "Merge tags",
}: {
  /** Called with the token, e.g. "{{first_name}}". Omit to make it copy-only. */
  onInsert?: (token: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  function copy(token: string) {
    void navigator.clipboard?.writeText(token);
    setCopied(token);
    window.setTimeout(() => setCopied((c) => (c === token ? null : c)), 1200);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <Braces className="h-3.5 w-3.5" /> {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[26rem] w-80 overflow-y-auto p-0">
        <div className="border-b border-border px-3 py-2">
          <div className="text-xs font-semibold">Insert a merge tag</div>
          <p className="text-[11px] text-muted-foreground">
            Personalised per recipient. Blank values use a safe fallback.
          </p>
        </div>
        {MERGE_TAG_GROUPS.map((group) => (
          <div key={group} className="border-b border-border last:border-b-0">
            <div className="bg-secondary/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group}
            </div>
            <ul>
              {mergeTagsByGroup(group).map((t) => {
                const token = tagToken(t.tag);
                return (
                  <li key={t.tag} className="flex items-center gap-2 px-3 py-1.5 hover:bg-accent/40">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        if (onInsert) { onInsert(token); setOpen(false); } else { copy(token); }
                      }}
                      title={onInsert ? `Insert ${token}` : `Copy ${token}`}
                    >
                      <div className="truncate text-xs font-medium">{t.label}</div>
                      <div className="truncate font-mono text-[10px] text-brand">{token}</div>
                      <div className="truncate text-[10px] text-muted-foreground">e.g. {t.sample}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => copy(token)}
                      title="Copy"
                      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      {copied === token ? (
                        <Check className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** Warns about `{{tags}}` that aren't in the known list (usually typos). */
export function UnknownTagWarning({ text }: { text: string }) {
  const unknown = unknownTagsIn(text);
  if (unknown.length === 0) return null;
  return (
    <p className="flex items-start gap-1.5 text-[11px] text-warning">
      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
      <span>
        Unrecognised tag{unknown.length === 1 ? "" : "s"}:{" "}
        <span className="font-mono">{unknown.map((t) => `{{${t}}}`).join(", ")}</span> — will send as
        written.
      </span>
    </p>
  );
}
