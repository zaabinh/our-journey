import {
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEventHandler,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
} from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';

export function Button({
  variant = 'primary',
  className = '',
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  return (
    <button
      type="button"
      className={`button ${variant} ${className}`}
      {...props}
      onClick={(event) => {
        event.currentTarget.focus();
        onClick?.(event);
      }}
    />
  );
}
export function Input({
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const uid = useId();
  const id = props.id ?? uid;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        {...props}
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : props['aria-describedby']}
      />
      {error && (
        <span id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
export function Textarea({
  label,
  error,
  inputRef,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
  inputRef?: Ref<HTMLTextAreaElement>;
}) {
  const uid = useId();
  const id = props.id ?? uid;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea
        {...props}
        ref={inputRef}
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : props['aria-describedby']}
      />
      {error && (
        <span id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
export function Card({ children, className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <article className={`card ${className}`} {...props}>
      {children}
    </article>
  );
}
export function Alert({ children }: { children: ReactNode }) {
  return (
    <div className="alert" role="alert">
      {children}
    </div>
  );
}
export function Toast({ children }: { children: ReactNode }) {
  return (
    <div role="status" aria-live="polite">
      {children}
    </div>
  );
}
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="empty">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
export function Skeleton({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <div className="skeleton" role="status">
      {label}
    </div>
  );
}
export function Avatar({ name, src }: { name: string; src?: string }) {
  return (
    <span className="avatar" aria-label={name}>
      {src ? <img src={src} alt="" /> : name.slice(0, 1).toUpperCase()}
    </span>
  );
}
export function Dropdown({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  disabled?: boolean;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select disabled={disabled} id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
export function Dialog({
  title,
  description,
  open,
  onOpenChange,
  trigger,
  children,
  dirty = false,
  pending = false,
  onKeyDown,
}: {
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ReactNode;
  children: ReactNode;
  dirty?: boolean;
  pending?: boolean;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
}) {
  const previousFocus = useRef<HTMLElement | null>(null);
  const content = useRef<HTMLDivElement | null>(null);
  function change(next: boolean) {
    if (!next && (pending || (dirty && !window.confirm('Bỏ các thay đổi chưa lưu?')))) return;
    onOpenChange(next);
  }
  return (
    <RadixDialog.Root open={open} onOpenChange={change}>
      {trigger && <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>}
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="dialog-overlay" />
        <RadixDialog.Content
          ref={content}
          className="dialog-content"
          onKeyDown={onKeyDown}
          onOpenAutoFocus={(event) => {
            previousFocus.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            const initial = content.current?.querySelector<HTMLElement>('[data-initial-focus]');
            if (initial) {
              event.preventDefault();
              initial.focus();
            }
          }}
          onCloseAutoFocus={(e) => {
            if (!trigger) {
              e.preventDefault();
              (previousFocus.current?.isConnected
                ? previousFocus.current
                : document.getElementById('main')
              )?.focus();
            }
          }}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <div className="dialog-heading">
            <RadixDialog.Title>{title}</RadixDialog.Title>
            <RadixDialog.Close asChild>
              <Button variant="secondary" aria-label="Đóng" disabled={pending}>
                ×
              </Button>
            </RadixDialog.Close>
          </div>
          <RadixDialog.Description>{description}</RadixDialog.Description>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
export function ConfirmDialog({
  open,
  title,
  description,
  pending,
  onCancel,
  onConfirm,
  error,
  confirmLabel = 'Xác nhận xóa',
}: {
  confirmLabel?: string;
  open: boolean;
  title: string;
  description: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  error?: string;
}) {
  return (
    <Dialog
      title={title}
      description={description}
      open={open}
      onOpenChange={(v) => {
        if (!v) onCancel();
      }}
      pending={pending}
    >
      {error && <Alert>{error}</Alert>}
      <div className="actions">
        <Button variant="secondary" onClick={onCancel} disabled={pending} data-initial-focus>
          Hủy
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={pending}>
          {pending ? 'Đang xử lý…' : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
