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

/**
 * Drag-and-drop email designer built on GrapesJS + the MJML-style newsletter
 * preset. Ships with text, image, button, divider and multi-column section
 * blocks; the block manager, layer manager and style editor are all rendered
 * inline. Fully self-hosted — no template content ever leaves your infra.
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

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
    let editor: unknown;

    (async () => {
      try {
        const [{ default: grapesjs }, { default: presetNewsletter }] = await Promise.all([
          import("grapesjs"),
          import("grapesjs-preset-newsletter"),
        ]);
        if (cancelled || !containerRef.current) return;

        // Register the preset under a stable name so string-keyed pluginsOpts bind.
        const PRESET = "grapesjs-preset-newsletter";
        grapesjs.plugins.add(PRESET, presetNewsletter);

        editor = grapesjs.init({
          container: containerRef.current,
          height: "620px",
          width: "100%",
          storageManager: false,
          fromElement: false,
          plugins: [PRESET],
          pluginsOpts: {
            [PRESET]: {
              modalLabelImport: "Paste your HTML here and click Import",
              modalLabelExport: "Copy the HTML below",
              inlineCss: true,
            },
          },
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ed = editor as any;
        editorRef.current = ed;

        if (design) {
          try {
            ed.loadProjectData(design);
          } catch {
            if (html) ed.setComponents(html);
          }
        } else if (html) {
          ed.setComponents(html);
        }

        if (!cancelled) setStatus("ready");
      } catch (err) {
        console.error("Failed to init GrapesJS editor", err);
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (editor as any)?.destroy?.();
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
      {status === "error" ? (
        <div className="p-8 text-sm text-destructive">
          The visual designer failed to load. Switch to the HTML tab to keep editing.
        </div>
      ) : null}
      {status === "loading" ? (
        <div className="p-8 text-sm text-muted-foreground">Loading the drag-and-drop designer…</div>
      ) : null}
      <div ref={containerRef} className={status === "ready" ? "block" : "hidden"} />
    </div>
  );
});
