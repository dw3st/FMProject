import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  LayoutGrid,
  DollarSign,
  Users,
  Trophy,
  Shirt,
  Search,
  Newspaper,
  BarChart3,
  ShoppingBag,
  TrendingUp,
  ChevronRight,
  Swords,
  Dumbbell,
  Moon,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import type { LeagueData } from "@/types/playerTypes";
import { fallbackTeamNameFromSquadId, teamDisplayNameFromLeagues } from "@/GameInterface/teamDisplayName";

interface NavItem {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  labelKey: string;
  href: string;
}

const navItems: NavItem[] = [
  { icon: Shirt,       labelKey: "nav.squad",       href: "/dashboard" },
  { icon: LayoutGrid,  labelKey: "nav.formation",   href: "/formation" },
  { icon: TrendingUp,  labelKey: "nav.development", href: "/development" },
  { icon: DollarSign,  labelKey: "nav.finances",    href: "/finances" },
  { icon: Users,       labelKey: "nav.staff",       href: "/staff" },
  { icon: Trophy,      labelKey: "nav.leagues",     href: "/leagues" },
  { icon: ShoppingBag, labelKey: "nav.transfers",   href: "/transfers" },
  { icon: Search,      labelKey: "nav.scout",       href: "/scout" },
  { icon: BarChart3,   labelKey: "nav.stats",       href: "/stats" },
];

interface Props {
  onAdvanceDay?: () => void;
  advancing?: boolean;
  leagues?: LeagueData[];
}

export function TopNavigation({ onAdvanceDay, advancing, leagues = [] }: Props = {}) {
  const { t } = useTranslation();
  const { currentDate, session, squad, fixtures, restDays } = useGameSave();

  const mySquadId = squad?.id ?? session?.clubId ?? "";

  const restDaySet = useMemo(() => new Set(restDays), [restDays]);

  const todayFixture = currentDate && mySquadId
    ? fixtures.find(
        (f) =>
          f.date === currentDate &&
          (f.home === mySquadId || f.away === mySquadId) &&
          !f.played,
      )
    : undefined;

  let nextEventLabel = t("nav.training");
  let isMatch = false;
  let isRest = false;
  if (todayFixture) {
    isMatch = true;
    const opponentId = todayFixture.home === mySquadId ? todayFixture.away : todayFixture.home;
    const opponentName = leagues.length
      ? teamDisplayNameFromLeagues(opponentId, leagues)
      : fallbackTeamNameFromSquadId(opponentId);
    nextEventLabel = t("nav.vsOpponent", { opponent: opponentName });
  } else if (currentDate && restDaySet.has(currentDate)) {
    isRest = true;
    nextEventLabel = t("nav.restDay");
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-border bg-card/90 backdrop-blur-md">
      <nav className="h-full flex items-center justify-between gap-2 px-2 xl:px-4">
        <a href="/dashboard" className="flex items-center gap-2 no-underline shrink-0">
          <span className="text-xl 2xl:text-2xl font-black font-display tracking-tight">
            <span className="text-foreground">TOUCH</span>
            <span className="text-primary glow-text">LINES</span>
          </span>
        </a>

        <div className="flex items-center gap-0.5 xl:gap-1">
          {navItems.map((item) => {
            const label = t(item.labelKey);
            return (
              <a
                key={item.labelKey}
                href={item.href}
                className="group flex flex-col items-center gap-1 px-2 py-1.5 xl:px-3 xl:py-2 2xl:px-4 rounded-lg transition-all hover:bg-primary/10 no-underline"
                title={label}
              >
                <item.icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                <span className="hidden lg:block text-[9px] 2xl:text-[10px] font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
                  {label}
                </span>
              </a>
            );
          })}
        </div>

        <div className="flex items-center gap-2 xl:gap-3 shrink-0">
          {currentDate && (
            <div
              className={`flex items-center gap-1.5 xl:gap-2 text-xs xl:text-sm font-bold px-2.5 py-1.5 xl:px-4 xl:py-2 rounded-lg border font-display tracking-wider whitespace-nowrap ${
                isMatch
                  ? "text-destructive bg-destructive/10 border-destructive/20"
                  : isRest
                    ? "text-indigo-400 bg-indigo-500/15 border-indigo-500/35"
                    : "text-primary bg-primary/10 border-primary/20"
              }`}
            >
              {isMatch ? (
                <Swords className="w-4 h-4 shrink-0" />
              ) : isRest ? (
                <Moon className="w-4 h-4 shrink-0" />
              ) : (
                <Dumbbell className="w-4 h-4 shrink-0" />
              )}
              {nextEventLabel}
            </div>
          )}

          {onAdvanceDay && (
            <button
              type="button"
              onClick={onAdvanceDay}
              disabled={advancing}
              className="flex items-center gap-1.5 px-3 py-1.5 xl:px-4 xl:py-2 rounded-lg bg-primary text-primary-foreground text-xs xl:text-sm font-bold uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed glow-primary cursor-pointer border-0 whitespace-nowrap shrink-0"
            >
              {advancing ? t("common.simulating") : t("common.continue")}
              {!advancing && <ChevronRight className="w-4 h-4" />}
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}
