import { useState, type FormEvent } from "react";
import { Mail, Phone, MessageSquare, MessageCircle, CalendarDays, StickyNote } from "lucide-react";

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
import { signatureFor, useSignatures } from "@/lib/signatures";
import { logComms, type CommsChannel, type CommsDirection } from "@/lib/comms-log";
import type { NoteVisibility, RelatedType } from "@/lib/mock-data";
import { VISIBILITY_OPTIONS, canCreateSecureNote, toNoteViewer } from "@/lib/note-access";


const CHANNELS: { id: CommsChannel; label: string; icon: typeof Mail }[] = [
  { id: "Email", label: "Email", icon: Mail },
  { id: "Call", label: "Phone call", icon: Phone },
  { id: "SMS", label: "Text (SMS)", icon: MessageSquare },
  { id: "WhatsApp", label: "WhatsApp", icon: MessageCircle },
  { id: "Chat", label: "Chat (Crisp)", icon: MessageSquare },
  { id: "Meeting", label: "Meeting", icon: CalendarDays },
  { id: "Note", label: "Internal note", icon: StickyNote },
];

function nowLocalInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function LogCommsDialog({
  open,
  onOpenChange,
  relatedType,
  relatedId,
  defaultContactName,
  onLogged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  relatedType: RelatedType;
  relatedId: string;
  defaultContactName?: string;
  onLogged?: () => void;
}) {
  const { user } = useAuth();
  const sigCfg = useSignatures();
  const [channel, setChannel] = useState<CommsChannel>("Email");
  const [direction, setDirection] = useState<CommsDirection>("outbound");
  const [contactName, setContactName] = useState(defaultContactName ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [occurredAt, setOccurredAt] = useState(nowLocalInput());
  const [followUp, setFollowUp] = useState("");
  const [visibility, setVisibility] = useState<NoteVisibility>("team");
  const [appendSignature, setAppendSignature] = useState(true);

  const showDirection = channel !== "Note" && channel !== "Meeting";
  const showSubject = channel === "Email" || channel === "Meeting";
  const showVisibility = channel === "Note";
  const allowSecure = canCreateSecureNote(toNoteViewer(user));

  const signature = signatureFor(sigCfg, user);
  const showSignature = channel === "Email" && direction === "outbound" && sigCfg.autoAppend;

  function reset() {
    setChannel("Email");
    setDirection("outbound");
    setContactName(defaultContactName ?? "");
    setSubject("");
    setBody("");
    setOccurredAt(nowLocalInput());
    setFollowUp("");
    setVisibility("team");
    setAppendSignature(true);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    const finalBody = showSignature && appendSignature
      ? `${body.trim()}\n\n${signature}`
      : body.trim();
    logComms({
      relatedType: relatedType,
      relatedId: relatedId,
      channel,
      direction: showDirection ? direction : null,
      author: user.name,
      contactName: contactName.trim() || undefined,
      subject: subject.trim() || undefined,
      body: finalBody,
      occurred_at: new Date(occurredAt).toISOString(),
      follow_up_at: followUp ? new Date(followUp).toISOString() : undefined,
      visibility: showVisibility ? visibility : undefined,
    });
    reset();
    onOpenChange(false);
    onLogged?.();
  }


  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Log communication</DialogTitle>
          <DialogDescription>
            Record an email, call, text, WhatsApp, meeting, or note. Timestamped as {user.name}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Channel
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {CHANNELS.map(({ id, label, icon: Icon }) => {
                const on = channel === id;
                return (
                  <button
                    type="button"
                    key={id}
                    onClick={() => setChannel(id)}
                    className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      on
                        ? "border-brand bg-brand text-brand-foreground"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {showDirection && (
            <div>
              <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                Direction
              </Label>
              <div className="flex gap-1.5">
                {(["outbound", "inbound"] as const).map((d) => {
                  const on = direction === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDirection(d)}
                      className={`rounded-sm border px-2.5 py-1 text-xs font-medium capitalize ${
                        on
                          ? "border-brand bg-brand text-brand-foreground"
                          : "border-border bg-background text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {d === "outbound" ? "I contacted them" : "They contacted me"}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cm-contact" className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                Contact
              </Label>
              <Input
                id="cm-contact"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Who at the account"
                maxLength={100}
              />
            </div>
            <div>
              <Label htmlFor="cm-when" className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                When
              </Label>
              <Input
                id="cm-when"
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                required
              />
            </div>
          </div>

          {showSubject && (
            <div>
              <Label htmlFor="cm-subject" className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                {channel === "Meeting" ? "Meeting title" : "Subject"}
              </Label>
              <Input
                id="cm-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                placeholder={channel === "Meeting" ? "Q3 renewal review" : "Re: Studio credits"}
              />
            </div>
          )}

          <div>
            <Label htmlFor="cm-body" className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Summary
            </Label>
            <Textarea
              id="cm-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              required
              maxLength={2000}
              placeholder="What was discussed, next steps, decisions…"
            />
          </div>

          {showSignature && (
            <div className="rounded-lg border border-border bg-secondary/30 p-3">
              <label className="flex items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={appendSignature}
                  onChange={(e) => setAppendSignature(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[hsl(var(--brand))]"
                />
                Append my email signature
              </label>
              {appendSignature && (
                <pre className="mt-2 whitespace-pre-wrap border-t border-border pt-2 text-[12px] leading-relaxed text-muted-foreground">
                  {signature}
                </pre>
              )}
            </div>
          )}



          <div>
            <Label htmlFor="cm-followup" className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Follow up on (optional)
            </Label>
            <Input
              id="cm-followup"
              type="date"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
            />
          </div>

          {showVisibility && (
            <div>
              <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                Visibility
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {VISIBILITY_OPTIONS.filter((opt) => opt.id !== "secure" || allowSecure).map((opt) => {
                  const on = visibility === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setVisibility(opt.id)}
                      className={`flex flex-col items-start rounded-sm border px-2.5 py-1.5 text-xs font-medium ${
                        on
                          ? "border-brand bg-brand text-brand-foreground"
                          : "border-border bg-background text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span>{opt.label}</span>
                      <span className={`text-[10px] ${on ? "text-brand-foreground/80" : "text-muted-foreground"}`}>
                        {opt.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}


          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!body.trim()}>
              Save entry
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
