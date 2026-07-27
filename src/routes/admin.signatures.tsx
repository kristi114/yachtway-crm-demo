import { useState } from "react";
import { Check, Copy, RotateCcw, Save, Trash2, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useAuth, ROLE_LABELS } from "@/lib/auth";
import { useAdminConfig } from "@/lib/admin-config";
import {
  DEFAULT_SIGNATURE_TEMPLATE,
  SIGNATURE_TOKENS,
  clearUserSignature,
  deleteUserSignature,
  hideDirectoryEntry,
  restoreDirectory,
  profileForUser,
  renderSignature,
  setAutoAppend,
  setDefaultTemplate,
  setSignatureLinks,
  useSignatures,
} from "@/lib/signatures";
import {
  REFERENCE_SIGNATURE_PROFILE,
  REFERENCE_SIGNATURE_SNIPPET,
  buildSignatureHtml,
  buildSignatureText,
  copySignatureToClipboard,
  parseSignatureSnippet,
  type SignatureLink,
  type SignatureProfile,
} from "@/lib/signature-html";
import { SignaturePreview } from "@/components/signature-preview";
import {
  SIGNATURE_DIRECTORY,
  directorySnippet,
} from "@/lib/signature-directory";


import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/signatures")({
  head: () => ({
    meta: [
      { title: "Email signatures - YachtWay CRM admin" },
      { name: "description", content: "Manage the company-wide email signature template, product links, and per-user signature overrides." },
      { property: "og:title", content: "Email signatures - YachtWay CRM admin" },
      { property: "og:description", content: "Manage the company-wide email signature template, product links, and per-user signature overrides." },
    ],
  }),
  component: AdminSignatures,
});

