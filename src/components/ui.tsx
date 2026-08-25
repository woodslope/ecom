import {
  Children,
  cloneElement,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ImgHTMLAttributes,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ImageOff, LoaderCircle, RefreshCw, X } from "lucide-react";

const OVERLAY_ROOT_ID = "ecom-overlay-root";
const dialogStack: HTMLElement[] = [];

function overlayRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const existing = document.getElementById(OVERLAY_ROOT_ID);
  if (existing) return existing;
  const root = document.createElement("div");
  root.id = OVERLAY_ROOT_ID;
  root.className = "ecom-overlay-root";
  document.body.append(root);
  return root;
}

export function syncModalEnvironment(): void {
  if (typeof document === "undefined") return;
  const desktopContent = document.querySelector<HTMLElement>(".app-desktop-content");
  const gateActive = Boolean(document.querySelector(".desktop-only-gate:not([hidden])"));
  const modalActive = dialogStack.length > 0;
  if (desktopContent) {
    desktopContent.inert = gateActive || modalActive;
    if (gateActive || modalActive) desktopContent.setAttribute("aria-hidden", "true");
    else desktopContent.removeAttribute("aria-hidden");
  }

  const root = document.getElementById(OVERLAY_ROOT_ID);
  if (root) {
    root.inert = gateActive;
    if (gateActive) root.setAttribute("aria-hidden", "true");
    else root.removeAttribute("aria-hidden");
  }

  dialogStack.forEach((dialog, index) => {
    const layer = dialog.closest<HTMLElement>(".dialog-layer");
    if (!layer) return;
    const active = !gateActive && index === dialogStack.length - 1;
    layer.inert = !active;
    if (active) layer.removeAttribute("aria-hidden");
    else layer.setAttribute("aria-hidden", "true");
  });
}

function registerDialog(dialog: HTMLElement): () => void {
  const priorIndex = dialogStack.indexOf(dialog);
  if (priorIndex >= 0) dialogStack.splice(priorIndex, 1);
  dialogStack.push(dialog);
  syncModalEnvironment();
  return () => {
    const index = dialogStack.indexOf(dialog);
    if (index >= 0) dialogStack.splice(index, 1);
    syncModalEnvironment();
  };
}

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

