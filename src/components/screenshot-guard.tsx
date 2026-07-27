import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ShieldAlert, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { logScreenshotEvent } from "@/lib/screenshot-log";

/**
 * Best-effort screenshot detection for the web.
 * Browsers cannot truly block OS-level screenshots, but we can:
 *   - listen for common capture shortcuts (PrintScreen, Cmd/Ctrl+Shift+3/4/5, Ctrl+Shift+S)
 *   - briefly blur/hide the page contents
 *   - warn the user + log the attempt against their account
 */
export function ScreenshotGuard() {
  // TEMPORARILY DISABLED for development so the team can take notes/screenshots.
  // Re-enable before production by removing this early return.
  return null;
  // eslint-disable-next-line no-unreachable
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<string>("");
  const lastFireRef = useRef(0);

  useEffect(() => {
    function trigger(m: string) {
      const now = Date.now();
      if (now - lastFireRef.current < 1500) return;
      lastFireRef.current = now;
      setMethod(m);
      setOpen(true);
      logScreenshotEvent({
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        role: user.role,
        method: m,
        path: typeof window !== "undefined" ? window.location.pathname : "",
      });
      toast.error("Screenshot attempt detected", {
        description: `Recorded against ${user.name}. Company data is confidential.`,
        duration: 6000,
      });
    }

    function onKeyDown(e: KeyboardEvent) {
      const key = e.key;
      // PrintScreen (usually only fires on keyup on Windows, but try both)
      if (key === "PrintScreen") {
        trigger("PrintScreen");
        return;
      }
      // macOS: Cmd+Shift+3 (full), 4 (region), 5 (menu)
      if (e.metaKey && e.shiftKey && (key === "3" || key === "4" || key === "5")) {
        trigger(`Cmd+Shift+${key}`);
        return;
      }
      // Windows Snip & Sketch: Win+Shift+S (Win key rarely reachable in browser),
      // some users use Ctrl+Shift+S in tools
      if (e.ctrlKey && e.shiftKey && (key === "S" || key === "s")) {
        trigger("Ctrl+Shift+S");
        return;
      }
      // Windows: Alt+PrintScreen active window
      if (e.altKey && key === "PrintScreen") {
        trigger("Alt+PrintScreen");
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "PrintScreen") trigger("PrintScreen");
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [user]);

  return (
    <>
      {/* Brief blur veil while the modal is open - obscures anything an in-progress screenshot might capture. */}
      {open && (
        <div
          aria-hidden
          className="fixed inset-0 z-[90] backdrop-blur-xl bg-background/70"
        />
      )}
      {open && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="screenshot-warning-title"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
          <div className="w-full max-w-lg rounded-2xl border border-destructive/30 bg-card p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive">
                <ShieldAlert className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <h2
                  id="screenshot-warning-title"
                  className="text-base font-semibold text-brand-deep"
                >
                  Screenshots are not allowed
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  We detected a screen capture attempt ({method}). This action has
                  been recorded against your account.
                </p>
                <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed text-foreground/80">
                  All information on <strong>YachtWay.com</strong> and inside the{" "}
                  <strong>YachtWay CRM</strong> - including customer data,
                  contracts, pricing and internal notes - is strictly confidential
                  and is not to be shared, exported or forwarded outside your
                  department without written authorization.
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  Logged for: <span className="font-medium text-foreground">{user.name}</span> ·{" "}
                  {user.email}
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted-foreground transition hover:bg-muted"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="inline-flex items-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition hover:bg-destructive/90"
              >
                I understand
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
