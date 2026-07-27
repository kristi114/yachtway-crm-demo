import type { ComponentType } from "react";

type SectionTabItem = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export function SectionTabs({
  items,
  active,
  onChange,
}: {
  items: SectionTabItem[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="flex gap-1 overflow-x-auto px-4 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                isActive
                  ? "bg-brand/10 text-brand-deep ring-1 ring-brand/30"
                  : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
