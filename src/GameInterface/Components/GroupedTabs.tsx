import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "@/GameInterface/Icons";
import { groupNav, type NavGroupDef } from "@/GameInterface/Components/navGroups";

export interface GroupedTabItem {
  href: string;
  /** Where the link really goes (the squad tab points at the manager's own club). */
  to: string;
  label: string;
  active: boolean;
  icon: ReactNode;
}

const GROUP_ICON: Record<NavGroupDef["key"], { icon: IconName; tone: string }> = {
  team: { icon: "squad", tone: "text-chart-2" },
  management: { icon: "stadium", tone: "text-chart-3" },
  market: { icon: "arrow-right-left", tone: "text-chart-5" },
  competitions: { icon: "trophy", tone: "text-chart-4" },
};

const CLOSE_MS = 180;

/**
 * The top bar in groups (`navGroups.ts`): the dashboard, then four groups. A group opens its menu on hover, click or
 * focus; the menu hangs under the bar (fixed, so the bar's own clipping never cuts it).
 */
export function GroupedTabs({ items, tabClass }: { items: GroupedTabItem[]; tabClass: (active: boolean) => string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<{ key: string; left: number } | null>(null);
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hold = () => { if (closing.current) { clearTimeout(closing.current); closing.current = null; } };
  const closeSoon = () => { hold(); closing.current = setTimeout(() => setOpen(null), CLOSE_MS); };
  const show = (key: string, el: HTMLElement) => { hold(); setOpen({ key, left: Math.round(el.getBoundingClientRect().left) }); };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    const onDown = (e: MouseEvent) => { if (!(e.target as HTMLElement | null)?.closest?.("[data-nav-group]")) setOpen(null); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onDown); };
  }, [open]);
  useEffect(() => hold, []);

  return (
    <div className="flex items-stretch gap-8 phone:gap-3">
      {groupNav(items).map((entry) => {
        if (entry.kind === "tab") {
          const it = entry.item;
          return (
            <a key={it.href} href={it.to} className={tabClass(it.active)} title={it.label} aria-current={it.active ? "page" : undefined}>
              {it.icon}
              <span className="phone:hidden">{it.label}</span>
            </a>
          );
        }
        const active = entry.items.some((i) => i.active);
        const isOpen = open?.key === entry.key;
        const label = t(`nav.group.${entry.key}`);
        const g = GROUP_ICON[entry.key];
        return (
          <div key={entry.key} data-nav-group className="flex items-stretch" onMouseLeave={closeSoon}>
            <button
              type="button"
              className={`${tabClass(active)} cursor-pointer`}
              aria-haspopup="menu"
              aria-expanded={isOpen}
              title={label}
              onMouseEnter={(e) => show(entry.key, e.currentTarget)}
              onFocus={(e) => show(entry.key, e.currentTarget)}
              onClick={(e) => (isOpen ? setOpen(null) : show(entry.key, e.currentTarget))}
            >
              <Icon name={g.icon} size={18} className={`shrink-0 ${g.tone}`} />
              <span className="flex items-center gap-0.5 phone:hidden">
                {label}
                <Icon name="chevron-down" size={16} className="shrink-0" />
              </span>
            </button>
            {isOpen && (
              <div
                role="menu"
                aria-label={label}
                className="fixed top-14 phone:top-11 z-50 min-w-[220px] rounded-b-md border border-t-0 border-border bg-card py-1 shadow-lg"
                style={{ left: Math.max(8, open.left - 12) }}
                onMouseEnter={hold}
              >
                {entry.items.map((it) => (
                  <a
                    key={it.href}
                    href={it.to}
                    role="menuitem"
                    aria-current={it.active ? "page" : undefined}
                    onClick={() => setOpen(null)}
                    className={`flex h-10 items-center gap-3 px-4 no-underline font-display font-bold uppercase tracking-[0.08em] text-sm whitespace-nowrap ${
                      it.active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
                    }`}
                  >
                    {it.icon}
                    {it.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
