import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Save, Code2, LayoutTemplate, Send, Download } from "lucide-react";

import { guarded } from "@/components/require-access";
import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ClientOnly } from "@/components/client-only";
import { HtmlCodeEditor } from "@/components/email-builder/html-code-editor";
import { SendEmailDialog } from "@/components/email-builder/send-email-dialog";
import {
  GrapesEditor,
  type GrapesEditorHandle,
} from "@/components/email-builder/grapes-editor";
import { useAuth } from "@/lib/auth";
import {
  getEmailTemplate,
  saveEmailTemplate,
  type EmailMode,
} from "@/lib/email-templates";
import {
  useCampaigns, listCampaigns, campaignForTemplate, setTemplateCampaign,
  createCampaign, getCampaign,
} from "@/lib/email-campaigns";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/emails/$id")({
  component: guarded("emails", "Emails", EmailEditorPage),
});

const BLANK_HTML = `<!doctype html>
<html>
  <body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1a2b3c;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;">
          <tr><td style="padding:32px;">
            <h1 style="margin:0 0 12px;font-size:22px;">Your headline here</h1>
            <p style="margin:0;font-size:15px;line-height:1.6;">Start writing, or switch to the Designer tab to build visually.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

function EmailEditorPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const existing = useMemo(() => getEmailTemplate(id), [id]);
  const isNew = !existing;

  const [name, setName] = useState(existing?.name ?? "Untitled email");
  const [subject, setSubject] = useState(existing?.subject ?? "");
  const [tab, setTab] = useState<EmailMode>(existing?.mode ?? "design");
  const [html, setHtml] = useState(existing?.html ?? BLANK_HTML);
  const [design, setDesign] = useState<unknown | null>(existing?.design ?? null);
  // Remount key for the designer so it re-imports the latest HTML on entry.
  const [grapesKey, setGrapesKey] = useState(0);
  const [sendOpen, setSendOpen] = useState(false);
  // Campaign this email belongs to ("" = standalone). Applied on save.
  useCampaigns();
  const campaigns = listCampaigns();
  const [campaignId, setCampaignId] = useState<string>(
    () => campaignForTemplate(id)?.id ?? "",
  );
  const [newCampaignOpen, setNewCampaignOpen] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState("");

  const grapesRef = useRef<GrapesEditorHandle>(null);

  /** Pull the latest content out of the active editor into local state. */
  function syncFromActiveEditor() {
    if (tab === "design" && grapesRef.current) {
      const content = grapesRef.current.getContent();
      setHtml(content.html);
      setDesign(content.design);
      return content;
    }
    return { html, design };
  }

  function handleTabChange(next: string) {
    const nextMode = next as EmailMode;
    if (nextMode === tab) return;
    // Leaving the designer → capture its HTML so the HTML tab shows the same thing.
    if (tab === "design") syncFromActiveEditor();
    // Entering the designer → remount so it imports the current HTML/design.
    if (nextMode === "design") setGrapesKey((k) => k + 1);
    setTab(nextMode);
  }

  function handleSave() {
    const content = syncFromActiveEditor();
    const saved = saveEmailTemplate({
      id,
      name,
      subject,
      mode: tab,
      html: content.html,
      design: tab === "design" ? content.design : null,
      updatedBy: user.name,
    });
    // Attach/detach the email from its campaign alongside the template save.
    setTemplateCampaign(id, campaignId || null);
    const campaignName = campaignId ? getCampaign(campaignId)?.name : undefined;
    toast.success(isNew ? "Email created" : "Email saved", {
      description: campaignName ? `${saved.name} · ${campaignName}` : saved.name,
    });
    if (isNew) navigate({ to: "/emails/$id", params: { id }, replace: true });
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Emails"
        title={
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 max-w-md border-transparent bg-transparent px-1 text-xl font-semibold shadow-none focus-visible:border-border"
            placeholder="Untitled email"
          />
        }
        subtitle={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Subject</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="h-8 w-[min(560px,60vw)]"
                placeholder="Subject line — supports {{merge_tags}}"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Campaign</Label>
              <select
                value={campaignId}
                onChange={(e) => {
                  if (e.target.value === "__new") {
                    setNewCampaignOpen(true);
                    return;
                  }
                  setCampaignId(e.target.value);
                }}
                className="native-select h-8 rounded-md border border-border bg-surface px-2 text-[13px]"
                title="Add this email to a campaign (a series of sends)"
              >
                <option value="">None (standalone)</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
                <option value="__new">+ New campaign…</option>
              </select>
            </div>
          </div>
        }
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                const content = syncFromActiveEditor();
                const blob = new Blob([content.html], { type: "text/html" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${name || "email"}.html`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="h-4 w-4" /> Export HTML
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                // Capture the latest HTML from whichever editor is active first.
                syncFromActiveEditor();
                setSendOpen(true);
              }}
            >
              <Send className="h-4 w-4" /> Send
            </Button>
            <Button onClick={handleSave}>
              <Save className="h-4 w-4" /> Save
            </Button>
          </>
        }
      />
      <PageBody>
        <Tabs value={tab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="design" className="gap-1.5">
              <LayoutTemplate className="h-4 w-4" /> Designer
            </TabsTrigger>
            <TabsTrigger value="html" className="gap-1.5">
              <Code2 className="h-4 w-4" /> HTML editor
            </TabsTrigger>
          </TabsList>

          <TabsContent value="design" className="mt-4">
            <ClientOnly
              fallback={
                <div className="rounded-lg border border-border bg-surface p-8 text-sm text-muted-foreground">
                  Loading the drag-and-drop designer…
                </div>
              }
            >
              <GrapesEditor key={grapesKey} ref={grapesRef} design={design} html={html} />
            </ClientOnly>
            <p className="mt-2 text-xs text-muted-foreground">
              Drag blocks (text, image, button, columns) from the right panel. Styling and layers
              are on the right; the canvas exports email-safe, inlined HTML.
            </p>
          </TabsContent>

          <TabsContent value="html" className="mt-4">
            <ClientOnly
              fallback={
                <div className="rounded-lg border border-border bg-surface p-8 text-sm text-muted-foreground">
                  Loading the HTML editor…
                </div>
              }
            >
              <HtmlCodeEditor value={html} onChange={setHtml} />
            </ClientOnly>
          </TabsContent>
        </Tabs>
      </PageBody>

      <SendEmailDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        subject={subject}
        html={html}
        templateId={id}
        templateName={name}
        campaignId={campaignId || undefined}
      />

      {/* Create a campaign inline from the picker */}
      <Dialog open={newCampaignOpen} onOpenChange={setNewCampaignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New campaign</DialogTitle>
            <DialogDescription>
              This email will be added to it as the first in the series.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="new-camp">Campaign name</Label>
            <Input
              id="new-camp"
              value={newCampaignName}
              onChange={(e) => setNewCampaignName(e.target.value)}
              placeholder="e.g. Dealer onboarding series"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCampaignOpen(false)}>Cancel</Button>
            <Button
              disabled={!newCampaignName.trim()}
              onClick={() => {
                const c = createCampaign(newCampaignName, "", user.name);
                setCampaignId(c.id);
                setNewCampaignName("");
                setNewCampaignOpen(false);
              }}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
