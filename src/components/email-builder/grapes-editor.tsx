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
