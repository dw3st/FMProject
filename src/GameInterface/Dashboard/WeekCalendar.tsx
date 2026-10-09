/**
 * The week card of the dashboard (#57): the club's 7 days (match / training / rest) laid out
 * horizontally, with prev/next week navigation. A future non-match day switches between training
 * and rest on click (`toggleDayType` → `POST .../rest-days`). Replaces the old right-hand column.
 */
import { RescheduledNote } from "@/GameInterface/Components/RescheduledNote";
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Fixture } from "@/types/calendarTypes";
import type { LeagueData } from "@/types/playerTypes";
import { teamDisplayNameFromLeagues } from "@/GameInterface/teamDisplayName";
import { Icon, type IconName } from "@/GameInterface/Icons";
import { HomeCard } from "@/GameInterface/Dashboard/HomeCards";
import { RESULT_CHIP } from "@/GameInterface/formColors";
import { youthCompAgeOf } from "@/Domain/youthComps/youthCompIds";
import type { YouthCompAge } from "@/types/youthCompTypes";

type MatchOutcome = "W" | "D" | "L";
type DayEventType = "match" | "training" | "rest";

/**
 * Result of the fixture from the given side's point of view. A cup tie decided on penalties has
 * a drawn scoreline in `result` (regulation/extra-time goals), so the shootout — not the goal
 * tally — decides W/L. Only a fixture with no penalty shootout can end in a real draw.
 */
export function matchOutcomeFor(fixture: Fixture, isHome: boolean): MatchOutcome {
  const pens = fixture.decider?.penalties;
  if (pens) {
    const myPens = isHome ? pens.home : pens.away;
    const oppPens = isHome ? pens.away : pens.home;
    return myPens > oppPens ? "W" : "L";
  }
  const { home: gh, away: ga } = fixture.result!;
  const myGoals = isHome ? gh : ga;
  const oppGoals = isHome ? ga : gh;
  if (myGoals > oppGoals) return "W";
  if (myGoals === oppGoals) return "D";
  return "L";
}

export function matchEventLabel(
  fixture: Fixture,
  opponentName: string,
  isHome: boolean,
): { label: string; outcome: MatchOutcome | null } {
  const prefix = isHome ? "vs" : "@";
  if (!fixture.played || fixture.result == null) {
    return { label: `${prefix} ${opponentName}`, outcome: null };
  }
  const { home: gh, away: ga } = fixture.result;
  const myGoals = isHome ? gh : ga;
  const oppGoals = isHome ? ga : gh;
  const outcome = matchOutcomeFor(fixture, isHome);
  return { label: `${outcome} ${myGoals}–${oppGoals} ${prefix} ${opponentName}`, outcome };
}

/** A youth-competition game of the club on one day (`season.youthCalendar`): never a match day. */
export interface YouthDayEntry {
  age: YouthCompAge;
  opponentId: string;
  isHome: boolean;
  /** "W 2–1", "D 0–0"…, `null` before it is played; cancelled games carry `cancelled`. */
  score: string | null;
  cancelled: boolean;
}

/** The club's youth games of `date` (under-19 first). */
export function youthDayEntries(fixtures: Fixture[], date: string, mySquadId: string): YouthDayEntry[] {
  return fixtures
    .filter((f) => f.date === date && (f.home === mySquadId || f.away === mySquadId) && youthCompAgeOf(f.competition))
    .map((f) => {
      const isHome = f.home === mySquadId;
      const played = f.played && f.result != null;
      return {
        age: youthCompAgeOf(f.competition)!,
        opponentId: isHome ? f.away : f.home,
        isHome,
        score: played
          ? `${matchOutcomeFor(f, isHome)} ${isHome ? f.result!.home : f.result!.away}–${isHome ? f.result!.away : f.result!.home}`
          : null,
        cancelled: !!f.cancelled,
      };
    })
    .sort((a, b) => (a.age === b.age ? 0 : a.age === "u19" ? -1 : 1));
}

