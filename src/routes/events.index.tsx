import { guarded } from "@/components/require-access";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { EventsTable } from "@/components/events-table";
import { isUpcoming, listEvents, useEventsStore } from "@/lib/events";

export const Route = createFileRoute("/events/")({
  head: () => {
    const title = "Dealer Events - YachtWay CRM";
    const description =
      "Boat shows, dealer onboarding, refresh courses and open houses tracked per dealer account.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: guarded("events", "Dealer events", EventsPage),
});

function EventsPage() {
  useEventsStore();
  const events = listEvents();
  const upcoming = events.filter((e) => isUpcoming(e)).length;

  return (
    <AppShell>
      <PageHeader
        title="Dealer events"
        subtitle={<span>{events.length} events · {upcoming} upcoming</span>}
      />
      <PageBody>
        <EventsTable />
      </PageBody>
    </AppShell>
  );
}
