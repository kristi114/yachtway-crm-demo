import { useEffect, useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, RotateCcw } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * View / edit the option list for a single_option or multi_option field.
 * Add, rename, remove and reorder — with a reset to the schema defaults.
 */
export function OptionsDialog({
  open,
  onOpenChange,
  fieldLabel,
  options,
  defaultOptions,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fieldLabel: string;
  options: string[];
  defaultOptions?: string[];
  onSave: (opts: string[]) => void;
}) {
  const [list, setList] = useState<string[]>(options);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (open) {
      setList(options);
      setDraft("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  };
  const addOption = () => {
    const v = draft.trim();
    if (!v || list.includes(v)) return;
    setList([...list, v]);
    setDraft("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Options — {fieldLabel}</DialogTitle>
          <DialogDescription>Manage the values available for this picklist.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {list.length === 0 && (
            <p className="rounded border border-dashed border-border p-3 text-center text-sm text-muted-foreground">
              No options yet — add the first value below.
            </p>
          )}
          {list.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 text-right text-xs text-muted-foreground">{i + 1}</span>
              <Input
                value={opt}
                onChange={(e) => setList(list.map((o, k) => (k === i ? e.target.value : o)))}
                className="h-8 flex-1"
              />
              <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} title="Move up">
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30" disabled={i === list.length - 1} onClick={() => move(i, 1)} title="Move down">
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive" onClick={() => setList(list.filter((_, k) => k !== i))} title="Remove">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-border pt-3">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addOption();
              }
            }}
            placeholder="New option value"
            className="h-8"
          />
          <Button type="button" variant="outline" size="sm" onClick={addOption}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>

        <DialogFooter className="items-center justify-between sm:justify-between">
          {defaultOptions && defaultOptions.length > 0 ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setList([...defaultOptions])}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                onSave(list.map((o) => o.trim()).filter(Boolean));
                onOpenChange(false);
              }}
            >
              Save options
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
