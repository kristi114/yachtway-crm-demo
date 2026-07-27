import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  BOAT_SHOWS, BOAT_SHOW_REGIONS, EVENT_TYPES, EVENT_TIME_ZONES, EVENT_VISIBILITY,
  addEvent, updateEvent,
  type DealerEvent, type EventType, type EventVisibility, type NewDealerEvent,
} from "@/lib/events";
import { COMPANIES } from "@/lib/mock-data";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Locks the dealer selector when opened from a company profile. */
  companyId?: string;
  event?: DealerEvent;
  onSaved?: (id: string) => void;
};

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

function emptyEvent(companyId?: string): NewDealerEvent {
  const company = companyId ? COMPANIES.find((c) => c.id === companyId) : undefined;
  const today = new Date().toISOString().slice(0, 10);
  return {
    dealerId: company?.id ?? "",
    dealerName: company?.name ?? "",
    eventName: "",
    eventType: "Dealer onboarding",
    boatShowName: null,
    eventDetails: "",
    eventStartDate: today,
    eventStartTime: "10:00",
    eventEndDate: today,
    eventEndTime: "11:00",
    eventTimeZone: "America/New_York",
    eventLocationCity: (company?.billingCity as string) ?? "",
    eventLocationCountry: (company?.billingCountry as string) ?? "",
    eventLocationStreet: "",
    eventLocationState: "",
    eventLocationPostalCode: "",
    publicOrPrivate: "Private",
    invitedGuestsEmails: "",
    repeating: false,
    isActive: true,
    isCancelled: false,
    createdByName: "Mavil",
  };
}

export function EventDialog({ open, onOpenChange, companyId, event, onSaved }: Props) {
  const [v, setV] = useState<NewDealerEvent>(() => (event ? { ...event } : emptyEvent(companyId)));

  useEffect(() => {
    if (open) setV(event ? { ...event } : emptyEvent(companyId));
  }, [open, event, companyId]);

  const set = <K extends keyof NewDealerEvent>(k: K, value: NewDealerEvent[K]) =>
    setV((s) => ({ ...s, [k]: value }));

  const dealers = COMPANIES.filter((c) => c.vertical === "Main");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.dealerId) {
      toast.error("Pick the dealer this event belongs to");
      return;
    }
    if (!v.eventName.trim()) return;
    if (v.eventType === "Boat show" && !v.boatShowName) {
      toast.error("Pick which boat show this is");
      return;
    }
    if (event) {
      updateEvent(event.id, v);
      toast.success("Event updated");
      onSaved?.(event.id);
    } else {
      const created = addEvent(v);
      toast.success("Event created");
      onSaved?.(created.id);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>{event ? "Edit event" : "New dealer event"}</DialogTitle>
          <DialogDescription>
            Boat shows, onboarding sessions, refresh courses, open houses and sea trials tied to a dealer account.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="evt-dealer">Dealer *</Label>
            <select
              id="evt-dealer"
              className={selectClass}
              value={v.dealerId}
              disabled={Boolean(companyId)}
              onChange={(e) => {
                const c = COMPANIES.find((x) => x.id === e.target.value);
                setV((s) => ({ ...s, dealerId: c?.id ?? "", dealerName: c?.name ?? "" }));
              }}
            >
              <option value="">Select dealer…</option>
              {dealers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="evt-type">Event type *</Label>
              <select
                id="evt-type"
                className={selectClass}
                value={v.eventType}
                onChange={(e) => {
                  const t = e.target.value as EventType;
                  setV((s) => ({ ...s, eventType: t, boatShowName: t === "Boat show" ? s.boatShowName : null }));
                }}
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="evt-show">
                Boat show {v.eventType === "Boat show" ? "*" : "(optional)"}
              </Label>
              <select
                id="evt-show"
                className={selectClass}
                value={v.boatShowName ?? ""}
                onChange={(e) => set("boatShowName", e.target.value || null)}
              >
                <option value="">Not tied to a show</option>
                {BOAT_SHOW_REGIONS.map((region) => (
                  <optgroup key={region} label={region}>
                    {BOAT_SHOWS.filter((s) => s.region === region).map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.name}
                        {s.short !== s.name ? ` - ${s.short}` : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="evt-name">Event name *</Label>
            <Input
              id="evt-name"
              value={v.eventName}
              onChange={(e) => set("eventName", e.target.value)}
              placeholder="FLIBS 2026 - booth walkthrough"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="evt-details">Event details</Label>
            <Textarea
              id="evt-details"
              rows={3}
              value={v.eventDetails}
              onChange={(e) => set("eventDetails", e.target.value)}
              placeholder="Agenda, attendees, what we are demoing…"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="evt-start">Start date *</Label>
              <Input id="evt-start" type="date" value={v.eventStartDate}
                onChange={(e) => set("eventStartDate", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="evt-start-time">Start time</Label>
              <Input id="evt-start-time" type="time" value={v.eventStartTime}
                onChange={(e) => set("eventStartTime", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="evt-end">End date</Label>
              <Input id="evt-end" type="date" value={v.eventEndDate}
                onChange={(e) => set("eventEndDate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="evt-end-time">End time</Label>
              <Input id="evt-end-time" type="time" value={v.eventEndTime}
                onChange={(e) => set("eventEndTime", e.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="evt-tz">Time zone</Label>
              <select id="evt-tz" className={selectClass} value={v.eventTimeZone}
                onChange={(e) => set("eventTimeZone", e.target.value)}>
                {EVENT_TIME_ZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="evt-visibility">Public or private</Label>
              <select id="evt-visibility" className={selectClass} value={v.publicOrPrivate}
                onChange={(e) => set("publicOrPrivate", e.target.value as EventVisibility)}>
                {EVENT_VISIBILITY.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="evt-street">Street</Label>
              <Input id="evt-street" value={v.eventLocationStreet}
                onChange={(e) => set("eventLocationStreet", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="evt-city">City</Label>
              <Input id="evt-city" value={v.eventLocationCity}
                onChange={(e) => set("eventLocationCity", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="evt-state">State / region</Label>
              <Input id="evt-state" value={v.eventLocationState}
                onChange={(e) => set("eventLocationState", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="evt-postal">Postal code</Label>
              <Input id="evt-postal" value={v.eventLocationPostalCode}
                onChange={(e) => set("eventLocationPostalCode", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="evt-country">Country</Label>
              <Input id="evt-country" value={v.eventLocationCountry}
                onChange={(e) => set("eventLocationCountry", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="evt-guests">Invited guest emails</Label>
            <Textarea
              id="evt-guests"
              rows={2}
              value={v.invitedGuestsEmails}
              onChange={(e) => set("invitedGuestsEmails", e.target.value)}
              placeholder="comma separated"
            />
          </div>

          <div className="flex flex-wrap items-center gap-5 text-[13px]">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={v.repeating}
                onChange={(e) => set("repeating", e.target.checked)} />
              <span>Repeating</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={v.isActive}
                onChange={(e) => set("isActive", e.target.checked)} />
              <span>Active</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={v.isCancelled}
                onChange={(e) => set("isCancelled", e.target.checked)} />
              <span>Cancelled</span>
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{event ? "Save changes" : "Create event"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
