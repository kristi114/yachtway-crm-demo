import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@workos-inc/authkit-react";

export const Route = createFileRoute("/callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Signing in - YachtWay CRM" },
      { name: "description", content: "Completing your secure sign-in to the YachtWay CRM." },
      { property: "og:title", content: "Signing in - YachtWay CRM" },
      { property: "og:description", content: "Completing your secure sign-in to the YachtWay CRM." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Callback,
});

function Callback() {
  const { isLoading, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && user) navigate({ to: "/", replace: true });
  }, [isLoading, user, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Signing you in…</p>
    </div>
  );
}
