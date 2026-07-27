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
import { useAuth } from "@/lib/auth";
import {
  addPersonalEntry,
  updatePersonalEntry,
  removePersonalEntry,
  type PersonalEntry,
} from "@/lib/personal-calendar";

function todayInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/** Create / edit a personal calendar entry for the signed-in user. */
export function CalendarEntryDialog({
  open,
  onOpenChange,
  entry,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entry?: PersonalEntry;
  defaultDate?: string;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState(entry?.title ?? "");
  const [date, setDate] = useState(entry?.date ?? defaultDate ?? todayInput());
  const [time, setTime] = useState(entry?.time ?? "09:00");
  const [endTime, setEndTime] = useState(entry?.endTime ?? "");
  const [location, setLocation] = useState(entry?.location ?? "");
  const [notes, setNotes] = useState(entry?.notes ?? "");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) return;
    if (entry) {
      updatePersonalEntry(entry.id, { title: title.trim(), date, time, endTime, location, notes });
    } else {
      addPersonalEntry({
        userId: user.id,
        title: title.trim(),
        date,
        time,
        endTime,
        location,
        notes,
      });
      setTitle("");
      setLocation("");
      setNotes("");
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry ? "Edit calendar entry" : "New calendar entry"}</DialogTitle>
          <DialogDescription>
            Personal entries show on your calendar only - meetings, travel or blocked time.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cal-title">Title</Label>
            <Input
              id="cal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="1:1 with Kristi"
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="cal-date">Date</Label>
              <Input id="cal-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cal-time">Start</Label>
              <Input id="cal-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cal-end">End</Label>
              <Input id="cal-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cal-location">Location</Label>
            <Input
              id="cal-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Zoom / Fort Lauderdale"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cal-notes">Notes</Label>
            <Textarea id="cal-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <DialogFooter className="gap-2">
            {entry && (
              <Button
                type="button"
                variant="ghost"
                className="mr-auto text-destructive"
                onClick={() => {
                  removePersonalEntry(entry.id);
                  onOpenChange(false);
                }}
              >
                Delete
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{entry ? "Save" : "Add to calendar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
