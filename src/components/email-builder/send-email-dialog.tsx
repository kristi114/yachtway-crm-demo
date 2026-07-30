import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Send, Loader2, FlaskConical, Clock, AlertTriangle, Paperclip, X,
  Settings2, ChevronDown, ChevronRight, MailCheck,
} from "lucide-react";

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
  sendEmail, defaultSendOptions, PREFERENCE_TYPES,
  type SendOptions, type PreferenceType,
} from "@/lib/email-send";
import { AudienceBuilder } from "@/components/email-builder/audience-builder";
import { emptyAudience, resolveAudience, type AudienceDef } from "@/lib/audiences";
import { applyEmailHead } from "@/lib/email-templates";
import { MergeTagHelper, UnknownTagWarning } from "@/components/email-builder/merge-tag-helper";
import { SendSchedulePanel } from "@/components/email-builder/send-schedule-panel";
import { defaultSchedule, scheduleErrors, describeSchedule } from "@/lib/email-scheduling";
import {
  providerForKind, providerName, isProviderAllowedForKind, providerCaveat,
  KIND_ALLOWED_PROVIDERS, type EmailKind, type ProviderId,
} from "@/lib/email-providers";

const DEFAULT_SENDER_NAME = "YachtWay";
const DEFAULT_SENDER_EMAIL = "noreply@yachtway.com";

function Section({
  title, children, defaultOpen = false, icon: Icon,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  icon?: typeof Settings2;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border bg-secondary/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium hover:bg-accent/40"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        {Icon && <Icon className="h-4 w-4 text-brand" />}
        {title}
      </button>
      {open && <div className="space-y-3 border-t border-border px-3 py-3">{children}</div>}
    </div>
  );
}

