import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { html as htmlLang } from "@codemirror/lang-html";
import { Monitor, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * VS Code-style HTML editor with an automatic live preview (GHL-style).
 *
 * Left pane  → CodeMirror with HTML syntax highlighting, line numbers, bracket
 *              matching and auto-close tags.
 * Right pane → a sandboxed iframe that re-renders (debounced) on every keystroke,
 *              with a desktop / mobile width toggle so you see how the email wraps.
 *
 * The iframe is `sandbox`ed without `allow-scripts` so pasted email HTML can never
 * execute JS in the CRM — a hard requirement for SOC 2.
 */
export function HtmlCodeEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [preview, setPreview] = useState(value);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced preview so typing stays smooth on large templates.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setPreview(value), 180);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [value]);

  const extensions = useMemo(() => [htmlLang()], []);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {/* Editor */}
      <div className="flex min-h-[520px] flex-col overflow-hidden rounded-lg border border-border bg-[#1e1e1e]">
        <div className="flex items-center justify-between border-b border-black/40 px-3 py-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-white/60">
            email.html
          </span>
          <span className="text-[11px] text-white/40">HTML</span>
        </div>
        <CodeMirror
          value={value}
          height="520px"
          theme="dark"
          extensions={extensions}
          onChange={onChange}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLine: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            foldGutter: true,
          }}
        />
      </div>

      {/* Live preview */}
      <div className="flex min-h-[520px] flex-col overflow-hidden rounded-lg border border-border bg-muted/40">
        <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Live preview
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant={device === "desktop" ? "default" : "ghost"}
              className="h-7 px-2"
              onClick={() => setDevice("desktop")}
            >
              <Monitor className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant={device === "mobile" ? "default" : "ghost"}
              className="h-7 px-2"
              onClick={() => setDevice("mobile")}
            >
              <Smartphone className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="flex flex-1 justify-center overflow-auto bg-[#f4f5f7] p-4">
          <iframe
            title="Email preview"
            sandbox="allow-same-origin"
            className="h-full w-full rounded border border-border bg-white shadow-sm transition-all"
            style={{ maxWidth: device === "mobile" ? 390 : "100%" }}
            srcDoc={preview}
          />
        </div>
      </div>
    </div>
  );
}
