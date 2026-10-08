import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { Icon, type IconName } from "@/GameInterface/Icons";
import { Wordmark } from "@/GameInterface/Components/Wordmark";
import { useCurrentUser } from "@/GameInterface/AuthGate";
import { ReportModal } from "@/GameInterface/Components/ReportModal";
import type { LeagueData } from "@/types/playerTypes";
import { SCREEN_MAX_WIDTH } from "@/GameInterface/ui/ScreenContainer";
import { fallbackTeamNameFromSquadId, teamDisplayNameFromLeagues } from "@/GameInterface/teamDisplayName";

interface NavItem {
  icon: IconName;
  labelKey: string;
  href: string;
}

const navItems: NavItem[] = [
  { icon: "home", labelKey: "nav.dashboard",   href: "/dashboard" },
  // `/squad` is a prefix: the real link is the player's own club (see `hrefOf`).
  { icon: "squad", labelKey: "nav.squad",       href: "/squad" },
  { icon: "building", labelKey: "nav.club",     href: "/club" },
  { icon: "formation", labelKey: "nav.formation",   href: "/formation" },
  { icon: "trend-up", labelKey: "nav.development", href: "/development" },
  { icon: "finances", labelKey: "nav.finances",    href: "/finances" },
  { icon: "staff", labelKey: "nav.staff",       href: "/staff" },
  { icon: "trophy", labelKey: "nav.leagues",     href: "/leagues" },
  { icon: "transfers", labelKey: "nav.transfers",   href: "/transfers" },
  { icon: "search", labelKey: "nav.scout",       href: "/scout" },
  { icon: "stats", labelKey: "nav.stats",       href: "/stats" },
];

interface Props {
  onAdvanceDay?: () => void;
  /** Present only when the next player match is more than 2 days away. */
  onFastForward?: () => void;
  advancing?: boolean;
  leagues?: LeagueData[];
}

/** "Dom, 07/02/2027" / "Sun, 02/07/2027": short weekday + numeric date, in the UI language. */
function formatTopBarDate(date: string, lang: string): string {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  const weekday = new Intl.DateTimeFormat(lang, { weekday: "short" }).format(d).replace(/\.$/, "");
  const numeric = new Intl.DateTimeFormat(lang, { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  return `${weekday.charAt(0).toLocaleUpperCase(lang)}${weekday.slice(1)}, ${numeric}`;
}

/**
 * Tabs show their labels while the whole row fits the space between the logo and the day block;
 * below that they collapse to icons (label kept for screen readers and as a tooltip), so the bar
 * never overflows the frame at any width (#65). `fullWidth` remembers how wide the labelled row
 * was, so the labels come back as soon as there is room for them again.
 */
function useCompactTabs(lang: string, itemCount: number) {
  const outerRef = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const fullWidth = useRef(0);
  const measuredFor = useRef("");
  const [compact, setCompact] = useState(false);
  // The web fonts load after the first paint (separate files since 3.4.2): a row measured with the
  // fallback font is wider, so measure again once they are in.
  const [fontsEpoch, setFontsEpoch] = useState(0);
  useEffect(() => {
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (!fonts) return;
    const bump = () => setFontsEpoch((n) => n + 1);
    fonts.ready.then(bump);
    fonts.addEventListener("loadingdone", bump);
    return () => fonts.removeEventListener("loadingdone", bump);
  }, []);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    // Labels change with the language (or a tab appears, or the fonts arrive): show them again and re-measure.
    const key = `${lang}:${itemCount}:${fontsEpoch}`;
    if (measuredFor.current !== key) {
      measuredFor.current = key;
      fullWidth.current = 0;
      if (compact) {
        setCompact(false);
        return;
      }
    }
    const check = () => {
      if (!compact) {
        fullWidth.current = inner.offsetWidth;
        if (inner.offsetWidth > outer.clientWidth) setCompact(true);
      } else if (fullWidth.current > 0 && outer.clientWidth >= fullWidth.current) {
        setCompact(false);
      }
    };
    check();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(check);
    ro.observe(outer);
    return () => ro.disconnect();
  }, [compact, lang, itemCount, fontsEpoch]);

  return { outerRef, innerRef, compact };
}

