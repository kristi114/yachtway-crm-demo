import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

// Editor + newsletter preset styles. CSS imports are SSR-safe in Vite (no-op on
// the server); the grapesjs runtime itself is dynamically imported below so it
// never touches `window` during SSR.
import "grapesjs/dist/css/grapes.min.css";
// Enlarges GrapesJS's small editor-chrome text (block labels, device selector,
// panel labels). Imported after grapes.min.css so it wins.
import "./grapes-overrides.css";

export interface GrapesContent {
  /** Inlined, email-safe HTML (styles pushed onto elements). */
  html: string;
  /** GrapesJS project JSON so the canvas can re-hydrate on next open. */
  design: unknown;
}

export interface GrapesEditorHandle {
  getContent: () => GrapesContent;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// Interop: grapesjs / the preset may be exposed as the default export or as the
// module namespace depending on how the bundler interops the CJS/UMD build.
function resolveDefault(mod: any): any {
  return mod && mod.default ? mod.default : mod;
}

/**
 * Register email content + layout blocks on the editor's BlockManager. Done
 * directly (not via a preset) so the Blocks panel is always populated with the
 * expected set: text, heading, image, button, divider, spacer, and 1/2/3-column
 * layouts. All blocks carry inline, email-client-safe styles.
 */
function registerEmailBlocks(editor: any) {
  const bm = editor.BlockManager;
  const CONTENT = "Content";
  const LAYOUT = "Layout";
  const cell = (inner: string) =>
    `<td style="padding:12px;vertical-align:top;font-family:Arial,Helvetica,sans-serif;">${inner}</td>`;
  const placeholder = '<div style="min-height:24px;"></div>';

  const blocks: Array<{ id: string; label: string; category: string; content: any }> = [
    {
      id: "yw-heading",
      label: "Heading",
      category: CONTENT,
      content:
        '<h1 style="margin:0;padding:8px 16px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:1.3;color:#0b1f33;">Your headline</h1>',
    },
    {
      id: "yw-text",
      label: "Text",
      category: CONTENT,
      content:
        '<p style="margin:0;padding:8px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1a2b3c;">Insert your text here. Double-click to edit.</p>',
    },
    {
      id: "yw-image",
      label: "Image",
      category: CONTENT,
      content: { type: "image", activeOnRender: 1, style: { width: "100%", "max-width": "600px", display: "block" } },
    },
    {
      id: "yw-button",
      label: "Button",
      category: CONTENT,
      content:
        '<a href="#" style="display:inline-block;margin:12px 16px;padding:12px 22px;background:#0b1f33;color:#ffffff;text-decoration:none;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-weight:600;font-size:14px;">Call to action</a>',
    },
    {
      id: "yw-divider",
      label: "Divider",
      category: CONTENT,
      content: '<hr style="border:none;border-top:1px solid #e2e6ea;margin:16px;" />',
    },
    {
      id: "yw-spacer",
      label: "Spacer",
      category: CONTENT,
      content: '<div style="height:24px;line-height:24px;font-size:0;">&nbsp;</div>',
    },
    {
      id: "yw-sect-1",
      label: "1 Column",
      category: LAYOUT,
      content: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;"><tr>${cell(placeholder)}</tr></table>`,
    },
    {
      id: "yw-sect-2",
      label: "2 Columns",
      category: LAYOUT,
      content: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;"><tr>${cell(placeholder)}${cell(placeholder)}</tr></table>`,
    },
    {
      id: "yw-sect-3",
      label: "3 Columns",
      category: LAYOUT,
      content: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;"><tr>${cell(placeholder)}${cell(placeholder)}${cell(placeholder)}</tr></table>`,
    },
  ];

  for (const b of blocks) {
    bm.add(b.id, { label: b.label, category: b.category, content: b.content, media: "" });
  }

  // Make sure the Blocks panel is open so the set is visible on load.
  try {
    editor.runCommand("open-blocks");
  } catch {
    /* command name differs across versions — non-fatal */
  }
}

/**
 * Drag-and-drop email designer built on GrapesJS + the MJML-style newsletter
 * preset. Ships with text, image, button, divider and multi-column section
 * blocks. Fully self-hosted — no template content ever leaves your infra.
 */
export const GrapesEditor = forwardRef<
  GrapesEditorHandle,
  {
    /** Existing GrapesJS project JSON (preferred) to restore the canvas. */
    design?: unknown | null;
    /** Fallback HTML to import when there's no saved project JSON yet. */
    html?: string;
  }
>(function GrapesEditor({ design, html }, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useImperativeHandle(ref, () => ({
    getContent(): GrapesContent {
      const editor = editorRef.current;
      if (!editor) return { html: html ?? "", design: design ?? null };
      let inlined = "";
      try {
        // Newsletter preset command: returns a full HTML doc with inlined CSS.
        inlined = editor.runCommand("gjs-get-inlined-html") as string;
      } catch {
        inlined = `${editor.getHtml()}<style>${editor.getCss()}</style>`;
      }
      return { html: inlined || "", design: editor.getProjectData() };
    },
  }));

  useEffect(() => {
    let cancelled = false;
    let editor: any;

    (async () => {
      try {
        const grapesjs = resolveDefault(await import("grapesjs"));
        if (!grapesjs || typeof grapesjs.init !== "function") {
          throw new Error("grapesjs module did not expose init()");
        }

        // The newsletter preset is optional: if it fails to load we still bring
        // up the core editor rather than failing the whole designer.
        const plugins: any[] = [];
        try {
          const presetNewsletter = resolveDefault(await import("grapesjs-preset-newsletter"));
          if (typeof presetNewsletter === "function") plugins.push(presetNewsletter);
        } catch (presetErr) {
          console.warn("grapesjs-preset-newsletter failed to load; using base editor", presetErr);
        }

        if (cancelled || !containerRef.current) return;

        editor = grapesjs.init({
          container: containerRef.current,
          height: "620px",
          width: "100%",
          storageManager: false,
          fromElement: false,
          plugins,
          pluginsOpts:
            plugins.length > 0
              ? {
                  [plugins[0] as any]: {
                    modalLabelImport: "Paste your HTML here and click Import",
                    modalLabelExport: "Copy the HTML below",
                    inlineCss: true,
                  },
                }
              : {},
        });

        editorRef.current = editor;

        // Register a reliable set of email blocks directly on the BlockManager so
        // the Blocks panel is always populated (independent of any preset). These
        // use inline, email-safe styles. Drag them onto the canvas.
        registerEmailBlocks(editor);

        if (design) {
          try {
            editor.loadProjectData(design);
          } catch {
            if (html) editor.setComponents(html);
          }
        } else if (html) {
          editor.setComponents(html);
        }

        if (!cancelled) setStatus("ready");
      } catch (err) {
        console.error("Failed to init GrapesJS editor", err);
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : String(err));
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        editor?.destroy?.();
      } catch {
        /* ignore */
      }
      editorRef.current = null;
    };
    // Init once — content updates flow through the imperative handle on save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      {status === "loading" ? (
        <div className="p-3 text-sm text-muted-foreground">Loading the drag-and-drop designer…</div>
      ) : null}
      {status === "error" ? (
        <div className="p-4 text-sm text-destructive">
          The visual designer failed to load{errorMsg ? `: ${errorMsg}` : ""}. Switch to the HTML tab
          to keep editing.
        </div>
      ) : null}
      {/* Container must stay visible + sized during init — GrapesJS breaks if it
          initializes into a display:none / zero-size element. */}
      <div ref={containerRef} style={{ minHeight: 620 }} />
    </div>
  );
});
