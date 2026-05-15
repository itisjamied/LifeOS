import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DialogShellProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
};

function DialogShell({ title, description, children, onClose }: DialogShellProps) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-background/70 px-3 py-4 backdrop-blur-sm sm:items-center sm:justify-center">
      <div className="w-full rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-2xl sm:max-w-md">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-foreground">{title}</h2>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export type AppTextDialogConfig = {
  title: string;
  description?: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  onSubmit: (value: string) => void | Promise<void>;
};

export function AppTextDialog({
  config,
  onClose,
}: {
  config: AppTextDialogConfig | null;
  onClose: () => void;
}) {
  const [value, setValue] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!config) return;
    setValue(config.initialValue ?? "");
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, [config]);

  if (!config) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await config.onSubmit(trimmed);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogShell title={config.title} description={config.description} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-bold uppercase text-muted-foreground">{config.label}</span>
          <Input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={config.placeholder}
            inputMode={config.inputMode}
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !value.trim()}>
            {config.confirmLabel ?? "Save"}
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}

export type AppConfirmDialogConfig = {
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
};

export function AppConfirmDialog({
  config,
  onClose,
}: {
  config: AppConfirmDialogConfig | null;
  onClose: () => void;
}) {
  const [submitting, setSubmitting] = React.useState(false);
  if (!config) return null;

  const confirm = async () => {
    setSubmitting(true);
    try {
      await config.onConfirm();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogShell title={config.title} description={config.description} onClose={onClose}>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          type="button"
          variant={config.destructive ? "destructive" : "default"}
          onClick={confirm}
          disabled={submitting}
        >
          {config.confirmLabel ?? "Continue"}
        </Button>
      </div>
    </DialogShell>
  );
}
