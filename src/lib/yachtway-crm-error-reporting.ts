/**
 * Client-side error reporting hook for the standalone YachtWay CRM.
 *
 * Self-contained seam: today it logs to the console, and it's the one place to
 * wire a real error service (Sentry, self-hosted GlitchTip, etc.) later. Kept
 * dependency-free so the app has no runtime ties to any external platform.
 */
type ErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

/**
 * Report a client error. The `reportLovableError` name is retained so existing
 * call sites don't need to change; it no longer references any external platform.
 */
export function reportLovableError(
  error: unknown,
  context: Record<string, unknown> = {},
  options: ErrorOptions = { mechanism: "react_error_boundary", handled: false, severity: "error" },
) {
  if (typeof window === "undefined") return;
  const payload = {
    source: "react_error_boundary",
    route: window.location.pathname,
    ...context,
    ...options,
  };
  // Replace this with a call to your error service.
  console.error("[crm:error]", error, payload);
}
