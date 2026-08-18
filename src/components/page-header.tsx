import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  icon,
  leading,
  actions,
  className = "mb-6",
}: PageHeaderProps) {
  return (
    <header className={className}>
      <div className="flex items-center justify-between gap-3">
        {leading && <div className="shrink-0">{leading}</div>}
        <div className={`min-w-0 flex-1 ${icon ? "flex items-center gap-3" : ""}`}>
          {icon && <div className="shrink-0">{icon}</div>}
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-[11px] font-semibold uppercase text-muted-foreground">{eyebrow}</p>
            )}
            <h1 className="mt-1 truncate text-3xl text-foreground">{title}</h1>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center justify-end gap-2">{actions}</div>}
      </div>
    </header>
  );
}