function CopyButton({ html, text }: { html: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        const ok = await copySignatureToClipboard(html, text);
        setCopied(ok);
        window.setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function AdminSignatures() {
  const { user } = useAuth();
  const cfg = useSignatures();
  const { users } = useAdminConfig();
  const [draft, setDraft] = useState(cfg.defaultTemplate);
  const [links, setLinks] = useState<SignatureLink[]>(cfg.links);
  const [snippet, setSnippet] = useState(REFERENCE_SIGNATURE_SNIPPET);
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const visibleDirectory = SIGNATURE_DIRECTORY.filter(
    (p) => !cfg.hiddenDirectory.includes(p.email.toLowerCase()),
  );
  const directory = q
    ? visibleDirectory.filter((p) =>
        `${p.name} ${p.position} ${p.email}`.toLowerCase().includes(q),
      )
    : visibleDirectory;

  const dirty = draft !== cfg.defaultTemplate;
  const linksDirty = JSON.stringify(links) !== JSON.stringify(cfg.links);

  const isRawHtml = /<\s*(table|div|html)/i.test(snippet);
  const parsed = isRawHtml ? null : parseSignatureSnippet(snippet);
  const snippetProfile: SignatureProfile = { ...REFERENCE_SIGNATURE_PROFILE, ...(parsed ?? {}) };
  // Pasting the generator's rendered HTML renders it verbatim, so the preview
  // and the copied signature are pixel-identical to the real thing.
  const snippetHtml = isRawHtml ? snippet : buildSignatureHtml(snippetProfile, links);

  return (
    <div className="space-y-6">
      <section className="rounded-sm border border-border bg-surface">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Signature template</h2>
            <p className="text-xs text-muted-foreground">
              Paste an entry from the signature repo. The preview is the exact HTML that gets copied into Gmail.
            </p>
          </div>
          <CopyButton html={snippetHtml} text={buildSignatureText(snippetProfile, links)} />
        </header>
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div>
            <Label htmlFor="snippet" className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Snippet
            </Label>
            <Textarea
              id="snippet"
              rows={10}
              value={snippet}
              onChange={(e) => setSnippet(e.target.value)}
              className="font-mono text-xs"
            />
            <div className="mt-2 text-xs text-muted-foreground">
              {isRawHtml
                ? "Rendered signature HTML detected - previewed and copied exactly as pasted."
                : parsed
                  ? "Snippet parsed - preview updated."
                  : "Paste a repo snippet or the rendered signature HTML."}
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Preview (100% scale)
            </Label>
            <SignaturePreview html={snippetHtml} className="rounded-lg border border-border bg-white p-3" />
          </div>
        </div>
      </section>

      <section className="rounded-sm border border-border bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Team signature directory</h2>
            <p className="text-xs text-muted-foreground">
              All {SIGNATURE_DIRECTORY.length} entries from the signature repo. Headshots load from
              assets.YachtWay.com; icons and wordmark come from the shared signature assets.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {cfg.hiddenDirectory.length ? (
              <Button variant="ghost" size="sm" onClick={() => restoreDirectory(user)}>
                <Undo2 className="mr-1.5 h-3.5 w-3.5" /> Restore {cfg.hiddenDirectory.length} removed
              </Button>
            ) : null}
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, role or email"
            className="h-8 w-full max-w-[260px] text-xs"
          />
          </div>
        </header>
        <div className="divide-y divide-border">
          {directory.map((p) => {
            const html = buildSignatureHtml(p, links);
            return (
              <div key={p.email} className="grid gap-4 p-4 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
                <div>
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.position}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{p.email}</div>
                  {p.phone ? <div className="text-xs text-muted-foreground">{p.phone}</div> : null}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => setSnippet(directorySnippet(p))}>
                      Load snippet
                    </Button>
                    <CopyButton html={html} text={buildSignatureText(p, links)} />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => hideDirectoryEntry(p.email, user)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                    </Button>
                  </div>
                </div>
                <SignaturePreview html={html} className="rounded-lg border border-border bg-white p-3" />
              </div>
            );
          })}
          {directory.length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground">No team member matches that search.</div>
          ) : null}
        </div>
      </section>


      <section className="rounded-sm border border-border bg-surface">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Signature product links</h2>
            <p className="text-xs text-muted-foreground">
              Shown at the bottom of every rich signature (MasterCover, Financing, EasySign, Studio).
            </p>
          </div>
          <Button size="sm" disabled={!linksDirty} onClick={() => setSignatureLinks(links, user)}>
            <Save className="mr-1.5 h-3.5 w-3.5" /> Save links
          </Button>
        </header>
        <div className="grid gap-3 p-4 md:grid-cols-2">
          {links.map((l, i) => (
            <div key={i} className="grid grid-cols-2 gap-2">
              <Input
                value={l.label}
                onChange={(e) =>
                  setLinks((ls) => ls.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                }
              />
              <Input
                value={l.url}
                onChange={(e) =>
                  setLinks((ls) => ls.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))
                }
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-sm border border-border bg-surface">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Plain-text fallback template</h2>
            <p className="text-xs text-muted-foreground">
              Used when a signature is logged as plain text inside the CRM.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDraft(DEFAULT_SIGNATURE_TEMPLATE)}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset template
            </Button>
            <Button size="sm" disabled={!dirty} onClick={() => setDefaultTemplate(draft, user)}>
              <Save className="mr-1.5 h-3.5 w-3.5" /> Save
            </Button>
          </div>
        </header>

        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <div>
            <Label htmlFor="tpl" className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Template
            </Label>
            <Textarea
              id="tpl"
              rows={8}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="font-mono text-xs"
              maxLength={1000}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SIGNATURE_TOKENS.map((t) => (
                <button
                  key={t.token}
                  type="button"
                  title={t.label}
                  onClick={() => setDraft((b) => `${b}${t.token}`)}
                  className="rounded-sm border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground"
                >
                  {t.token}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Preview as {user.name}
            </Label>
            <pre className="whitespace-pre-wrap rounded-lg border border-border bg-secondary/40 p-3 text-[13px] leading-relaxed">
              {renderSignature(draft, user)}
            </pre>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <div>
            <div className="text-sm font-medium">Auto-append to outbound emails</div>
            <div className="text-xs text-muted-foreground">
              Signature is added to the body when a rep logs or sends an outbound email.
            </div>
          </div>
          <Switch checked={cfg.autoAppend} onCheckedChange={(v) => setAutoAppend(v, user)} />
        </div>
      </section>

      <section className="rounded-sm border border-border bg-surface">
        <header className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Per-user signatures</h2>
          <p className="text-xs text-muted-foreground">
            Users edit their own details from the account menu. Copy pastes the rich signature ready for Gmail.
          </p>
        </header>
        <table className="w-full text-[13px]">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left font-medium">User</th>
              <th className="px-4 py-2 text-left font-medium">Role</th>
              <th className="px-4 py-2 text-left font-medium">Signature</th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => {
              const own = cfg.byUser[u.id];
              const custom = !!own && !own.useDefault;
              const profile = profileForUser(cfg, u);
              const html = buildSignatureHtml(profile, cfg.links);
              return (
                <tr key={u.id} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{ROLE_LABELS[u.role]}</td>
                  <td className="px-4 py-3">
                    <SignaturePreview
                      html={html}
                      className="max-w-[520px] rounded-lg border border-border bg-white p-3"
                    />
                  </td>


                  <td className="px-4 py-3 text-right">
                    <CopyButton html={html} text={buildSignatureText(profile, cfg.links)} />
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!custom}
                      onClick={() => clearUserSignature(u.id, user, u.email)}
                    >
                      Reset to default
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteUserSignature(u.id, user, u.email)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
