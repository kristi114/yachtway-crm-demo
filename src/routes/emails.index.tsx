import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plus } from "lucide-react";

import { guarded } from "@/components/require-access";
import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmailStatisticsTab } from "@/components/email-builder/email-statistics-tab";
import { EmailSentTab } from "@/components/email-builder/email-sent-tab";
import { EmailTemplatesTab } from "@/components/email-builder/email-templates-tab";
import { EmailCampaignsTab } from "@/components/email-builder/email-campaigns-tab";
import { newTemplateId } from "@/lib/email-templates";

export const Route = createFileRoute("/emails/")({
  head: () => {
    const title = "Email Marketing - YachtWay CRM";
    return {
      meta: [
        { title },
        {
          name: "description",
          content:
            "Email marketing: engagement statistics, sent history, and the template designer.",
        },
      ],
    };
  },
  component: guarded("emails", "Email Marketing", EmailMarketingPage),
});

function EmailMarketingPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("statistics");

  return (
    <AppShell>
      <PageHeader
        title="Email Marketing"
        subtitle="Engagement statistics, sent history, and the template designer."
        actions={
          <Button onClick={() => navigate({ to: "/emails/$id", params: { id: newTemplateId() } })}>
            <Plus className="h-4 w-4" /> New email
          </Button>
        }
      />
      <PageBody>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="statistics">Statistics</TabsTrigger>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="sent">Sent</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
          </TabsList>

          <TabsContent value="statistics" className="mt-5">
            <EmailStatisticsTab />
          </TabsContent>
          <TabsContent value="campaigns" className="mt-5">
            <EmailCampaignsTab />
          </TabsContent>
          <TabsContent value="sent" className="mt-5">
            <EmailSentTab />
          </TabsContent>
          <TabsContent value="templates" className="mt-5">
            <EmailTemplatesTab />
          </TabsContent>
        </Tabs>
      </PageBody>
    </AppShell>
  );
}
