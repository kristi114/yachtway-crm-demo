import { useEffect, useState } from "react";
import type { Task } from "@/lib/mock-data";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: Task) => void;
  onDelete?: (id: string) => void;
}

export function EditTaskDialog({ task, open, onOpenChange, onSave, onDelete }: Props) {
  const [draft, setDraft] = useState<Task | null>(task);

  useEffect(() => { setDraft(task); }, [task]);

  if (!draft) return null;

  const update = <K extends keyof Task>(k: K) => (v: Task[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
          <DialogDescription>Adjust title, owner, deadline, priority or status.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="t-title">Title</Label>
            <Input
              id="t-title"
              value={draft.title}
              onChange={(e) => update("title")(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-assignee">Assignee</Label>
              <Input
                id="t-assignee"
                value={draft.assignee}
                onChange={(e) => update("assignee")(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-due">Due date</Label>
              <Input
                id="t-due"
                type="date"
                value={draft.dueDate}
                onChange={(e) => update("dueDate")(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={draft.status} onValueChange={(v) => update("status")(v as Task["status"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Open">Open</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={draft.priority} onValueChange={(v) => update("priority")(v as Task["priority"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Med">Med</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="t-notes">Notes</Label>
            <Textarea
              id="t-notes"
              rows={6}
              placeholder="Context, blockers, follow-ups..."
              value={draft.notes ?? ""}
              onChange={(e) => update("notes")(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          {onDelete ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => { onDelete(draft.id); onOpenChange(false); }}
            >
              Delete
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="button" onClick={() => { onSave(draft); onOpenChange(false); }}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
