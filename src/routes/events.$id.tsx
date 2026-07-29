import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Pencil, CalendarDays } from "lucide-react";

import { guarded } from "@/components/require-access";
import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DetailSections } from "@/components/field-renderer";
import { CreateRecordDialog } from "@/components/create-record-dialog";
import { DEALER_EVENT_FIELDS, type FieldSection } from "@/lib/field-schema";
import { getEvent, updateEvent, useEventsStore, formatEventDates, eventLocationLine } from "@/lib/events";
import { getCompany } from "@/lib/mock-data";

export const Route = createFileRoute("/events/$id")({
  component: guarded("events", "Dealer events", EventDetailPage),
});

const EVENT_SECTIONS: readonly FieldSection[] = [
  { id: "dealer_event", title: "Event details", sensitivity: "company.general", fields: DEALER_EVENT_FIELDS },
];

function EventDetailPage() {
  useEventsStore();
  const { id } = Route.useParams();
  const [editing, setEditing] = useState(false);
  const event = getEvent(id);

  if (!event) {
    return (
      <AppShell>
        <PageHeader eyebrow="Dealer event" title="Not found" />
        <PageBody>
          <p className="text-sm text-muted-foreground">
            That event does not exist.{" "}
            <Link to="/events" className="text-brand hover:underline">Back to events</Link>
          </p>
        </PageBody>
      </AppShell>
    );
  }

  const company = getCompany(event.dealerId);

  return (
    <AppShell>
      <PageHeader
        eyebrow={<Link to="/events" className="text-brand hover:underline">Dealer events</Link>}
        title={event.eventName}
        subtitle={
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline">{event.eventType}</Badge>
            {event.isCancelled && <Badge className="bg-destructive text-destructive-foreground">Cancelled</Badge>}
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" /> {formatEventDates(event)}
            </span>
            <span className="text-muted-foreground">· {eventLocationLine(event)}</span>
          </span>
        }
        actions={
          <>
            <Button size="sm" variant="outline" asChild>
              <Link to="/events"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back</Link>
            </Button>
            <Button size="sm" onClick={() => setEditing(true)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
            </Button>
          </>
        }
      />
      <PageBody>
        {company && (
          <p className="mb-4 text-sm text-muted-foreground">
            Dealer:{" "}
            <Link to="/companies/$id" params={{ id: company.id }} className="text-brand hover:underline">{company.name}</Link>
          </p>
        )}
        <div className="max-w-4xl">
          <DetailSections sections={EVENT_SECTIONS} record={event as Record<string, unknown>} />
        </div>
      </PageBody>

      <CreateRecordDialog
        open={editing}
        onOpenChange={setEditing}
        title="Edit event"
        description="Update any field on this dealer event."
        sections={EVENT_SECTIONS}
        requiredKeys={["eventName"]}
        readOnlyKeys={["id"]}
        initial={event as Record<string, unknown>}
        submitLabel="Save changes"
        onSave={(values) => {
          const typeByKey = new Map(DEALER_EVENT_FIELDS.map((f) => [f.key, f.type] as const));
          const patch: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(values)) {
            const t = typeByKey.get(k);
            patch[k] = (t === "number" || t === "money") ? (v === "" || v == null ? null : Number(v)) : v;
          }
          updateEvent(event.id, patch as Partial<typeof event>);
        }}
      />
    </AppShell>
  );
}
