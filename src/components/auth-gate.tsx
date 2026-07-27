import { useEffect, useState, type ReactNode } from "react";
import { AuthKitProvider, useAuth as useWorkOsAuth } from "@workos-inc/authkit-react";
import { AuthProvider, type SessionOverride } from "@/lib/auth";
import { setAccessTokenProvider } from "@/lib/api/config";
import { WORKOS_CLIENT_ID, WORKOS_ENABLED, resolveRedirectUri, roleFromWorkOs } from "@/lib/workos";
import logoDark from "@/assets/yachtway-black.png.asset.json";

/**
 * Auth boundary for the whole CRM.
 *
 * - AuthKit is browser-only (it touches window/localStorage), so the provider
 *   is mounted after hydration; SSR renders a neutral shell.
 * - When VITE_WORKOS_CLIENT_ID is unset the app keeps running on the local
 *   demo session so previews/mock data still work.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!WORKOS_ENABLED) return <AuthProvider>{children}</AuthProvider>;
  if (!mounted) return <Splash label="Loading YachtWay CRM…" />;

  return (
    <AuthKitProvider clientId={WORKOS_CLIENT_ID!} redirectUri={resolveRedirectUri()}>
      <WorkOsSession>{children}</WorkOsSession>
    </AuthKitProvider>
  );
}

function WorkOsSession({ children }: { children: ReactNode }) {
  const { isLoading, user, role, getAccessToken, signIn } = useWorkOsAuth();

  // Every API request pulls a fresh (auto-refreshed) token through here.
  useEffect(() => {
    if (!user) {
      setAccessTokenProvider(null);
      return;
    }
    setAccessTokenProvider(() => getAccessToken());
    return () => setAccessTokenProvider(null);
  }, [user, getAccessToken]);

  if (isLoading) return <Splash label="Checking your session…" />;

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <img src={logoDark.url} alt="YachtWay" className="mx-auto h-7 w-auto dark:invert" />
          <h1 className="mt-6 text-lg font-semibold text-foreground">Sign in to YachtWay CRM</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Use your YachtWay account. Your permissions come from your role in WorkOS.
          </p>
          <button
            type="button"
            onClick={() => signIn()}
            className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Continue with WorkOS
          </button>
        </div>
      </div>
    );
  }

  const session: SessionOverride = {
    id: user.id,
    name:
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.email ||
      "YachtWay user",
    email: user.email ?? "",
    role: roleFromWorkOs(role),
  };

  return <AuthProvider session={session}>{children}</AuthProvider>;
}

function Splash({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

/** Sign-out helper usable from anywhere inside the AuthKit provider. */
export function useWorkOsSession() {
  return useWorkOsAuth();
}
