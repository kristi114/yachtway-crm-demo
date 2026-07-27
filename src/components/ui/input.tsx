import * as React from "react";

import { cn } from "@/lib/utils";
import { correctBrandCase, shouldCorrectInputType } from "@/lib/brand-case";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onChange, ...props }, ref) => {
    const handleChange = React.useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        if (shouldCorrectInputType(type)) {
          const corrected = correctBrandCase(event.target.value);
          if (corrected !== event.target.value) {
            const start = event.target.selectionStart;
            const end = event.target.selectionEnd;
            event.target.value = corrected;
            try {
              event.target.setSelectionRange(start, end);
            } catch {
              // input types that do not support selection
            }
          }
        }
        onChange?.(event);
      },
      [onChange, type],
    );

    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        onChange={handleChange}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
