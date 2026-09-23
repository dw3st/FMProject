import React from "react";
import { AbsoluteFill } from "remotion";
import {
  Shirt,
  LayoutGrid,
  TrendingUp,
  DollarSign,
  Users,
  Trophy,
  ShoppingBag,
  Search,
  BarChart3,
  Dumbbell,
  Swords,
  ChevronRight,
} from "lucide-react";

/**
 * Wraps a scene to look like the actual TouchLines app running in a
 * browser. Mirrors `src/GameInterface/Components/TopNavigation.tsx` so
 * the promo nav reads exactly like in-game.
 *
 * Team hue defaults to green (160) — same as the real game's brand identity.
 */
export const ScreenFrame: React.FC<{
  teamHue?: "green" | "yellow" | "blue" | "red" | "purple" | "orange" | "cyan";
  navActive?: NavKey;
  todayBadge?: { label: string; kind?: "training" | "match" | "rest" };
  children: React.ReactNode;
}> = ({
  teamHue = "green",
  navActive = "squad",
  todayBadge = { label: "Training", kind: "training" },
  children,
}) => {
  return (
    <AbsoluteFill data-team={teamHue} className="bg-background text-foreground">
      <TopNav active={navActive} todayBadge={todayBadge} />
      <div className="absolute inset-x-0 top-[64px] bottom-0 overflow-hidden">
        {children}
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

type NavKey =
  | "squad"
  | "formation"
  | "development"
  | "finances"
  | "staff"
  | "leagues"
  | "transfers"
  | "scout"
  | "stats";

const NAV: { key: NavKey; icon: React.ComponentType<any>; label: string }[] = [
  { key: "squad",       icon: Shirt,       label: "Squad" },
  { key: "formation",   icon: LayoutGrid,  label: "Formation" },
  { key: "development", icon: TrendingUp,  label: "Development" },
  { key: "finances",    icon: DollarSign,  label: "Finances" },
  { key: "staff",       icon: Users,       label: "Staff" },
  { key: "leagues",     icon: Trophy,      label: "Leagues" },
  { key: "transfers",   icon: ShoppingBag, label: "Transfers" },
  { key: "scout",       icon: Search,      label: "Scout" },
  { key: "stats",       icon: BarChart3,   label: "Stats" },
];

const TopNav: React.FC<{
  active: NavKey;
  todayBadge: { label: string; kind?: "training" | "match" | "rest" };
}> = ({ active, todayBadge }) => {
  const kind = todayBadge.kind ?? "training";
  const badgeClasses =
    kind === "match"
      ? "text-destructive bg-destructive/10 border-destructive/20"
      : kind === "rest"
        ? "text-indigo-400 bg-indigo-500/15 border-indigo-500/35"
        : "text-primary bg-primary/10 border-primary/20";
  const BadgeIcon = kind === "match" ? Swords : Dumbbell;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-border bg-card/90 backdrop-blur-md">
      <nav className="h-full flex items-center justify-between px-4">
        {/* Wordmark — TouchLines brand. */}
        <div className="flex items-center gap-2">
          <span className="text-2xl font-black font-display tracking-tight">
            <span className="text-foreground">TOUCH</span>
            <span className="text-primary glow-text">LINES</span>
          </span>
        </div>

        {/* Icon-above-label nav items */}
        <div className="flex items-center gap-1">
          {NAV.map((item) => {
            const isActive = item.key === active;
            const Icon = item.icon;
            return (
              <div
                key={item.key}
                className={
                  "flex flex-col items-center gap-1 px-4 py-2 rounded-lg " +
                  (isActive ? "bg-primary/10" : "")
                }
              >
                <Icon
                  className={
                    "w-5 h-5 " +
                    (isActive ? "text-primary" : "text-muted-foreground")
                  }
                />
                <span
                  className={
                    "text-[10px] font-semibold uppercase tracking-wider " +
                    (isActive ? "text-foreground" : "text-muted-foreground")
                  }
                >
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          {/* Today badge */}
          <div
            className={`flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-lg border font-display tracking-wider ${badgeClasses}`}
          >
            <BadgeIcon className="w-4 h-4 shrink-0" />
            {todayBadge.label}
          </div>

          {/* Continue button */}
          <div className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold uppercase tracking-wider glow-primary">
            Continue
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>
      </nav>
    </header>
  );
};
