import { useState } from "react";
import { LogOut, PenLine } from "lucide-react";
import { useAuth as useWorkOsAuth } from "@workos-inc/authkit-react";
import { ROLE_LABELS, useAuth } from "@/lib/auth";
import { EmailSignatureDialog } from "@/components/email-signature-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";


function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

/**
 * Signed-in account menu for real WorkOS sessions: shows the user, the role
 * resolved from their WorkOS org membership (read-only - the API derives the
 * real role from the token), and sign out.
 */
export function SessionMenu() {
  const { user } = useAuth();
  const { signOut } = useWorkOsAuth();
  const [sigOpen, setSigOpen] = useState(false);

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger className="group flex h-10 items-center gap-2.5 rounded-full border border-border bg-background/60 py-1 pl-1 pr-3 transition-colors hover:border-border hover:bg-background">
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-gradient-to-tr from-brand to-brand-deep text-xs font-bold text-brand-foreground shadow-inner">
          {initials(user.name)}
        </span>
        <span className="hidden text-left text-xs leading-tight sm:block">
          <span className="block font-semibold text-topbar-foreground transition-colors group-hover:text-brand">
            {user.name}
          </span>
          <span className="block text-[10px] text-topbar-foreground/60">
            {ROLE_LABELS[user.role]}
          </span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
          {user.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setSigOpen(true)}>
          <PenLine className="mr-2 h-4 w-4" />
          My email signature
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => signOut()}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <EmailSignatureDialog open={sigOpen} onOpenChange={setSigOpen} />
    </>
  );
}

