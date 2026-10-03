import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { Icon, type IconName } from "@/GameInterface/Icons";
import { Wordmark } from "@/GameInterface/Components/Wordmark";
import { useCurrentUser } from "@/GameInterface/AuthGate";
import { ReportModal } from "@/GameInterface/Components/ReportModal";
import { ChangelogNoticePill } from "@/GameInterface/Components/ChangelogNoticePill";
import type { LeagueData } from "@/types/playerTypes";
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
  /** Present only when there's an unseen changelog version — see .claude/rules/changelog.md. */
  changelogNotice?: {
    version: string;
    onOpen: () => void;
    onDismiss: () => void;
  } | null;
}

export function TopNavigation({
  onAdvanceDay,
  onFastForward,
  advancing,
  leagues = [],
  changelogNotice,
}: Props = {}) {
  const { t } = useTranslation();
  const { currentDate, session, squad, fixtures, restDays } = useGameSave();

  const mySquadId = squad?.id ?? session?.clubId ?? "";

  const restDaySet = useMemo(() => new Set(restDays), [restDays]);

  const currentUser = useCurrentUser();
  const isTester = !!currentUser?.isTester;
  const [reportOpen, setReportOpen] = useState(false);

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

  const linkClass =
    "flex items-center gap-1.5 px-2 py-1 font-display font-bold uppercase tracking-wide text-sm no-underline text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap";

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-12 border-b border-border bg-background">
      <nav className="h-full flex items-center justify-between gap-3 px-3 xl:px-5">
        <a href="/dashboard" className="no-underline shrink-0">
          <Wordmark size="sm" />
        </a>

        <div className="flex items-center gap-0.5 xl:gap-1 min-w-0">
          {navItems.map((item) => {
            const label = t(item.labelKey);
            const active = typeof window !== "undefined" && window.location.pathname.startsWith(item.href);
            const href =
              item.href === "/squad"
                ? session
                  ? `/squad/${encodeURIComponent(session.leagueSlug)}/${encodeURIComponent(session.clubId)}`
                  : "/dashboard"
                : item.href;
            return (
              <a
                key={item.labelKey}
                href={href}
                className={active ? linkClass.replace("text-muted-foreground", "text-foreground") : linkClass}
                title={label}
                aria-current={active ? "page" : undefined}
              >
                <Icon name={item.icon} size={16} />
                <span className="hidden min-[1360px]:block">{label}</span>
              </a>
            );
          })}
          {isTester && (
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className={`${linkClass} cursor-pointer bg-transparent border-0`}
              title={t("nav.report")}
              aria-label={t("nav.report")}
            >
              <Icon name="report" size={16} />
              <span className="hidden min-[1360px]:block">{t("nav.report")}</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 xl:gap-3 shrink-0">
          {changelogNotice && (
            <ChangelogNoticePill
              version={changelogNotice.version}
              onOpen={changelogNotice.onOpen}
              onDismiss={changelogNotice.onDismiss}
              className="hidden md:inline-flex"
            />
          )}

          {currentDate && (
            <div
              className={`flex items-center gap-1.5 text-sm whitespace-nowrap ${
                isMatch ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              <Icon name={isMatch ? "match" : isRest ? "rest" : "training"} size={16} className="shrink-0" />
              {nextEventLabel}
            </div>
          )}

          {onFastForward && (
            <button
              type="button"
              onClick={onFastForward}
              disabled={advancing}
              title={t("fastForward.button")}
              className="flex items-center gap-1.5 px-2 py-1 bg-transparent border-0 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap shrink-0"
            >
              <Icon name="fast-forward" size={16} />
              <span className="hidden 2xl:inline">{t("fastForward.button")}</span>
            </button>
          )}

          {onAdvanceDay && (
            <button
              type="button"
              onClick={onAdvanceDay}
              disabled={advancing}
              className="flex items-center gap-1 h-9 px-4 rounded bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border-0 whitespace-nowrap shrink-0"
            >
              {advancing ? t("common.simulating") : t("common.continue")}
              {!advancing && <Icon name="chevron-right" size={16} />}
            </button>
          )}
        </div>
      </nav>

      {isTester && (
        <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} />
      )}
    </header>
  );
}
