import { useEffect, useRef, useState } from "react";

import { SIGNATURE_FONTS_HREF } from "@/lib/signature-html";

/**
 * Pixel-accurate signature preview.
 *
 * The signature is table + inline-style markup meant for a mail client, so it
 * is rendered inside an isolated iframe (no CRM CSS leaking in). The iframe is
 * measured after load and scaled down only when it is wider than the available
 * space, so what is shown matches exactly what gets pasted into Gmail.
 */
export function SignaturePreview({ html, className }: { html: string; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [size, setSize] = useState({ w: 720, h: 320 });
  const [scale, setScale] = useState(1);

  const srcDoc = `<!doctype html><html><head><meta charset="utf-8" /><base target="_blank" /><link rel="stylesheet" href="${SIGNATURE_FONTS_HREF}" /></head><body style="margin:0;padding:0;background:#ffffff;"><div style="display:inline-block;">${html}</div></body></html>`;

  const measure = () => {
    const doc = frameRef.current?.contentDocument;
    const el = doc?.body?.firstElementChild as HTMLElement | undefined;
    if (!el) return;
    const w = Math.ceil(el.scrollWidth);
    const h = Math.ceil(el.scrollHeight);
    if (w > 0 && h > 0) setSize({ w, h });
  };

  useEffect(() => {
    const id = window.setTimeout(measure, 250);
    return () => window.clearTimeout(id);
  }, [html]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const update = () => {
      const cw = wrap.clientWidth;
      setScale(cw > 0 && size.w > cw ? cw / size.w : 1);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [size.w]);

  return (
    <div ref={wrapRef} className={className}>
      <div style={{ height: size.h * scale, overflow: "hidden" }}>
        <iframe
          ref={frameRef}
          title="Email signature preview"
          srcDoc={srcDoc}
          onLoad={measure}
          scrolling="no"
          style={{
            width: size.w,
            height: size.h,
            border: 0,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        />
      </div>
    </div>
  );
}