function getMondayOf(dateStr: string): Date {
  const d = new Date(dateStr + "T12:00:00");
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props {
  fixtures:        Fixture[];
  /** The club's youth-competition games (shown under the day, never a match day). */
  youthFixtures?:  Fixture[];
  restDays:        string[];
  mySquadId:       string;
  currentDate:     string;
  leagues:         LeagueData[];
  onToggleDayType: (date: string, type: "training" | "rest") => void;
}

const EVENT_ICON: Record<DayEventType, IconName> = { match: "trophy", training: "training", rest: "rest" };

function eventClass(type: DayEventType, outcome: MatchOutcome | null): string {
  if (type === "rest") return "bg-chart-3/15 text-chart-3 border-chart-3/35";
  if (type === "training") return "bg-muted/50 text-muted-foreground border-border";
  if (outcome) return RESULT_CHIP[outcome];
  return "bg-primary/20 text-primary border-primary/40";
}

export function WeekCard({ fixtures, youthFixtures = [], restDays, mySquadId, currentDate, leagues, onToggleDayType }: Props) {
  const { t, i18n } = useTranslation();
  const [weekOffset, setWeekOffset] = useState(0);
  const restSet = useMemo(() => new Set(restDays), [restDays]);
  const lang = i18n.language;

  const weekDays = useMemo(() => {
    if (!currentDate) return [];
    const monday = getMondayOf(currentDate);
    monday.setDate(monday.getDate() + weekOffset * 7);

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      const dateStr = toDateStr(d);

      const myFixture = fixtures.find(
        (f) => f.date === dateStr && (f.home === mySquadId || f.away === mySquadId),
      );

      const isPast = dateStr < currentDate;
      const isGame = Boolean(myFixture);
      const isRest = !isGame && restSet.has(dateStr);

      let eventType: DayEventType;
      let label: string;
      let outcome: MatchOutcome | null = null;

      if (myFixture) {
        eventType = "match";
        const isHome = myFixture.home === mySquadId;
        const opponentId = isHome ? myFixture.away : myFixture.home;
        ({ label, outcome } = matchEventLabel(myFixture, teamDisplayNameFromLeagues(opponentId, leagues), isHome));
      } else if (isRest) {
        eventType = "rest";
        label = t("weekCalendar.restDay");
      } else {
        eventType = "training";
        label = t("weekCalendar.training");
      }

      return {
        weekday:      d.toLocaleDateString(lang, { weekday: "short" }),
        date:         d.getDate(),
        dateStr,
        isToday:      dateStr === currentDate,
        isPast,
        isToggleable: !isPast && !isGame,
        eventType,
        label,
        outcome,
        youth: youthDayEntries(youthFixtures, dateStr, mySquadId),
        rescheduledFrom: myFixture?.rescheduledFrom,
      };
    });
  }, [fixtures, youthFixtures, mySquadId, currentDate, leagues, weekOffset, restSet, lang, t]);

  if (!currentDate || weekDays.length === 0) return null;

  const fmt = (date: string) =>
    new Date(`${date}T12:00:00`).toLocaleDateString(lang, { day: "numeric", month: "short" });
  const weekLabel = `${fmt(weekDays[0]!.dateStr)} – ${fmt(weekDays[6]!.dateStr)}`;
  const navButton =
    "inline-flex items-center justify-center w-8 h-8 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer bg-transparent border-0";

  return (
    <HomeCard
      title={t("weekCalendar.weekSchedule")}
      actions={
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm text-muted-foreground tabular-nums">{weekLabel}</span>
          {weekOffset !== 0 && (
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="inline-flex items-center h-8 px-2 rounded text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer bg-transparent border-0"
            >
              {t("weekCalendar.thisWeek")}
            </button>
          )}
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w - 1)}
            aria-label={t("weekCalendar.previousWeek")}
            title={t("weekCalendar.previousWeek")}
            className={navButton}
          >
            <Icon name="chevron-left" size={16} />
          </button>
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w + 1)}
            aria-label={t("weekCalendar.nextWeek")}
            title={t("weekCalendar.nextWeek")}
            className={navButton}
          >
            <Icon name="chevron-right" size={16} />
          </button>
        </div>
      }
    >
      <ol className="grid gap-2 grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 list-none m-0 p-0">
        {weekDays.map((day) => {
          const chip = `flex items-center gap-2 w-full min-h-10 px-2.5 rounded border text-sm font-semibold text-left ${eventClass(day.eventType, day.outcome)}`;
          const content = (
            <>
              <Icon name={EVENT_ICON[day.eventType]} size={16} className="shrink-0" />
              <span className="truncate min-w-0">{day.label}</span>
            </>
          );
          return (
            <li
              key={day.dateStr}
              aria-current={day.isToday ? "date" : undefined}
              className={`rounded-md border p-2.5 flex flex-col gap-2 min-w-0 ${
                day.isToday ? "border-primary bg-primary/10" : "border-border"
              } ${day.isPast ? "opacity-60" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={`font-display font-bold uppercase tracking-[0.08em] text-[13px] ${
                    day.isToday ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {day.isToday ? t("weekCalendar.today") : day.weekday}
                </span>
                <span
                  className={`font-display font-bold text-xl tabular-nums leading-none ${
                    day.isToday ? "text-primary" : "text-foreground"
                  }`}
                >
                  {day.date}
                </span>
              </div>
              {day.isToggleable ? (
                <button
                  type="button"
                  onClick={() => onToggleDayType(day.dateStr, day.eventType === "rest" ? "training" : "rest")}
                  title={day.eventType === "rest" ? t("weekCalendar.switchToTraining") : t("weekCalendar.switchToRest")}
                  className={`${chip} cursor-pointer hover:opacity-80`}
                >
                  {content}
                </button>
              ) : (
                <div className={chip} title={day.label}>
                  {content}
                </div>
              )}
              {day.rescheduledFrom && (
                <RescheduledNote from={day.rescheduledFrom} className="truncate" />
              )}
              {day.youth.map((y) => {
                const opponent = teamDisplayNameFromLeagues(y.opponentId, leagues);
                const text = y.cancelled
                  ? t("youthComps.cancelled")
                  : `${y.score ? `${y.score} ` : ""}${y.isHome ? "vs" : "@"} ${opponent}`;
                return (
                  <div key={y.age} className="flex items-center gap-1.5 min-w-0 text-sm text-muted-foreground" title={`${t(`youthComps.${y.age}`)} · ${text}`}>
                    <span className="shrink-0 rounded border border-chart-5/40 bg-chart-5/10 px-1.5 font-display font-bold uppercase tracking-[0.08em] text-[13px] text-chart-5">
                      {t(`youthComps.badge.${y.age}`)}
                    </span>
                    <span className="truncate min-w-0">{text}</span>
                  </div>
                );
              })}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Icon name="trophy" size={16} className="text-primary" />
          {t("weekCalendar.match")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Icon name="training" size={16} />
          {t("weekCalendar.training")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Icon name="rest" size={16} className="text-chart-3" />
          {t("weekCalendar.restDay")}
        </span>
        <span className="sm:ml-auto">{t("weekCalendar.switchHint")}</span>
      </div>
    </HomeCard>
  );
}
