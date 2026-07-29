import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarDays, MapPin, Pencil, Plus, Repeat, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EventDialog } from "@/components/event-dialog";
import {
  boatShowLabel, eventLocationLine, eventsForCompany, formatEventDates, isUpcoming,
  listEvents, removeEvent, useEventsStore, type DealerEvent,
} from "@/lib/events";

function EventRow({ e, onEdit, showDealer }: { e: DealerEvent; onEdit: (e: DealerEvent) => void; showDealer: boolean }) {
  const location = eventLocationLine(e);
  return (
    <li className="flex items-start gap-3 px-4 py-3 text-[13px]">
      <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/events/$id" params={{ id: e.id }} className="font-semibold text-brand-deep hover:underline">
            {e.eventName}
          </Link>
          <Badge variant="outline" className="text-[10px]">{e.eventType}</Badge>
          {e.boatShowName && (
            <Badge variant="outline" className="text-[10px]">{boatShowLabel(e.boatShowName)}</Badge>
          )}
          {e.isCancelled ? (
            <Badge variant="outline" className="text-[10px] text-destructive">Cancelled</Badge>
          ) : isUpcoming(e) ? (
            <Badge variant="outline" className="text-[10px]">Upcoming</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">Past</Badge>
          )}
          {e.repeating && <Repeat className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
        <div className="mt-0.5 text-muted-foreground">
          {formatEventDates(e)}
          {e.eventStartTime ? ` · ${e.eventStartTime}${e.eventEndTime ? `-${e.eventEndTime}` : ""}` : ""}
          {e.eventTimeZone ? ` (${e.eventTimeZone})` : ""}
        </div>
        {showDealer && (
          <div className="mt-0.5">
            <Link to="/companies/$id" params={{ id: e.dealerId }} className="text-brand hover:underline">
              {e.dealerName}
            </Link>
          </div>
        )}
        {location && (
          <div className="mt-0.5 flex items-center gap-1 text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" /> {location}
          </div>
        )}
        {e.eventDetails && <div className="mt-1 text-foreground/80">{e.eventDetails}</div>}
        {e.invitedGuestsEmails && (
          <div className="mt-0.5 flex items-center gap-1 text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> {e.invitedGuestsEmails}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" onClick={() => onEdit(e)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => removeEvent(e.id)}>
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
    </li>
  );
}

export function EventsTable({ companyId }: { companyId?: string }) {
  useEventsStore();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DealerEvent | undefined>(undefined);
  const events = companyId ? eventsForCompany(companyId) : listEvents();
  const upcoming = events.filter((e) => isUpcoming(e));
  const past = events.filter((e) => !isUpcoming(e));

  const openEdit = (e: DealerEvent) => { setEditing(e); setOpen(true); };
  const openNew = () => { setEditing(undefined); setOpen(true); };

  return (
    <div className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-brand-deep">
          Events ({events.length})
        </span>
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New event
        </Button>
      </div>

      {events.length === 0 ? (
        <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">
          No events yet. Log boat shows, onboarding sessions and refresh courses here.
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {upcoming.map((e) => (
              <EventRow key={e.id} e={e} onEdit={openEdit} showDealer={!companyId} />
            ))}
          </ul>
          {past.length > 0 && (
            <>
              <div className="border-t border-border bg-secondary/40 px-4 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                Past
              </div>
              <ul className="divide-y divide-border">
                {past.map((e) => (
                  <EventRow key={e.id} e={e} onEdit={openEdit} showDealer={!companyId} />
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <EventDialog open={open} onOpenChange={setOpen} companyId={companyId} event={editing} />
    </div>
  );
}
