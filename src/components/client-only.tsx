import { useEffect, useState, type ReactNode } from "react";

/**
 * Renders children only after hydration on the client.
 *
 * The email editors (GrapesJS, CodeMirror) touch `window`/`document` and cannot
 * run during TanStack Start's SSR pass. Wrapping them here keeps the server
 * render to a lightweight `fallback` and mounts the real editor in the browser.
 */
export function ClientOnly({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <>{mounted ? children : fallback}</>;
}
