import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { useGroupAdvance } from "@/GameInterface/World/GroupAdvanceProvider";
import { Icon, type IconName, ArtIcon } from "@/GameInterface/Icons";
import { Wordmark } from "@/GameInterface/Components/Wordmark";
import { TesterReportButton } from "@/GameInterface/Components/ReportButton";
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

const navItems: NavItem[] = [
  { icon: "dashboard", tone: "text-primary", labelKey: "nav.dashboard", href: "/dashboard" },
  // `/squad` is a prefix: the real link is the player's own club.
  { icon: "squad", tone: "text-chart-2", labelKey: "nav.squad", href: "/squad" },
  { icon: "tactics", tone: "text-chart-2", labelKey: "nav.formation", href: "/formation" },
  { icon: "stadium", tone: "text-chart-3", labelKey: "nav.club", href: "/club" },
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
  /** Replaces fast-forward + Continue (group world, part 3). */
  dayAction?: ReactNode;
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
 * Tabs are an icon above a small label (tester report, 4.41.20; before, the bar fell back to bare icons). While the
 * whole row fits the space between the logo and the day block the labels are whole; below that each label is cut to a
 * share of the bar (full name in the tooltip), so the bar never overflows the frame at any width (#65). The labelled row is measured on an
 * invisible copy (`measureRef`), so the answer never depends on the mode currently shown, and it is
 * measured again on every resize of the bar or of the copy (fonts, language), when the fonts
 * arrive, when the page becomes visible again and when it comes back from the back/forward cache
 * (#138: back from the match the bar stayed in icons with plenty of room). When the labelled row
 * only fits with tighter gaps it keeps the labels with those gaps (#139: in Portuguese, with the
 * tester's report button, the row was ~60px short at the full frame and fell back to icons).
 * Nothing is decided before the bar is `settled` (the save loaded, so the day block has its real
 * width, and the fonts arrived): until then the tabs keep the mode of the previous page, kept per
 * tab in `sessionStorage`, so every page load does not flash labels and then shrink.
 */
const TABS_MODE_KEY = "fm.topnav.tabsMode";

function storedTabsMode(): TabsMode {
  try {
    const v = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(TABS_MODE_KEY) : null;
    return v === "tight" || v === "icons" ? v : "labels";
  } catch {
    return "labels";
  }
}

function useCompactTabs(tabCount: number, settled: boolean) {
  const outerRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<TabsMode>(storedTabsMode);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const measure = measureRef.current;
    if (!outer || !measure || !settled) return;
    let alive = true;
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    const check = () => {
      if (!alive || fonts?.status === "loading") return;
      const tightSaving = Math.max(0, tabCount - 1) * (TAB_GAP - TAB_GAP_TIGHT);
      const next = compactTabsFor(measure.offsetWidth, outer.clientWidth, tightSaving);
      if (next === null) return;
      setMode(next);
      try { sessionStorage.setItem(TABS_MODE_KEY, next); } catch { /* storage off: no memory */ }
    };
    check();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null;
    ro?.observe(outer);
    ro?.observe(measure);
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
  }, [tabCount, settled]);

  return { outerRef, measureRef, mode };
}

export function TopNavigation({
  onAdvanceDay,
  onFastForward,
  advancing: advancingProp,
  leagues = [],
  dayAction,
}: Props = {}) {
  const group = useGroupAdvance();
  const advancing = advancingProp || (group.enabled && !!group.view?.running);
  const { t, i18n } = useTranslation();
  const { currentDate, session, squad, save, fixtures, restDays, toggleDayType } = useGameSave();
  // Without a club (`.claude/rules/game/jobs.md`): no day type, Continue waits for offers.
  const unemployed = !!save?.unemployed;
  const lang = i18n.language;

  const mySquadId = squad?.id ?? session?.clubId ?? "";

  const restDaySet = useMemo(() => new Set(restDays), [restDays]);

  // The day block has its real width once the save is in (or there is no save to wait for).
  const settled = !session || !!currentDate || unemployed;
  const { outerRef, measureRef, mode } = useCompactTabs(navItems.length, settled);
  // Not enough room even with the tight gaps: the labels stay, each tab an equal share of the bar, cut with an ellipsis (title = full name).
  const narrow = mode === "icons";

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

  // Icon above a small label (the art preview's bar): the labels always show.
  const tabClass = (active: boolean) =>
    `flex flex-col items-center justify-center gap-1 min-w-0 border-b-2 bg-transparent px-0 font-display font-bold uppercase tracking-[0.08em] text-[13px] leading-none no-underline whitespace-nowrap transition-colors ${
      active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
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
                <ArtIcon art={`tab-${item.href.slice(1)}`} size={NAV_ICON} className="shrink-0" fallback={<Icon name={item.icon} size={NAV_ICON} className="shrink-0" />} />
                <span>{t(item.labelKey)}</span>
              </span>
            ))}
          </div>
          <div className={`flex items-stretch ${narrow ? "w-full gap-1.5" : `w-max ${mode === "tight" ? "gap-2" : "gap-3.5"}`}`}>
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
                  className={`${tabClass(active)} ${narrow ? "flex-1 basis-0" : ""}`}
                  title={label}
                  aria-current={active ? "page" : undefined}
                >
                  <ArtIcon art={`tab-${item.href.slice(1)}`} size={NAV_ICON} className={`shrink-0 ${item.tone}`} fallback={<Icon name={item.icon} size={NAV_ICON} className={`shrink-0 ${item.tone}`} />} />
                  <span className={narrow ? "block w-full truncate text-center tracking-normal" : undefined}>{label}</span>
                </a>
              );
            })}
          </div>
        </nav>

        {/* Day block: the tester's report button (#133, #138; inside the block since #139, so it
            costs no divider of its own), today's date and type, then the day controls (#65). */}
        <div className="flex items-center gap-2 shrink-0 h-8 pl-4 border-l border-border">
          <TesterReportButton />
          {save?.mode === "multi" && (
            <a
              href="/world"
              title={t("nav.world")}
              aria-label={t("nav.world")}
              className="flex items-center justify-center w-9 h-9 shrink-0 rounded-md border border-border bg-card text-chart-2 hover:bg-muted/50"
            >
              <Icon name="users" size={NAV_ICON} />
            </a>
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

          {/* Fixed slot: the group-advance control changes width between its states (ready, advancing, match
              day, waiting), and a block that grows and shrinks made the tabs flip between labels and icons. */}
          {dayAction && <div className="flex w-[184px] shrink-0 items-center justify-end overflow-hidden">{dayAction}</div>}

          {!dayAction && onFastForward && (
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

          {!dayAction && onAdvanceDay && (
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
    </header>
  );
}
