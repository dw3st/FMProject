import { useEffect, useRef, useState } from "react";
import { Icon } from "@/GameInterface/Icons";
import type { TabsMode } from "@/GameInterface/Components/compactTabs";
import { NavTabIcon, type NavEntryView } from "@/GameInterface/Components/useNavEntries";

const CLOSE_MS = 180;
/** Up to this many entries the bar is a centred row with wide gaps (the ready-made groups); above, it spreads like the tabs. */
const CENTRED_MAX = 6;

/**
 * The top bar with groups (`navMenu.ts`): tabs and groups in the player's order. A group opens its menu on hover, click
 * or focus; the menu hangs under the bar (fixed, so the bar's own clipping never cuts it).
 */
export function GroupedTabs({ entries, tabClass, mode, iconSize }: { entries: NavEntryView[]; tabClass: (active: boolean) => string; mode: TabsMode; iconSize: number }) {
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

  const narrow = mode === "icons";
  const centred = mode === "labels" && entries.length <= CENTRED_MAX;
  const row = centred
    ? "flex items-stretch gap-8 phone:gap-3"
    : `flex items-stretch w-full ${narrow ? "gap-1.5" : `justify-between ${mode === "tight" ? "gap-2" : "gap-3.5"}`}`;
  const share = narrow ? "flex-1 basis-0" : "";
  const labelClass = narrow ? "block w-full truncate text-center tracking-normal phone:hidden" : "phone:hidden";

  return (
    <div className={row}>
      {entries.map((entry) => {
        if (entry.kind === "tab") {
          const it = entry.tab;
          return (
            <a key={it.item.href} href={it.to} className={`${tabClass(it.active)} ${share}`} title={it.label} aria-current={it.active ? "page" : undefined}>
              <NavTabIcon item={it.item} size={iconSize} />
              <span className={labelClass}>{it.label}</span>
            </a>
          );
        }
        const isOpen = open?.key === entry.id;
        return (
          <div key={`group:${entry.id}`} data-nav-group className={`flex items-stretch min-w-0 ${share}`} onMouseLeave={closeSoon}>
            <button
              type="button"
              className={`${tabClass(entry.active)} cursor-pointer ${narrow ? "w-full" : ""}`}
              aria-haspopup="menu"
              aria-expanded={isOpen}
              title={entry.label}
              onMouseEnter={(e) => show(entry.id, e.currentTarget)}
              onFocus={(e) => show(entry.id, e.currentTarget)}
              onClick={(e) => (isOpen ? setOpen(null) : show(entry.id, e.currentTarget))}
            >
              <Icon name={entry.icon} size={iconSize} className={`shrink-0 ${entry.tone}`} />
              {narrow ? (
                <span className={labelClass}>{entry.label}</span>
              ) : (
                <span className="flex items-center gap-0.5 phone:hidden">
                  {entry.label}
                  <Icon name="chevron-down" size={16} className="shrink-0" />
                </span>
              )}
            </button>
            {isOpen && (
              <div
                role="menu"
                aria-label={entry.label}
                className="fixed top-14 phone:top-11 z-50 min-w-[220px] rounded-b-md border border-t-0 border-border bg-card py-1 shadow-lg"
                style={{ left: Math.max(8, open.left - 12) }}
                onMouseEnter={hold}
              >
                {entry.tabs.map((it) => (
                  <a
                    key={it.item.href}
                    href={it.to}
                    role="menuitem"
                    aria-current={it.active ? "page" : undefined}
                    onClick={() => setOpen(null)}
                    className={`flex h-10 items-center gap-3 px-4 no-underline font-display font-bold uppercase tracking-[0.08em] text-sm whitespace-nowrap ${
                      it.active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
                    }`}
                  >
                    <NavTabIcon item={it.item} size={iconSize} />
                    {it.fullLabel}
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
