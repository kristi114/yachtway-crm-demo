import * as React from "react";

import { cn } from "@/lib/utils";
import { correctBrandCase } from "@/lib/brand-case";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, onChange, ...props }, ref) => {
    const handleChange = React.useCallback(
      (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const corrected = correctBrandCase(event.target.value);
        if (corrected !== event.target.value) {
          const start = event.target.selectionStart;
          const end = event.target.selectionEnd;
          event.target.value = corrected;
          event.target.setSelectionRange(start, end);
        }
        onChange?.(event);
      },
      [onChange],
    );

    return (
      <textarea
        className={cn(
          "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        onChange={handleChange}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
