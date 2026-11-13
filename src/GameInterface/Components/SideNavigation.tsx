import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { NavTabIcon, useNavEntries, type NavTabView } from "@/GameInterface/Components/useNavEntries";

const NAV_ICON = 18;
const CLOSED_KEY = "fm.nav.side.closed";

function readClosed(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(CLOSED_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 16) : [];
  } catch {
    return [];
  }
}

function TabLink({ tab, inGroup }: { tab: NavTabView; inGroup?: boolean }) {
  return (
    <a
      href={tab.to}
      title={tab.fullLabel}
      aria-current={tab.active ? "page" : undefined}
      className={`flex h-10 shrink-0 items-center gap-3 border-l-2 pr-3 no-underline font-display font-bold uppercase tracking-[0.08em] text-sm transition-colors ${inGroup ? "pl-7" : "pl-4"} ${
        tab.active ? "border-primary bg-primary/10 text-foreground" : "border-transparent text-muted-foreground hover:bg-secondary/30 hover:text-foreground"
      }`}
    >
      <NavTabIcon item={tab.item} size={NAV_ICON} />
      <span className="min-w-0 truncate">{tab.fullLabel}</span>
    </a>
  );
}

/**
 * The menu as a left column (the player's choice, `navMenu.ts`): icon and name always, groups as sections that open and
 * close. Sits between the two bars; `Layout` shows it only with the full chrome and gives `main` the room. Never on a
 * phone lying down: there the top bar keeps the tabs.
 */
export function SideNavigation() {
  const { t } = useTranslation();
  const { entries } = useNavEntries();
  const [closed, setClosed] = useState<string[]>(readClosed);
  const toggle = (id: string) => {
    const next = closed.includes(id) ? closed.filter((c) => c !== id) : [...closed, id];
    setClosed(next);
    try { localStorage.setItem(CLOSED_KEY, JSON.stringify(next)); } catch { /* no storage: lasts this page */ }
  };

  return (
    <nav
      aria-label={t("nav.main")}
      className="fixed left-[calc(max(0px,(100vw-1488px)/2))] top-14 bottom-12 z-40 flex w-52 flex-col overflow-y-auto border-x border-border bg-background py-2 phone:hidden"
    >
      {entries.map((entry) => {
        if (entry.kind === "tab") return <TabLink key={entry.tab.item.href} tab={entry.tab} />;
        const open = !closed.includes(entry.id);
        return (
          <div key={`group:${entry.id}`} className="mt-1 flex shrink-0 flex-col">
            <button
              type="button"
              onClick={() => toggle(entry.id)}
              aria-expanded={open}
              title={entry.label}
              className={`flex h-9 w-full cursor-pointer items-center gap-3 border-l-2 bg-transparent pl-4 pr-3 text-left font-display font-bold uppercase tracking-[0.08em] text-[13px] hover:text-foreground ${
                !open && entry.active ? "border-primary text-foreground" : "border-transparent text-muted-foreground"
              }`}
            >
              <Icon name={entry.icon} size={16} className={`shrink-0 ${entry.tone}`} />
              <span className="min-w-0 flex-1 truncate">{entry.label}</span>
              <Icon name={open ? "chevron-up" : "chevron-down"} size={16} className="shrink-0" />
            </button>
            {open && entry.tabs.map((tab) => <TabLink key={tab.item.href} tab={tab} inGroup />)}
          </div>
        );
      })}
    </nav>
  );
}
