import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { profileForUser, setUserProfile, useSignatures } from "@/lib/signatures";
import {
  buildSignatureHtml,
  buildSignatureText,
  copySignatureToClipboard,
  parseSignatureHtml,
  type SignatureProfile,
} from "@/lib/signature-html";
import { findDirectoryProfile } from "@/lib/signature-directory";
import { SignaturePreview } from "@/components/signature-preview";



function Field({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label htmlFor={id} className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <Input id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** Personal rich email-signature editor - opened from the account menu. */
export function EmailSignatureDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user } = useAuth();
  const cfg = useSignatures();
  const [draft, setDraft] = useState<SignatureProfile>(() => profileForUser(cfg, user));
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState("");
  const [imported, setImported] = useState(false);

  useEffect(() => {
    if (!open) return;
    const saved = cfg.profiles[user.id];
    const fromDirectory = findDirectoryProfile(user.email) ?? findDirectoryProfile(user.name);
    setDraft(saved ? profileForUser(cfg, user) : (fromDirectory ?? profileForUser(cfg, user)));
    setCopied(false);
    setPasted("");
    setImported(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user.id]);



  const html = buildSignatureHtml(draft, cfg.links);

  function set<K extends keyof SignatureProfile>(key: K, value: SignatureProfile[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function copy() {
    const ok = await copySignatureToClipboard(html, buildSignatureText(draft, cfg.links));
    setCopied(ok);
    window.setTimeout(() => setCopied(false), 2000);
  }

  function save() {
    setUserProfile(user.id, draft, user, user.email);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>My email signature</DialogTitle>
          <DialogDescription>
            Fill in your details, then copy the signature and paste it straight into Gmail - photo,
            links and formatting come with it.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
          <Label
            htmlFor="sig-paste"
            className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground"
          >
            Paste your entry from the signature repo
          </Label>
          <Textarea
            id="sig-paste"
            rows={5}
            value={pasted}
            className="font-mono text-xs"
            placeholder={'{\n  name: "Roman Maistrenko",\n  position: "Head of Development",\n  image: "https://assets.yachtway.com/email-signatures/roman.png",\n  website: "YachtWay.com",\n  email: "Roman@YachtWay.com",\n  phone: "+38 (050) 711 1240",\n  phoneOpen: "+380507111240",\n}'}
            onChange={(e) => {
              const value = e.target.value;
              setPasted(value);
              const parsed = parseSignatureHtml(value);
              if (parsed) {
                setDraft((d) => ({ ...d, ...parsed }));
                setImported(true);
              }
            }}
          />

          {imported ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Imported - details below were filled in from the pasted signature.
            </p>
          ) : null}
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">

            <Field id="sig-name" label="Full name" value={draft.name} onChange={(v) => set("name", v)} />
            <Field
              id="sig-position"
              label="Position"
              value={draft.position}
              placeholder="Digital Assistant"
              onChange={(v) => set("position", v)}
            />
            <Field
              id="sig-image"
              label="Photo URL"
              value={draft.image}
              placeholder="https://assets.yachtway.com/email-signatures/sarah.png"
              onChange={(v) => set("image", v)}
            />
            <Field
              id="sig-website"
              label="Website"
              value={draft.website}
              placeholder="YachtWay.com"
              onChange={(v) => set("website", v)}
            />
            <Field id="sig-email" label="Email" value={draft.email} onChange={(v) => set("email", v)} />
            <Field
              id="sig-phone"
              label="Phone"
              value={draft.phone ?? ""}
              placeholder="+1 (305) 709 5050"
              onChange={(v) => set("phone", v)}
            />
          </div>

          <div>
            <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Preview
            </Label>
            <SignaturePreview html={html} className="rounded-lg border border-border bg-white p-3" />

            <Button variant="outline" size="sm" className="mt-3" onClick={copy}>
              {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy signature"}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!(draft.phone ?? "").trim()}>Save signature</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
