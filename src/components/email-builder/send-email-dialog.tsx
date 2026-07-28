import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Send, Loader2 } from "lucide-react";

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
import { useAuth } from "@/lib/auth";
import { parseRecipients, sendEmail } from "@/lib/email-send";

const DEFAULT_FROM = "YachtWay <noreply@yachtway.com>";

export function SendEmailDialog({
  open,
  onOpenChange,
  subject,
  html,
  templateId,
  templateName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  subject: string;
  html: string;
  templateId?: string;
  templateName?: string;
}) {
  const { user } = useAuth();
  const [to, setTo] = useState("");
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [subj, setSubj] = useState(subject);
  const [sending, setSending] = useState(false);

  // Reset the subject to the template's each time the dialog opens.
  useEffect(() => {
    if (open) setSubj(subject);
  }, [open, subject]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const recipients = parseRecipients(to);
    setSending(true);
    try {
      const { record } = await sendEmail({
        to: recipients,
        from,
        subject: subj,
        html,
        templateId,
        templateName,
      });
      toast.success(
        record.mock ? "Email sent (mock)" : "Email sent",
        {
          description: `${record.to.length} recipient${record.to.length === 1 ? "" : "s"} · ${record.subject}`,
        },
      );
      onOpenChange(false);
      setTo("");
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send email</DialogTitle>
          <DialogDescription>
            Send this template now. In this build sending is simulated (no mail leaves the app);
            wire the Mailgun send route in apps/api to send for real.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="send-to">To</Label>
              <button
                type="button"
                className="text-xs text-brand hover:underline"
                onClick={() => setTo((prev) => (prev ? prev : user.email))}
              >
                Send test to me ({user.email})
              </button>
            </div>
            <Input
              id="send-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="name@example.com, another@example.com"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">Separate multiple addresses with commas.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="send-from">From</Label>
            <Input id="send-from" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="send-subject">Subject</Label>
            <Input id="send-subject" value={subj} onChange={(e) => setSubj(e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
              Cancel
            </Button>
            <Button type="submit" disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
