import { useEffect, useMemo, useState } from "react";
import { Camera, MapPin, User, Phone, Pencil, Users } from "lucide-react";
import { BoatIcon } from "@/components/icons/boat-icon";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

import {
  upcomingStudioBookingsForOwner, getCompany, type StudioBooking,
} from "@/lib/mock-data";

const PACKAGES: StudioBooking["package"][] = ["3D Tour", "Full Shoot", "LIVE Session", "Drone + 3D"];
const STATUSES: StudioBooking["status"][] = ["Confirmed", "Tentative", "Reschedule requested"];
// Social Media team - internal YachtWay staff who cover Studio shoots.
const STUDIO_TEAM = ["Jules Rodrigues", "Andrii Ignatov"] as const;

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function statusTone(s: StudioBooking["status"]) {
  if (s === "Confirmed") return "bg-success text-success-foreground";
  if (s === "Tentative") return "bg-warning text-warning-foreground";
  return "bg-destructive text-destructive-foreground";
}

export function StudioBookingsPanel({ userId }: { userId: string }) {
  const initial = useMemo(() => upcomingStudioBookingsForOwner(userId), [userId]);
  const [bookings, setBookings] = useState<StudioBooking[]>(initial);
  const [editing, setEditing] = useState<StudioBooking | null>(null);
  const [open, setOpen] = useState(false);

  const save = (patch: StudioBooking) =>
    setBookings((prev) => prev.map((b) => (b.id === patch.id ? patch : b)));

  return (
    <section className="mt-4 overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
      <header className="flex items-center justify-between border-b border-border bg-secondary/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-brand" />
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
            Upcoming Studio bookings
          </h3>
          <Badge variant="outline" className="text-[10px]">{bookings.length}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          Confirmed shoots for accounts you own. Click any row to edit vessel, dock or crew notes.
        </span>
      </header>

      {bookings.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
          No upcoming shoots on your book. Pitch a Studio session to a lapsed dealer.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {bookings.map((b) => {
            const co = getCompany(b.companyId);
            return (
              <li
                key={b.id}
                onClick={() => { setEditing(b); setOpen(true); }}
                className="group grid cursor-pointer grid-cols-1 gap-2 px-4 py-3 text-[13px] hover:bg-muted/40 md:grid-cols-[1.4fr_1fr_1fr_auto]"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-medium">
                    <BoatIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate">{b.vessel}</span>
                    <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {co?.name ?? "Unknown dealer"} · {b.package}
                  </div>
                </div>

                <div className="min-w-0 text-xs">
                  <div className="font-medium text-foreground">{formatWhen(b.scheduledAt)}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{b.location}</span>
                  </div>
                </div>

                <div className="min-w-0 text-xs">
                  <div className="flex items-center gap-1 font-medium text-foreground">
                    <Camera className="h-3 w-3" /> {b.photographer}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-muted-foreground">
                    <Users className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {b.crew.length ? b.crew.join(", ") : "solo shoot"}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-muted-foreground">
                    <User className="h-3 w-3" /> {b.contactName}
                    <Phone className="ml-1 h-3 w-3" /> {b.contactPhone}
                  </div>
                </div>

                <div className="flex items-start md:justify-end">
                  <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusTone(b.status)}`}>
                    {b.status}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <EditBookingDialog
        booking={editing}
        open={open}
        onOpenChange={setOpen}
        onSave={save}
      />
    </section>
  );
}

function EditBookingDialog({
  booking, open, onOpenChange, onSave,
}: {
  booking: StudioBooking | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: (b: StudioBooking) => void;
}) {
  const [draft, setDraft] = useState<StudioBooking | null>(booking);
  useEffect(() => { setDraft(booking); }, [booking]);
  if (!draft) return null;

  const update = <K extends keyof StudioBooking>(k: K) => (v: StudioBooking[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  // datetime-local expects "YYYY-MM-DDTHH:mm"
  const dtValue = draft.scheduledAt.slice(0, 16);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit Studio booking</DialogTitle>
          <DialogDescription>
            Update details for the internal team - vessel, dock, crew or on-day contact.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="sb-vessel">Vessel / listing</Label>
            <Input id="sb-vessel" value={draft.vessel} onChange={(e) => update("vessel")(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sb-when">Scheduled at</Label>
              <Input
                id="sb-when" type="datetime-local" value={dtValue}
                onChange={(e) => update("scheduledAt")(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sb-dur">Duration (h)</Label>
              <Input
                id="sb-dur" type="number" min={0.5} step={0.5} value={draft.durationHours}
                onChange={(e) => update("durationHours")(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sb-loc">Location</Label>
            <Input id="sb-loc" value={draft.location} onChange={(e) => update("location")(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sb-photog">Photographer</Label>
              <Select value={draft.photographer} onValueChange={(v) => update("photographer")(v)}>
                <SelectTrigger id="sb-photog"><SelectValue placeholder="Assign team member" /></SelectTrigger>
                <SelectContent>
                  {STUDIO_TEAM.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sb-crew">Extra crew</Label>
              <div className="flex flex-wrap gap-3 rounded-md border border-input bg-background px-3 py-2">
                {STUDIO_TEAM.map((n) => {
                  const checked = draft.crew.includes(n);
                  return (
                    <label key={n} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={draft.photographer === n}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...draft.crew, n]
                            : draft.crew.filter((c) => c !== n);
                          update("crew")(next);
                        }}
                      />
                      {n}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sb-cn">On-day contact</Label>
              <Input id="sb-cn" value={draft.contactName} onChange={(e) => update("contactName")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sb-cp">Contact phone</Label>
              <Input id="sb-cp" value={draft.contactPhone} onChange={(e) => update("contactPhone")(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Package</Label>
              <Select value={draft.package} onValueChange={(v) => update("package")(v as StudioBooking["package"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PACKAGES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={draft.status} onValueChange={(v) => update("status")(v as StudioBooking["status"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sb-notes">Internal notes</Label>
            <Textarea
              id="sb-notes" rows={3} value={draft.notes}
              onChange={(e) => update("notes")(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { onSave(draft); onOpenChange(false); }}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
