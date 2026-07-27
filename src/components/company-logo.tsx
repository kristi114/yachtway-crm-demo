import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { companyInitials, companyLogoUrl } from "@/lib/mock-data";
import type { Company } from "@/lib/mock-data";

export function CompanyLogo({
  company,
  size = "md",
  className,
}: {
  company: Company;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClasses = {
    sm: "h-6 w-6 text-[10px]",
    md: "h-10 w-10 text-xs",
    lg: "h-14 w-14 text-sm",
  };

  return (
    <Avatar className={cn("rounded-md border border-border bg-surface", sizeClasses[size], className)}>
      <AvatarImage
        src={companyLogoUrl(company)}
        alt={company.name}
        className="rounded-md object-contain p-1"
      />
      <AvatarFallback className="rounded-md bg-accent/60 font-semibold text-accent-foreground">
        {companyInitials(company.name)}
      </AvatarFallback>
    </Avatar>
  );
}