export function TopNavigation({
  onAdvanceDay,
  onFastForward,
  advancing,
  leagues = [],
}: Props = {}) {
  const { t, i18n } = useTranslation();
  const { currentDate, session, squad, save, fixtures, restDays, toggleDayType } = useGameSave();
  // Without a club (`.claude/rules/game/jobs.md`): no day type, Continue waits for offers.
  const unemployed = !!save?.unemployed;
  const lang = i18n.language;

  const mySquadId = squad?.id ?? session?.clubId ?? "";

  const restDaySet = useMemo(() => new Set(restDays), [restDays]);

  const currentUser = useCurrentUser();
  const isTester = !!currentUser?.isTester;
  const [reportOpen, setReportOpen] = useState(false);
  const { outerRef, innerRef, compact } = useCompactTabs(lang, navItems.length + (isTester ? 1 : 0));

  const todayFixture = currentDate && mySquadId
    ? fixtures.find(
        (f) =>
          f.date === currentDate &&
          (f.home === mySquadId || f.away === mySquadId) &&
          !f.played,
      )
    : undefined;

  // Today's type: a match day is fixed; otherwise training ⇄ rest toggles like the week calendar.
  let dayLabel = t("nav.training");
  let dayIcon: IconName = "training";
  let dayTitle = t("weekCalendar.switchToRest");
  const isMatch = !!todayFixture;
  const isRest = !isMatch && !!currentDate && restDaySet.has(currentDate);
  if (todayFixture) {
    const opponentId = todayFixture.home === mySquadId ? todayFixture.away : todayFixture.home;
    const opponentName = leagues.length
      ? teamDisplayNameFromLeagues(opponentId, leagues)
      : fallbackTeamNameFromSquadId(opponentId);
    // Short label so the tabs keep theirs on match days too; the opponent goes in the tooltip.
    dayLabel = t("nav.matchDay");
    dayIcon = "trophy";
    dayTitle = t("nav.vsOpponent", { opponent: opponentName });
  } else if (isRest) {
    dayLabel = t("nav.rest");
    dayIcon = "rest";
    dayTitle = t("weekCalendar.switchToTraining");
  }

  const tabClass = (active: boolean) =>
    `flex items-center gap-1 border-b-2 bg-transparent px-0 font-display font-bold uppercase text-sm no-underline whitespace-nowrap transition-colors ${
      active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
    }`;
  const dayButton =
    "flex items-center justify-center gap-1.5 h-9 rounded-md border border-border bg-card text-sm font-semibold text-foreground whitespace-nowrap shrink-0 cursor-pointer hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    // Full-width bar, content in the same frame as `ScreenContainer` (#62): the logo lines up with
    // the cards' left edge, Continue with their right edge, the tabs centred in between (#65).
    <header className="fixed top-0 left-0 right-0 z-50 h-14 border-b border-border bg-background px-6 overflow-hidden [scrollbar-gutter:stable]">
      <div className={`h-full w-full ${SCREEN_MAX_WIDTH} mx-auto flex items-center gap-4`}>
        <a href="/dashboard" className="no-underline shrink-0 mr-3">
          <Wordmark size="sm" />
        </a>

        <nav
          ref={outerRef}
          aria-label={t("nav.main")}
          className="flex-1 min-w-0 self-stretch flex justify-center overflow-hidden"
        >
          <div ref={innerRef} className="flex w-max items-stretch gap-3.5">
            {navItems.map((item) => {
              const label = t(item.labelKey);
              const active = typeof window !== "undefined" && window.location.pathname.startsWith(item.href);
              const href =
                item.href === "/squad"
                  ? session && !unemployed
                    ? `/squad/${encodeURIComponent(session.leagueSlug)}/${encodeURIComponent(session.clubId)}`
                    : "/dashboard"
                  : item.href;
              return (
                <a
                  key={item.labelKey}
                  href={href}
                  className={tabClass(active)}
                  title={label}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon name={item.icon} size={16} className="shrink-0" />
                  <span className={compact ? "sr-only" : undefined}>{label}</span>
                </a>
              );
            })}
            {isTester && (
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                className={`${tabClass(false)} cursor-pointer`}
                title={t("nav.report")}
              >
                <Icon name="report" size={16} className="shrink-0" />
                <span className={compact ? "sr-only" : undefined}>{t("nav.report")}</span>
              </button>
            )}
          </div>
        </nav>

        {/* Day block: today's date and type, then the day controls (#65). */}
        <div className="flex items-center gap-2 shrink-0 h-8 pl-4 border-l border-border">
          {currentDate && (
            <>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground whitespace-nowrap tabular-nums">
                <Icon name="calendar" size={16} className="shrink-0" />
                {formatTopBarDate(currentDate, lang)}
              </span>
              {!unemployed && <button
                type="button"
                onClick={() => void toggleDayType(currentDate, isRest ? "training" : "rest")}
                disabled={isMatch || advancing}
                title={dayTitle}
                aria-label={`${dayLabel} · ${dayTitle}`}
                className={`${dayButton} px-3 ${isMatch ? "text-destructive disabled:opacity-100" : ""}`}
              >
                <Icon name={dayIcon} size={16} className={`shrink-0 ${isRest ? "text-chart-3" : ""}`} />
                <span className="max-w-[160px] truncate">{dayLabel}</span>
              </button>}
            </>
          )}

          {onFastForward && (
            <button
              type="button"
              onClick={onFastForward}
              disabled={advancing}
              title={t("fastForward.button")}
              aria-label={t("fastForward.button")}
              className={`${dayButton} w-9`}
            >
              <Icon name="fast-forward" size={16} />
            </button>
          )}

          {onAdvanceDay && (
            <button
              type="button"
              onClick={onAdvanceDay}
              disabled={advancing}
              className="flex items-center gap-1 h-9 px-4 rounded bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border-0 whitespace-nowrap shrink-0"
            >
              {advancing ? t("common.simulating") : unemployed ? t("jobs.waitForOffers") : t("common.continue")}
              {!advancing && <Icon name="chevron-right" size={16} />}
            </button>
          )}
        </div>
      </div>

      {isTester && (
        <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} />
      )}
    </header>
  );
}