// Compatibility export for restored/third-party consumers. Remove only after a
// separately approved API cleanup confirms there are no business-view users.
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
  id,
  className = "",
}: {
  options: readonly { value: T; label: ReactNode; disabled?: boolean }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel: string;
  id?: string;
  className?: string;
}) {
  return (
    <div id={id} className={`segmented-control ${className}`.trim()} role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={`segmented-control__option${isSelected ? " segmented-control__option--selected" : ""}`}
            aria-pressed={isSelected}
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
        <span className="media-slot__loading" aria-label="正在生成图片">
          <span className="media-slot__skeleton media-slot__skeleton--image" />
          <span className="media-slot__skeleton media-slot__skeleton--caption" />
          <span className="media-slot__loading-label">正在生成图片</span>
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
  id,
  name,
  required,
  invalid = false,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  id?: string;
  name?: string;
  required?: boolean;
  invalid?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const generatedId = useId();
  const controlId = id ?? `field-${generatedId}`;
  const labelId = `${controlId}-label`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const singleChild = Children.count(children) === 1 ? Children.only(children) : null;
  const childElement = isValidElement<Record<string, unknown>>(singleChild) ? singleChild : null;
  const canLabelChild =
    childElement !== null &&
    ((typeof childElement.type === "string" && ["input", "select", "textarea"].includes(childElement.type)) ||
      childElement.type === Select);
  const describedBy = [
    childElement && typeof childElement.props["aria-describedby"] === "string"
      ? childElement.props["aria-describedby"]
      : null,
    hintId,
    errorId,
  ]
    .filter(Boolean)
    .join(" ");
  const enhanceControl = (node: ReactNode): ReactNode => {
    if (!isValidElement<Record<string, unknown>>(node)) return node;
    const isControl =
      (typeof node.type === "string" && ["input", "select", "textarea"].includes(node.type)) ||
      node.type === Select;
    if (isControl) {
      return cloneElement(node, {
        id: node.props.id ?? controlId,
        ...(name !== undefined ? { name } : {}),
        ...(required !== undefined ? { required } : {}),
        ...(invalid || Boolean(error) ? { "aria-invalid": true } : {}),
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
      });
    }
    if (node.props.children === undefined) return node;
    return cloneElement(node, undefined, Children.map(node.props.children as ReactNode, enhanceControl));
  };
  const enhancedChildren = canLabelChild ? enhanceControl(childElement) : Children.map(children, enhanceControl);

  return (
    <div
      className={`field ${className}`.trim()}
      role={canLabelChild ? undefined : "group"}
      aria-labelledby={canLabelChild ? undefined : labelId}
    >
      <label className="field__label" id={labelId} htmlFor={canLabelChild ? controlId : undefined}>
        {label}
      </label>
      {enhancedChildren}
      {error ? (
        <span className="field__error" id={errorId}>
          {error}
        </span>
      ) : null}
      {!error && hint ? (
        <span className="field__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
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
  live = "off",
  className = "",
  children,
  role,
  "aria-live": ariaLive,
  "aria-atomic": ariaAtomic,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  tone?: "neutral" | "success" | "warning" | "danger";
  live?: "off" | "polite" | "assertive";
}) {
  const resolvedRole = role ?? (live === "assertive" ? "alert" : live === "polite" ? "status" : undefined);
  return (
    <div
      className={`status-message status-message--${tone} ${className}`.trim()}
      role={resolvedRole}
      aria-live={ariaLive ?? (live === "off" ? undefined : live)}
      aria-atomic={ariaAtomic ?? (live === "off" ? undefined : true)}
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
  id,
  title,
  ariaLabel,
  closeLabel,
  eyebrow,
  footer,
  variant = "modal",
  className = "",
  onClose,
  children,
}: {
  open: boolean;
  id?: string;
  title: string;
  ariaLabel?: string;
  closeLabel?: string;
  eyebrow?: string;
  footer?: ReactNode;
  variant?: "modal" | "sidebar";
  className?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const unregisterDialog = registerDialog(dialog);
    const focusableSelector =
      'button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';
    const focusFirstControl = window.requestAnimationFrame(() => {
      dialog?.querySelector<HTMLElement>(focusableSelector)?.focus();
    });
    const isTopmostDialog = () => {
      const root = document.getElementById(OVERLAY_ROOT_ID);
      return !root?.inert && dialogStack.at(-1) === dialog;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopmostDialog()) return;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialog) return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusable.length === 0) {
        event.preventDefault();
        event.stopImmediatePropagation();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        event.stopImmediatePropagation();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        event.stopImmediatePropagation();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFirstControl);
      document.removeEventListener("keydown", handleKeyDown);
      unregisterDialog();
      if (previousFocus?.isConnected && !previousFocus.closest("[inert]")) previousFocus.focus();
    };
  }, [open]);

  if (!open) return null;

  const layer = (
    <div
      className={`dialog-layer dialog-layer--${variant}`}
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        id={id}
        ref={dialogRef}
        className={`dialog dialog--${variant} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel ? undefined : titleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog__header">
          <div>
            {eyebrow ? <span className="dialog__eyebrow">{eyebrow}</span> : null}
            <h2 id={titleId}>{title}</h2>
          </div>
          <IconButton label={closeLabel ?? (variant === "sidebar" ? "关闭侧栏" : "关闭弹窗")} onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="dialog__body">{children}</div>
        {footer ? <footer className="dialog__footer">{footer}</footer> : null}
      </section>
    </div>
  );
  const root = overlayRoot();
  return root ? createPortal(layer, root) : layer;
}

export function ConfirmDialog({
  open,
  title,
  description,
  eyebrow = "请确认操作",
  confirmLabel = "确认",
  cancelLabel = "取消",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  eyebrow?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Callers hide the parent dialog while this replaces it so the shared modal
  // stack keeps one active focus trap. Revisit when nested modal ownership changes.
  return (
    <Dialog
      open={open}
      title={title}
      eyebrow={eyebrow}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>{cancelLabel}</Button>
          <Button variant="danger" onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      <p>{description}</p>
    </Dialog>
  );
}

export function Panel({
  title,
  description,
  descriptionId,
  descriptionClassName = "",
  action,
  className = "",
  hideHeader = false,
  children,
}: {
  title: string;
  description?: string;
  descriptionId?: string;
  descriptionClassName?: string;
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
            {description ? <p id={descriptionId} className={descriptionClassName}>{description}</p> : null}
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
