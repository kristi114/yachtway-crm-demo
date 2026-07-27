import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { contactAvatarUrl, contactInitials } from "@/lib/mock-data";
import type { Contact } from "@/lib/mock-data";

export function ContactAvatar({
  contact,
  size = "md",
  className,
}: {
  contact: Contact;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClasses = {
    sm: "h-6 w-6 text-[10px]",
    md: "h-10 w-10 text-xs",
    lg: "h-16 w-16 text-base",
  };

  return (
    <Avatar className={cn("border border-border bg-surface", sizeClasses[size], className)}>
      <AvatarImage
        src={contactAvatarUrl(contact)}
        alt={`${contact.firstName} ${contact.lastName}`}
        className="object-cover"
      />
      <AvatarFallback className="bg-accent/60 font-semibold text-accent-foreground">
        {contactInitials(contact.firstName, contact.lastName)}
      </AvatarFallback>
    </Avatar>
  );
}
