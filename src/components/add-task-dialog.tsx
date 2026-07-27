import { useState, type FormEvent } from "react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { addTask } from "@/lib/tasks-log";
import type { RelatedType, Task } from "@/lib/mock-data";

const PRIORITIES: Task["priority"][] = ["Low", "Med", "High"];

function todayInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function AddTaskDialog({
  open,
  onOpenChange,
  relatedType,
  relatedId,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  relatedType: RelatedType;
  relatedId: string;
  onAdded?: () => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(todayInput());
  const [priority, setPriority] = useState<Task["priority"]>("Med");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setTitle("");
    setDueDate(todayInput());
    setPriority("Med");
    setNotes("");
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    addTask({
      relatedType: relatedType,
      relatedId: relatedId,
      title: title.trim(),
      assignee: user.name,
      dueDate: dueDate,
      status: "Open",
      priority,
      notes: notes.trim() || undefined,
    });
    reset();
    onOpenChange(false);
    onAdded?.();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add task</DialogTitle>
          <DialogDescription>
            Create a follow-up task for this account. It shows up in the Tasks tab.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Task</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Send SaaS renewal DocuSign"
              required
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-due">Due date</Label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Task["priority"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-notes">Notes (optional)</Label>
            <Textarea
              id="task-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Context, links, or next-step details"
              rows={3}
            />
          </div>
          <div className="rounded-sm border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
            Assigned to <span className="font-medium text-foreground">{user.name}</span>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim()}>Add task</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
