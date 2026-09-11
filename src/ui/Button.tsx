import type { ComponentChildren } from 'preact';

export function Button({
  children,
  onClick,
  isDefault,
  disabled,
  title,
}: {
  children: ComponentChildren;
  onClick?: () => void;
  isDefault?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      class={`ab-button${isDefault ? ' ab-button--default' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

export function IconButton({
  children,
  onClick,
  disabled,
  title,
  pressed,
}: {
  children: ComponentChildren;
  onClick?: () => void;
  disabled?: boolean;
  title: string;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      class="ab-icon-button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      style={pressed ? { background: 'var(--ink)', color: 'var(--paper)' } : undefined}
    >
      {children}
    </button>
  );
}
