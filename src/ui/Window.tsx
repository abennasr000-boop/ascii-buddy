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
          <button class="ab-window__close" onClick={onClose} aria-label={`Close ${title}`} />
        ) : null}
        <span class="ab-window__titlebox">{title}</span>
      </div>
      <div class="ab-window__body">{children}</div>
    </div>
  );
}
