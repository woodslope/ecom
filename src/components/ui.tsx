import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ImgHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { ChevronDown, ImageOff, LoaderCircle, RefreshCw, X } from "lucide-react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger";
  size?: "normal" | "compact";
  loading?: boolean;
  loadingLabel?: string;
};

export function Button({
  variant = "primary",
  size = "normal",
  className = "",
  type = "button",
  loading = false,
  loadingLabel = "处理中...",
  children,
  disabled = false,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`button button--${variant} button--${size} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : null}
      {loading ? loadingLabel : children}
    </button>
  );
}

export function IconButton({
  label,
  className = "",
  children,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button
      type={type}
      className={`icon-button ${className}`.trim()}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}

export function Badge({
  tone = "neutral",
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "primary" | "ai" | "success" | "warning" | "danger";
}) {
  return <span className={`badge badge--${tone} ${className}`.trim()} {...props} />;
}

export function StatusChip({
  tone = "neutral",
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "info" | "success" | "warning" | "danger" | "mode";
}) {
  return (
    <span className={`status-chip status-chip--${tone} ${className}`.trim()} {...props}>
      {children}
    </span>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  ariaLabel,
  className = "",
}: {
  options: readonly { value: T; label: ReactNode; disabled?: boolean }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div className={`segmented-control ${className}`.trim()} role="tablist" aria-label={ariaLabel}>
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            className={`segmented-control__option${isSelected ? " segmented-control__option--selected" : ""}`}
            aria-selected={isSelected}
            disabled={disabled || option.disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function MediaSlot({
  aspectRatio,
  state = "empty",
  src,
  alt,
  onRetry,
  onLoad,
  className = "",
}: {
  aspectRatio: string;
  state?: "empty" | "loading" | "ready" | "error";
  src?: string;
  alt: string;
  onRetry?: () => void;
  onLoad?: ImgHTMLAttributes<HTMLImageElement>["onLoad"];
  className?: string;
}) {
  return (
    <div
      className={`media-slot media-slot--${state} ${className}`.trim()}
      style={{ aspectRatio }}
      role={state === "loading" ? "status" : undefined}
      aria-busy={state === "loading" || undefined}
    >
      {state === "ready" && src ? <img src={src} alt={alt} onLoad={onLoad} /> : null}
      {state === "loading" ? (
        <span className="media-slot__loading" aria-label="正在加载">
          <span className="media-slot__skeleton" />
        </span>
      ) : null}
      {state === "error" ? (
        <span className="media-slot__message">
          <ImageOff size={18} aria-hidden="true" />
          <span>生成失败</span>
          {onRetry ? (
            <button type="button" className="media-slot__retry" onClick={onRetry}>
              <RefreshCw size={14} aria-hidden="true" />
              重试
            </button>
          ) : null}
        </span>
      ) : null}
      {state === "empty" ? (
        <span className="media-slot__message">
          <ImageOff size={18} aria-hidden="true" />
          <span>尚未生成</span>
        </span>
      ) : null}
    </div>
  );
}

export function ActionBar({
  primary,
  secondary,
  status,
  ariaLabel,
  className = "",
}: {
  primary?: ReactNode;
  secondary?: ReactNode;
  status?: ReactNode;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <footer className={`action-bar ${className}`.trim()} aria-label={ariaLabel}>
      {status ? <div className="action-bar__status">{status}</div> : null}
      {secondary ? <div className="action-bar__secondary">{secondary}</div> : null}
      {primary ? <div className="action-bar__primary">{primary}</div> : null}
    </footer>
  );
}

export function Field({
  label,
  hint,
  error,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`field ${className}`.trim()}>
      <span className="field__label">{label}</span>
      {children}
      {error ? <span className="field__error">{error}</span> : null}
      {!error && hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

export function Select({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={`select-control ${className}`.trim()}>
      <select className="select-control__input" {...props}>
        {children}
      </select>
      <ChevronDown className="select-control__icon" size={15} strokeWidth={2} aria-hidden="true" />
    </span>
  );
}

export function StatusMessage({
  tone = "neutral",
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return (
    <div
      className={`status-message status-message--${tone} ${className}`.trim()}
      role={tone === "danger" ? "alert" : "status"}
      {...props}
    >
      {children}
    </div>
  );
}

export function Tooltip({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: ReactElement;
}) {
  return (
    <span className={`tooltip ${className}`.trim()} data-tooltip={label}>
      {children}
    </span>
  );
}

export function Dialog({
  open,
  title,
  eyebrow,
  footer,
  className = "",
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  eyebrow?: string;
  footer?: ReactNode;
  className?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusableSelector =
      'button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';
    const focusFirstControl = window.requestAnimationFrame(() => {
      dialog?.querySelector<HTMLElement>(focusableSelector)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialog) return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFirstControl);
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="dialog-layer" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className={`dialog ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog__header">
          <div>
            {eyebrow ? <span className="dialog__eyebrow">{eyebrow}</span> : null}
            <h2 id={titleId}>{title}</h2>
          </div>
          <IconButton label="关闭弹窗" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="dialog__body">{children}</div>
        {footer ? <footer className="dialog__footer">{footer}</footer> : null}
      </section>
    </div>
  );
}

export function Panel({
  title,
  description,
  action,
  className = "",
  hideHeader = false,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  /** When true, omit the standard header band (e.g. inspector owns its own chrome). */
  hideHeader?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={`panel${hideHeader ? " panel--flush" : ""} ${className}`.trim()}
      aria-label={hideHeader ? title : undefined}
    >
      {hideHeader ? null : (
        <header className="panel__header">
          <div className="panel__heading">
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          {action ? <div className="panel__action">{action}</div> : null}
        </header>
      )}
      <div className="panel__body">{children}</div>
    </section>
  );
}

export function EmptyState({
  icon,
  eyebrow,
  title,
  description,
  details,
  action,
  variant = "dependency",
}: {
  icon: ReactNode;
  eyebrow?: string;
  title: string;
  description: string;
  details?: ReactNode;
  action?: ReactNode;
  variant?: "setup" | "dependency" | "selection" | "asset" | "loading" | "result";
}) {
  return (
    <div className={`empty-state empty-state--${variant}`}>
      <div className="empty-state__icon" aria-hidden="true">
        {icon}
      </div>
      <div className="empty-state__copy">
        {eyebrow ? <span className="empty-state__eyebrow">{eyebrow}</span> : null}
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {details ? <div className="empty-state__details">{details}</div> : null}
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}
