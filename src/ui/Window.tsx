import type { ComponentChildren, JSX } from 'preact';

export function Window({
  title,
  onClose,
  children,
  style,
  titleBarProps,
}: {
  title: string;
  onClose?: () => void;
  children: ComponentChildren;
  style?: JSX.CSSProperties;
  titleBarProps?: JSX.HTMLAttributes<HTMLDivElement>;
}) {
  return (
    <div class="ab-window" style={style}>
      <div class="ab-window__titlebar" {...titleBarProps}>
        {onClose ? (
          // Stop the pointerdown here so it doesn't bubble to the titlebar's own
          // handler, which captures the pointer to start a drag (§12.3) — that
          // capture reroutes the matching pointerup away from this button, which
          // silently swallows the click for any real pointer (mouse, touch, pen).
          <button
            class="ab-window__close"
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={`Close ${title}`}
          />
        ) : null}
        <span class="ab-window__titlebox">{title}</span>
      </div>
      <div class="ab-window__body">{children}</div>
    </div>
  );
}
