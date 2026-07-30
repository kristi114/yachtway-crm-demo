import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Send, Loader2, FlaskConical, Clock, AlertTriangle } from "lucide-react";

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
import { sendEmail } from "@/lib/email-send";
import { AudienceBuilder } from "@/components/email-builder/audience-builder";
import { emptyAudience, resolveAudience, type AudienceDef } from "@/lib/audiences";
import { applyEmailHead } from "@/lib/email-templates";
import {
  MergeTagHelper, UnknownTagWarning,
} from "@/components/email-builder/merge-tag-helper";
import {
  providerForKind, providerName, isProviderAllowedForKind, providerCaveat,
  KIND_ALLOWED_PROVIDERS, type EmailKind, type ProviderId,
} from "@/lib/email-providers";

const DEFAULT_FROM = "YachtWay <noreply@yachtway.com>";

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
  /** Campaign this send is attributed to (from the email's campaign field). */
  campaignId?: string;
  /** Inbox preview text from the template. */
  preheader?: string;
  /** Document title from the template (blank → subject). */
  title?: string;
  /** Email class from the template; can be changed for this send. */
  defaultKind?: EmailKind;
  /** Provider from the template; can be changed for this send. */
  defaultProvider?: ProviderId;
}) {
  const { user } = useAuth();
  const [audience, setAudience] = useState<AudienceDef>(emptyAudience);
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [subj, setSubj] = useState(subject);
  const [pre, setPre] = useState(preheader ?? "");
  const [sending, setSending] = useState(false);
  const [kind, setKind] = useState<EmailKind>(defaultKind);
  const [provider, setProvider] = useState<ProviderId>(
    defaultProvider ?? providerForKind(defaultKind),
  );

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

  // Reset to the template's values each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setSubj(subject);
    setPre(preheader ?? "");
    setKind(defaultKind);
    setProvider(defaultProvider ?? providerForKind(defaultKind));
    setSubjectB(subject ? `${subject} (B)` : "");
    setHtmlB(html);
    setFuSubject(subject ? `Re: ${subject}` : "");
  }, [open, subject, html, preheader, defaultKind, defaultProvider]);

  const recipients = useMemo(() => resolveAudience(audience).members.map((m) => m.email), [audience]);
  const canSend = recipients.length > 0 && subj.trim() !== "" && !sending &&
    (!abOn || (subjectB.trim() !== "" && htmlB.trim() !== "")) &&
    (!fuOn || fuSubject.trim() !== "");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (recipients.length === 0) {
      toast.error("No recipients", { description: "Build a list from filters, tags or addresses." });
      return;
    }
    setSending(true);
    try {
      const { record } = await sendEmail({
        to: recipients,
        from,
        subject: subj,
        // Pre-header + <title> are injected into the HTML that actually goes out.
        html: applyEmailHead(html, { preheader: pre, title, subject: subj }),
        preheader: pre,
        title,
        templateId,
        templateName,
        campaignId,
        kind,
        provider,
        abTest: abOn
          ? { enabled: true, splitPercentB: splitB, winnerMetric, variantB: { subject: subjectB, html: htmlB } }
          : undefined,
        followUp: fuOn ? { enabled: true, delayDays: fuDays, subject: fuSubject } : undefined,
      });
      const bits = [`${record.to.length} recipient${record.to.length === 1 ? "" : "s"}`];
      bits.push(`${kind} · ${providerName(provider)}`);
      if (abOn) bits.push(`A/B ${100 - splitB}/${splitB}`);
      if (fuOn) bits.push(`follow-up in ${fuDays}d`);
      toast.success(record.mock ? "Email sent (mock)" : "Email sent", { description: bits.join(" · ") });
      onOpenChange(false);
      setAudience(emptyAudience());
      setAbOn(false);
      setFuOn(false);
    } catch (err) {
      toast.error("Couldn't send", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[92vw] max-w-2xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>Send email</DialogTitle>
          <DialogDescription>
            Build a list from filters and tags, optionally A/B test the subject and body, and
            auto-follow-up with anyone who doesn't open. Sending is simulated in this build.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex max-h-[calc(92vh-9rem)] flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            {/* Audience */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Send to</Label>
                <button
                  type="button"
                  className="text-xs text-brand hover:underline"
                  onClick={() =>
                    setAudience((a) => ({ ...a, manualEmails: [...new Set([...a.manualEmails, user.email])] }))
                  }
                >
                  Send test to me ({user.email})
                </button>
              </div>
              <AudienceBuilder value={audience} onChange={setAudience} />
            </div>

            {/* Email type → provider routing */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

            <div className="space-y-1.5">
              <Label htmlFor="send-from">From</Label>
              <Input id="send-from" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="send-subject">{abOn ? "Subject — variant A" : "Subject"}</Label>
                <MergeTagHelper onInsert={(t) => setSubj((v) => v + t)} label="Tags" />
              </div>
              <Input id="send-subject" value={subj} onChange={(e) => setSubj(e.target.value)} />
              <UnknownTagWarning text={`${subj} ${pre}`} />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="send-pre">Pre-header</Label>
                <MergeTagHelper onInsert={(t) => setPre((v) => v + t)} label="Tags" />
              </div>
              <Input
                id="send-pre"
                value={pre}
                onChange={(e) => setPre(e.target.value)}
                placeholder="Inbox preview text (shown after the subject)"
              />
              <p className="text-xs text-muted-foreground">
                Title: {title?.trim() || subj || "—"}
                {!title?.trim() && " (from subject)"}
              </p>
            </div>

            {/* A/B test */}
            <div className="rounded-lg border border-border bg-secondary/30 p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={abOn}
                  onChange={(e) => setAbOn(e.target.checked)}
                  className="h-4 w-4 accent-[hsl(var(--brand))]"
                />
                <FlaskConical className="h-4 w-4 text-brand" /> A/B test subject &amp; body
              </label>

              {abOn && (
                <div className="mt-3 space-y-3">
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
                      Body HTML — variant B (pre-filled from variant A; edit to differ)
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
            </div>

            {/* Non-opener follow-up */}
            <div className="rounded-lg border border-border bg-secondary/30 p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={fuOn}
                  onChange={(e) => setFuOn(e.target.checked)}
                  className="h-4 w-4 accent-[hsl(var(--brand))]"
                />
                <Clock className="h-4 w-4 text-brand" /> Re-send to non-openers
              </label>

              {fuOn && (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[8rem_1fr]">
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
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    Goes only to recipients who were delivered the email but never opened it. Runs once.
                  </p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="border-t border-border px-6 py-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSend}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? "Sending…" : `Send to ${recipients.length}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
