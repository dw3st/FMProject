import { useState } from "react";
import { Icon, iconOf } from "@/GameInterface/Icons";
import type { ComponentType } from "react";

/**
 * Compact navigation widget shown on every lab page. Lets you jump between
 * the lab tools without typing URLs.
 *
 * Hides itself when the URL contains `?nav=hide` — useful when recording
 * the /promo page for screen capture.
 */

type IconCmp = ComponentType<{ className?: string }>;

interface NavItem {
  href: string;
  label: string;
  icon: IconCmp;
  hint: string;
}

const NAV: NavItem[] = [
  { href: "/lab",      label: "Lab",      icon: iconOf("flask", 16, 2),           hint: "Scenario runner" },
  { href: "/test",     label: "Test",     icon: iconOf("beaker", 16, 2),          hint: "Debug pitch" },
  { href: "/simulate", label: "Simulate", icon: iconOf("play-circle", 16, 2),     hint: "Headless sims" },
  { href: "/matrix",   label: "Matrix",   icon: iconOf("grid", 16, 2),            hint: "Formation matrix" },
  { href: "/promo",    label: "Promo",    icon: iconOf("clapperboard", 16, 2),    hint: "Real Madrid vs Barcelona" },
];

function isHidden(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("nav") === "hide";
}

function currentPath(): string {
  if (typeof window === "undefined") return "/lab";
  return window.location.pathname.replace(/\/$/, "") || "/lab";
}

export function LabNav({ defaultCollapsed = false }: { defaultCollapsed?: boolean } = {}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  if (isHidden()) return null;

  const path = currentPath();

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="fixed top-3 right-3 z-[9999] w-9 h-9 rounded-full card-arcade border-glow flex items-center justify-center cursor-pointer hover:scale-105 transition-transform"
        title="Show lab navigation"
        aria-label="Show lab navigation"
      >
        <Icon name="flask" strokeWidth={2} className="w-4 h-4 text-primary" />
      </button>
    );
  }

  return (
    <nav className="fixed top-3 right-3 z-[9999] card-arcade rounded-full px-2 py-1.5 flex items-center gap-1 backdrop-blur-md shadow-lg border-glow">
      <button
        type="button"
        onClick={() => setCollapsed(true)}
        className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
        title="Collapse"
        aria-label="Collapse navigation"
      >
        <Icon name="chevron-right" strokeWidth={2} className="w-3.5 h-3.5" />
      </button>
      <span className="text-[10px] font-display font-black uppercase tracking-[0.3em] text-muted-foreground px-2 select-none">
        Lab
      </span>
      <div className="w-px h-5 bg-border" />
      {NAV.map((item) => {
        const isActive = path === item.href;
        const Icon = item.icon;
        return (
          <a
            key={item.href}
            href={item.href}
            title={item.hint}
            className={
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full no-underline transition-all " +
              (isActive
                ? "bg-primary text-primary-foreground glow-primary-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50")
            }
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[11px] font-display font-bold uppercase tracking-wider">
              {item.label}
            </span>
          </a>
        );
      })}
    </nav>
  );
}
