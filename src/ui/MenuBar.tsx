import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

export interface MenuItemDef {
  label: string;
  shortcut?: string;
  onSelect?: () => void;
  disabled?: boolean;
  separator?: boolean;
}

export interface MenuDef {
  id: string;
  title: ComponentChildren;
  items: MenuItemDef[];
}

export function MenuBar({ menus, right }: { menus: MenuDef[]; right?: ComponentChildren }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openId) return;
    const close = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpenId(null);
    };
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenId(null);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [openId]);

  return (
    <div class="ab-menubar" ref={barRef}>
      <div class="ab-menubar__left">
        {menus.map((menu) => (
          <div style={{ position: 'relative' }} key={menu.id}>
            <button
              type="button"
              class={`ab-menubar__title${openId === menu.id ? ' ab-menubar__title--open' : ''}`}
              onClick={() => setOpenId(openId === menu.id ? null : menu.id)}
            >
              {menu.title}
            </button>
            {openId === menu.id ? (
              <div class="ab-menu" role="menu">
                {menu.items.map((item, i) =>
                  item.separator ? (
                    <div class="ab-menu__separator" key={i} />
                  ) : (
                    <div
                      key={item.label}
                      class={`ab-menu__item${item.disabled ? ' ab-menu__item--disabled' : ''}`}
                      role="menuitem"
                      onClick={() => {
                        if (item.disabled) return;
                        setOpenId(null);
                        item.onSelect?.();
                      }}
                    >
                      <span>{item.label}</span>
                      {item.shortcut ? <span class="ab-menu__shortcut">{item.shortcut}</span> : null}
                    </div>
                  ),
                )}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div class="ab-menubar__right">{right}</div>
    </div>
  );
}