function Toggle({
  checked, onChange, label, hint,
}: {
  checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-brand" : "bg-muted"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
      <div className="min-w-0">
        <div className="text-[13px] font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
}

export function SendEmailDialog({
  open,
  onOpenChange,
  subject,
  html,
  templateId,
  templateName,
  campaignId,
  preheader,
  title,
  defaultKind = "marketing",
  defaultProvider,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  subject: string;
  html: string;
  templateId?: string;
  templateName?: string;
  campaignId?: string;
  preheader?: string;
  title?: string;
  defaultKind?: EmailKind;
  defaultProvider?: ProviderId;
}) {
  const { user } = useAuth();
  const [audience, setAudience] = useState<AudienceDef>(emptyAudience);
  const [senderName, setSenderName] = useState(DEFAULT_SENDER_NAME);
  const [senderEmail, setSenderEmail] = useState(DEFAULT_SENDER_EMAIL);
  const [replyToOn, setReplyToOn] = useState(false);
  const [replyTo, setReplyTo] = useState("");
  const [subj, setSubj] = useState(subject);
  const [pre, setPre] = useState(preheader ?? "");
  const [sending, setSending] = useState(false);
  const [kind, setKind] = useState<EmailKind>(defaultKind);
  const [provider, setProvider] = useState<ProviderId>(defaultProvider ?? providerForKind(defaultKind));
  const [schedule, setSchedule] = useState(defaultSchedule);
  const [options, setOptions] = useState<SendOptions>(defaultSendOptions);
  const [attachments, setAttachments] = useState<string[]>([]);

  // A/B test (subject + body)
  const [abOn, setAbOn] = useState(false);
  const [splitB, setSplitB] = useState(50);
  const [winnerMetric, setWinnerMetric] = useState<"open" | "click">("open");
  const [subjectB, setSubjectB] = useState("");
  const [htmlB, setHtmlB] = useState("");

  // Follow-up to non-openers
  const [fuOn, setFuOn] = useState(false);
  const [fuDays, setFuDays] = useState(3);
  const [fuSubject, setFuSubject] = useState("");

  useEffect(() => {
    if (!open) return;
    setSubj(subject);
    setPre(preheader ?? "");
    setKind(defaultKind);
    setProvider(defaultProvider ?? providerForKind(defaultKind));
    setSchedule(defaultSchedule());
    setOptions(defaultSendOptions());
    setSubjectB(subject ? `${subject} (B)` : "");
    setHtmlB(html);
    setFuSubject(subject ? `Re: ${subject}` : "");
  }, [open, subject, html, preheader, defaultKind, defaultProvider]);

  const resolved = useMemo(() => resolveAudience(audience), [audience]);
  const recipients = resolved.members.map((m) => m.email);
  const schedErrors = scheduleErrors(schedule);

  const canSend =
    recipients.length > 0 &&
    subj.trim() !== "" &&
    senderEmail.trim() !== "" &&
    schedErrors.length === 0 &&
    !sending &&
    (!abOn || (subjectB.trim() !== "" && htmlB.trim() !== "")) &&
    (!fuOn || fuSubject.trim() !== "");

  function addAttachment() {
    const name = window.prompt("Attachment file name (mock — no upload in this build):");
    if (name?.trim()) setAttachments((a) => [...a, name.trim()]);
  }

  async function submit(testOnly: boolean) {
    const to = testOnly ? [user.email] : recipients;
    if (to.length === 0) {
      toast.error("No recipients", { description: "Build a list from filters, tags or addresses." });
      return;
    }
    setSending(true);
    try {
      const { record } = await sendEmail({
        to,
        // Kept for backwards compatibility with the sent log's `from` column.
        from: `${senderName} <${senderEmail}>`,
        senderName,
        senderEmail,
        replyTo: replyToOn ? replyTo : undefined,
        subject: testOnly ? `[TEST] ${subj}` : subj,
        html: applyEmailHead(html, { preheader: pre, title, subject: subj }),
        preheader: pre,
        title,
        templateId,
        templateName,
        campaignId,
        kind,
        provider,
        // A test always goes out immediately, whatever the campaign schedule is.
        schedule: testOnly ? undefined : schedule,
        options,
        attachments,
        abTest:
          !testOnly && abOn
            ? { enabled: true, splitPercentB: splitB, winnerMetric, variantB: { subject: subjectB, html: htmlB } }
            : undefined,
        followUp: !testOnly && fuOn ? { enabled: true, delayDays: fuDays, subject: fuSubject } : undefined,
      });

      if (testOnly) {
        toast.success("Test sent", { description: `To ${user.email}` });
      } else {
        const queued = record.status === "scheduled";
        toast.success(queued ? "Campaign scheduled" : record.mock ? "Email sent (mock)" : "Email sent", {
          description: describeSchedule(schedule, to.length),
        });
        onOpenChange(false);
        setAudience(emptyAudience());
        setAbOn(false);
        setFuOn(false);
        setAttachments([]);
      }
    } catch (err) {
      toast.error("Couldn't send", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void submit(false);
  }

  const sendLabel = sending
    ? "Working…"
    : schedule.mode === "now"
      ? `Send to ${recipients.length}`
      : schedule.mode === "rss"
        ? "Activate RSS campaign"
        : `Schedule for ${recipients.length}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] w-[96vw] max-w-6xl overflow-hidden p-0">
        {/* pr-14 keeps the Attach files button clear of the dialog's close button,
            which is absolutely positioned in the top-right corner. */}
        <DialogHeader className="flex-row items-start justify-between gap-3 border-b border-border px-6 py-4 pr-14">
          <div>
            <DialogTitle>Send or schedule</DialogTitle>
            <DialogDescription>
              Sending is simulated in this build — schedules are recorded, not dispatched.
            </DialogDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addAttachment} className="shrink-0 gap-1.5">
            <Paperclip className="h-3.5 w-3.5" /> Attach files
          </Button>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex max-h-[calc(94vh-9rem)] flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            {/* Dispatch mode + schedule */}
            <SendSchedulePanel value={schedule} onChange={setSchedule} recipients={recipients.length} />

            {attachments.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {attachments.map((a, i) => (
                  <span
                    key={`${a}-${i}`}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-surface pl-2.5 pr-1 text-xs"
                  >
                    <Paperclip className="h-3 w-3 text-muted-foreground" />
                    {a}
                    <button
                      type="button"
                      onClick={() => setAttachments((list) => list.filter((_, j) => j !== i))}
                      className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${a}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Sender identity */}
            <div className="grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sender-name">Sender name</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    id="sender-name"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="The name recipients will see"
                  />
                  <MergeTagHelper onInsert={(t) => setSenderName((v) => v + t)} label="" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sender-email">Sender email *</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    id="sender-email"
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    placeholder="The address recipients will see"
                  />
                  <MergeTagHelper onInsert={(t) => setSenderEmail((v) => v + t)} label="" />
                </div>
                <p className="text-xs text-muted-foreground">
                  If you use a merge tag here, make sure it resolves to a valid address.
                </p>
              </div>
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={replyToOn}
                    onChange={(e) => setReplyToOn(e.target.checked)}
                    className="h-4 w-4 accent-[hsl(var(--brand))]"
                  />
                  Set a custom reply-to address for this campaign
                </label>
                {replyToOn && (
                  <Input
                    value={replyTo}
                    onChange={(e) => setReplyTo(e.target.value)}
                    placeholder="replies@yachtway.com"
                    className="mt-2 h-9 text-[13px]"
                  />
                )}
              </div>
            </div>

            {/* Type + provider */}
            <div className="grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="send-kind">Email type</Label>
                <select
                  id="send-kind"
                  value={kind}
                  onChange={(e) => {
                    const k = e.target.value as EmailKind;
                    setKind(k);
                    if (!isProviderAllowedForKind(k, provider)) setProvider(providerForKind(k));
                  }}
                  className="native-select h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
                >
                  <option value="marketing">Marketing — bulk campaigns</option>
                  <option value="transactional">Transactional — 1:1 with a contact</option>
                  <option value="system">System — platform-generated</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="send-provider">Send via</Label>
                <select
                  id="send-provider"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as ProviderId)}
                  className="native-select h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
                >
                  {KIND_ALLOWED_PROVIDERS[kind].map((p) => (
                    <option key={p} value={p}>
                      {providerName(p)}{p === providerForKind(kind) ? " (default)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              {providerCaveat(kind, provider) && (
                <p className="flex items-start gap-1.5 text-xs text-warning sm:col-span-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {providerCaveat(kind, provider)}
                </p>
              )}
            </div>

            {/* Subject + preheader */}
            <div className="space-y-3 border-t border-border pt-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="send-subject">{abOn ? "Subject line — variant A *" : "Subject line *"}</Label>
                  <MergeTagHelper onInsert={(t) => setSubj((v) => v + t)} label="Tags" />
                </div>
                <Input id="send-subject" value={subj} onChange={(e) => setSubj(e.target.value)} />
                <UnknownTagWarning text={`${subj} ${pre} ${senderName} ${senderEmail}`} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="send-pre">Preview text (pre-header)</Label>
                  <MergeTagHelper onInsert={(t) => setPre((v) => v + t)} label="Tags" />
                </div>
                <Input
                  id="send-pre"
                  value={pre}
                  onChange={(e) => setPre(e.target.value)}
                  placeholder="Used as the preview text some email clients display"
                />
                <p className="text-xs text-muted-foreground">
                  Title: {title?.trim() || subj || "—"}
                  {!title?.trim() && " (from subject)"}
                </p>
              </div>
            </div>

            {/* Recipients */}
            <div className="space-y-1.5 border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <Label>Recipients *</Label>
                <button
                  type="button"
                  className="text-xs text-brand hover:underline"
                  onClick={() =>
                    setAudience((a) => ({ ...a, manualEmails: [...new Set([...a.manualEmails, user.email])] }))
                  }
                >
                  Add me ({user.email})
                </button>
              </div>
              <AudienceBuilder value={audience} onChange={setAudience} />
            </div>

            {/* Additional settings */}
            <Section title="Additional settings" icon={Settings2}>
              <Toggle
                checked={options.trackClicks}
                onChange={(v) => setOptions((o) => ({ ...o, trackClicks: v }))}
                label="Track clicks"
                hint="Discover which links were clicked, how often, and by whom."
              />
              <Toggle
                checked={options.utmTracking}
                onChange={(v) => setOptions((o) => ({ ...o, utmTracking: v }))}
                label="UTM tracking"
                hint="Automatically append the default UTM parameters to every link in the campaign."
              />
              <Toggle
                checked={options.addTagsOnInteraction}
                onChange={(v) => setOptions((o) => ({ ...o, addTagsOnInteraction: v }))}
                label="Add tags on interaction"
                hint="Tag contacts based on how they engage with this campaign."
              />
              {options.addTagsOnInteraction && (
                <div className="grid grid-cols-1 gap-2 pl-12 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="tag-open" className="text-xs">Tag on open</Label>
                    <Input
                      id="tag-open"
                      value={options.tagOnOpen ?? ""}
                      onChange={(e) => setOptions((o) => ({ ...o, tagOnOpen: e.target.value }))}
                      placeholder="e.g. Newsletter Opener"
                      className="h-8 text-[13px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="tag-click" className="text-xs">Tag on click</Label>
                    <Input
                      id="tag-click"
                      value={options.tagOnClick ?? ""}
                      onChange={(e) => setOptions((o) => ({ ...o, tagOnClick: e.target.value }))}
                      placeholder="e.g. EasyFund Prospect"
                      className="h-8 text-[13px]"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5 border-t border-border pt-3">
                <Label htmlFor="pref-type" className="text-[13px]">Preference type</Label>
                <select
                  id="pref-type"
                  value={options.preferenceType ?? ""}
                  onChange={(e) =>
                    setOptions((o) => ({
                      ...o,
                      preferenceType: (e.target.value || undefined) as PreferenceType | undefined,
                    }))
                  }
                  className="native-select h-9 w-full rounded-md border border-border bg-surface px-2 text-[13px]"
                >
                  <option value="">Select preference type (optional)</option>
                  {PREFERENCE_TYPES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Categorising the campaign lets recipients unsubscribe from this kind of email without
                  stopping all communication.
                </p>
              </div>
            </Section>

            {/* A/B test */}
            <Section title="A/B test subject & body" icon={FlaskConical}>
              <Toggle checked={abOn} onChange={setAbOn} label="Run an A/B test" />
              {abOn && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="ab-split" className="text-xs">
                        Variant B share — {splitB}% ({100 - splitB}% get A)
                      </Label>
                      <input
                        id="ab-split"
                        type="range"
                        min={10}
                        max={90}
                        step={5}
                        value={splitB}
                        onChange={(e) => setSplitB(Number(e.target.value))}
                        className="w-full accent-[hsl(var(--brand))]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ab-metric" className="text-xs">Winner decided by</Label>
                      <select
                        id="ab-metric"
                        value={winnerMetric}
                        onChange={(e) => setWinnerMetric(e.target.value as "open" | "click")}
                        className="native-select h-8 w-full rounded-md border border-border bg-surface px-2 text-[13px]"
                      >
                        <option value="open">Open rate</option>
                        <option value="click">Click rate</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ab-subject-b" className="text-xs">Subject — variant B</Label>
                    <Input
                      id="ab-subject-b"
                      value={subjectB}
                      onChange={(e) => setSubjectB(e.target.value)}
                      className="h-8 text-[13px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ab-html-b" className="text-xs">
                      Body HTML — variant B (pre-filled from A; edit to differ)
                    </Label>
                    <Textarea
                      id="ab-html-b"
                      rows={5}
                      value={htmlB}
                      onChange={(e) => setHtmlB(e.target.value)}
                      className="font-mono text-[11px]"
                    />
                  </div>
                </div>
              )}
            </Section>

            {/* Resend to unopened */}
            <Section title="Resend to unopened" icon={Clock}>
              <Toggle
                checked={fuOn}
                onChange={setFuOn}
                label="Re-send to non-openers"
                hint="Goes only to recipients who were delivered the email but never opened it. Runs once."
              />
              {fuOn && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[8rem_1fr]">
                  <div className="space-y-1.5">
                    <Label htmlFor="fu-days" className="text-xs">Days later</Label>
                    <Input
                      id="fu-days"
                      type="number"
                      min={1}
                      max={60}
                      value={fuDays}
                      onChange={(e) => setFuDays(Math.max(1, Number(e.target.value) || 1))}
                      className="h-8 text-[13px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fu-subject" className="text-xs">New subject line</Label>
                    <Input
                      id="fu-subject"
                      value={fuSubject}
                      onChange={(e) => setFuSubject(e.target.value)}
                      className="h-8 text-[13px]"
                    />
                  </div>
                </div>
              )}
            </Section>
          </div>

          <DialogFooter className="flex-row items-center justify-between gap-2 border-t border-border px-6 py-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={sending || !subj.trim()}
              onClick={() => void submit(true)}
              className="gap-1.5"
            >
              <MailCheck className="h-4 w-4" /> Send test to me
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSend}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sendLabel}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
