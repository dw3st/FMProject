import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { Icon, type IconName } from "@/GameInterface/Icons";
import { Wordmark } from "@/GameInterface/Components/Wordmark";
import { useCurrentUser } from "@/GameInterface/AuthGate";
import { ReportModal } from "@/GameInterface/Components/ReportModal";
import type { LeagueData } from "@/types/playerTypes";
import { SCREEN_MAX_WIDTH } from "@/GameInterface/ui/ScreenContainer";
import { compactTabsFor, type TabsMode } from "@/GameInterface/Components/compactTabs";
import { fallbackTeamNameFromSquadId, teamDisplayNameFromLeagues } from "@/GameInterface/teamDisplayName";

interface NavItem {
  icon: IconName;
  /** Icon colour of the section (theme tokens only, #133). */
  tone: string;
  labelKey: string;
  href: string;
}

/** Top-bar icon size (#133). */
const NAV_ICON = 18;
/**
 * Spacing of the tabs: normal (`gap-3.5` between tabs, `gap-1` icon to label) and tighter (`gap-2`,
 * `gap-0.5`), used before collapsing to icons (#139).
 */
const TAB_GAP = 14;
const TAB_GAP_TIGHT = 8;
const ICON_GAP = 4;
const ICON_GAP_TIGHT = 2;

const navItems: NavItem[] = [
  { icon: "dashboard", tone: "text-primary", labelKey: "nav.dashboard", href: "/dashboard" },
  // `/squad` is a prefix: the real link is the player's own club.
  { icon: "squad", tone: "text-chart-2", labelKey: "nav.squad", href: "/squad" },
  { icon: "stadium", tone: "text-chart-3", labelKey: "nav.club", href: "/club" },
  { icon: "tactics", tone: "text-chart-2", labelKey: "nav.formation", href: "/formation" },
  { icon: "trend-up", tone: "text-primary", labelKey: "nav.development", href: "/development" },
  { icon: "wallet", tone: "text-chart-4", labelKey: "nav.finances", href: "/finances" },
  { icon: "staff-coach", tone: "text-chart-3", labelKey: "nav.staff", href: "/staff" },
  { icon: "trophy", tone: "text-chart-4", labelKey: "nav.leagues", href: "/leagues" },
  { icon: "arrow-right-left", tone: "text-chart-5", labelKey: "nav.transfers", href: "/transfers" },
  { icon: "binoculars", tone: "text-chart-3", labelKey: "nav.scout", href: "/scout" },
  { icon: "stats", tone: "text-primary", labelKey: "nav.stats", href: "/stats" },
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
 * Tabs show their labels while the whole labelled row fits the space between the logo and the day
 * block; below that they collapse to icons (label kept for screen readers and as a tooltip), so
 * the bar never overflows the frame at any width (#65). The labelled row is measured on an
 * invisible copy (`measureRef`), so the answer never depends on the mode currently shown, and it is
 * measured again on every resize of the bar or of the copy (fonts, language), when the fonts
 * arrive, when the page becomes visible again and when it comes back from the back/forward cache
 * (#138: back from the match the bar stayed in icons with plenty of room). When the labelled row
 * only fits with tighter gaps it keeps the labels with those gaps (#139: in Portuguese, with the
 * tester's report button, the row was ~60px short at the full frame and fell back to icons).
 */
function useCompactTabs(tabCount: number) {
  const outerRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<TabsMode>("labels");

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const measure = measureRef.current;
    if (!outer || !measure) return;
    let alive = true;
    const check = () => {
      if (!alive) return;
      const tightSaving =
        Math.max(0, tabCount - 1) * (TAB_GAP - TAB_GAP_TIGHT) + tabCount * (ICON_GAP - ICON_GAP_TIGHT);
      const next = compactTabsFor(measure.offsetWidth, outer.clientWidth, tightSaving);
      if (next !== null) setMode(next);
    };
    check();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null;
    ro?.observe(outer);
    ro?.observe(measure);
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    void fonts?.ready.then(check);
    fonts?.addEventListener("loadingdone", check);
    const onVisible = () => { if (!document.hidden) check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", check);
    window.addEventListener("resize", check);
    return () => {
      alive = false;
      ro?.disconnect();
      fonts?.removeEventListener("loadingdone", check);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", check);
      window.removeEventListener("resize", check);
    };
  }, [tabCount]);

  return { outerRef, measureRef, mode };
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
  const { outerRef, measureRef, mode } = useCompactTabs(navItems.length);
  const compact = mode === "icons";

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

  const tabClass = (active: boolean, tight = false) =>
    `flex items-center ${tight ? "gap-0.5" : "gap-1"} border-b-2 bg-transparent px-0 font-display font-bold uppercase text-sm no-underline whitespace-nowrap transition-colors ${
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
          className="relative flex-1 min-w-0 self-stretch flex justify-center overflow-hidden"
        >
          {/* Invisible labelled copy: its width decides labels vs icons (#138). */}
          <div
            ref={measureRef}
            aria-hidden="true"
            className="invisible pointer-events-none absolute left-0 top-0 h-full flex w-max items-stretch gap-3.5"
          >
            {navItems.map((item) => (
              <span key={item.labelKey} className={tabClass(false)}>
                <Icon name={item.icon} size={NAV_ICON} className="shrink-0" />
                <span>{t(item.labelKey)}</span>
              </span>
            ))}
          </div>
          <div className={`flex w-max items-stretch ${mode === "tight" ? "gap-2" : "gap-3.5"}`}>
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
                  className={tabClass(active, mode === "tight")}
                  title={label}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon name={item.icon} size={NAV_ICON} className={`shrink-0 ${item.tone}`} />
                  <span className={compact ? "sr-only" : undefined}>{label}</span>
                </a>
              );
            })}
          </div>
        </nav>

        {/* Day block: the tester's report button (#133, #138; inside the block since #139, so it
            costs no divider of its own), today's date and type, then the day controls (#65). */}
        <div className="flex items-center gap-2 shrink-0 h-8 pl-4 border-l border-border">
          {isTester && (
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              title={t("nav.report")}
              aria-label={t("nav.report")}
              className="flex items-center justify-center w-9 h-9 shrink-0 rounded-md border border-border bg-card text-destructive cursor-pointer hover:bg-muted/50"
            >
              <Icon name="report" size={NAV_ICON} />
            </button>
          )}
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
