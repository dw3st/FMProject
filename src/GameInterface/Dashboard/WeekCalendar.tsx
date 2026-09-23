import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Trophy, Dumbbell, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Moon } from "lucide-react";
import type { Fixture } from "@/types/calendarTypes";
import type { LeagueData } from "@/types/playerTypes";
import { teamDisplayNameFromLeagues } from "@/GameInterface/teamDisplayName";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] as const;

// Note: day names and month names are date/time localization, not translatable strings

type MatchOutcome = "W" | "D" | "L";
type DayEventType = "match" | "training" | "rest";

function matchEventLabel(
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
  let outcome: MatchOutcome;
  if (myGoals > oppGoals) outcome = "W";
  else if (myGoals === oppGoals) outcome = "D";
  else outcome = "L";
  return { label: `${outcome} ${myGoals}–${oppGoals} ${prefix} ${opponentName}`, outcome };
}

function getMondayOf(dateStr: string): Date {
  const d = new Date(dateStr + "T12:00:00");
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface Props {
  fixtures:         Fixture[];
  restDays:         string[];
  mySquadId:        string;
  currentDate:      string;
  leagues:          LeagueData[];
  onToggleDayType:  (date: string, type: "training" | "rest") => void;
  collapsed?:        boolean;
  onToggleCollapse?: () => void;
}

export function WeekCalendar({ fixtures, restDays, mySquadId, currentDate, leagues, onToggleDayType, collapsed = false, onToggleCollapse }: Props) {
  const { t } = useTranslation();
  const [weekOffset, setWeekOffset] = useState(0);
  const restSet = useMemo(() => new Set(restDays), [restDays]);

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

      const isPast   = dateStr < currentDate;
      const isGame   = Boolean(myFixture);
      const isRest   = !isGame && restSet.has(dateStr);
      const isToggleable = !isPast && !isGame;

      let eventType: DayEventType;
      let label: string;
      let outcome: MatchOutcome | null = null;

      if (myFixture) {
        eventType = "match";
        const isHome = myFixture.home === mySquadId;
        const opponentId = isHome ? myFixture.away : myFixture.home;
        const opponentName = teamDisplayNameFromLeagues(opponentId, leagues);
        ({ label, outcome } = matchEventLabel(myFixture, opponentName, isHome));
      } else if (isRest) {
        eventType = "rest";
        label = t("weekCalendar.restDay");
      } else {
        eventType = "training";
        label = t("weekCalendar.training");
      }

      return {
        day:          DAY_NAMES[i]!,
        date:         d.getDate(),
        month:        MONTH_NAMES[d.getMonth()]!,
        dateStr,
        isToday:      dateStr === currentDate,
        isPast,
        isToggleable,
        eventType,
        label,
        outcome,
      };
    });
  }, [fixtures, mySquadId, currentDate, leagues, weekOffset, restSet]);

  if (!currentDate || weekDays.length === 0) return null;

  const first = weekDays[0]!;
  const last  = weekDays[6]!;
  const weekLabel = `${first.date} ${first.month} – ${last.date} ${last.month}`;

  if (collapsed) {
    return (
      <div className="h-full flex flex-col items-center gap-2">
        <button
          onClick={onToggleCollapse}
          title={t("weekCalendar.expand")}
          aria-label={t("weekCalendar.expand")}
          className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border cursor-pointer bg-transparent"
        >
          <ChevronsLeft className="w-4 h-4 text-muted-foreground" />
        </button>

        <div className="flex-1 w-full flex flex-col gap-1.5 overflow-y-auto items-stretch">
          {weekDays.map((day) => {
            const Icon =
              day.eventType === "match" ? Trophy :
              day.eventType === "rest"  ? Moon   :
              Dumbbell;

            const iconColor =
              day.eventType === "match"
                ? day.outcome === "W" ? "text-emerald-500 dark:text-emerald-400"
                  : day.outcome === "D" ? "text-amber-500 dark:text-amber-400"
                    : day.outcome === "L" ? "text-red-500 dark:text-red-400"
                      : "text-primary"
                : day.eventType === "rest" ? "text-indigo-400"
                  : "text-muted-foreground";

            return (
              <button
                key={day.dateStr}
                onClick={
                  day.isToggleable
                    ? () => onToggleDayType(day.dateStr, day.eventType === "rest" ? "training" : "rest")
                    : undefined
                }
                title={day.label}
                className={`flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 transition-all ${
                  day.isToggleable ? "cursor-pointer hover:bg-card/50" : "cursor-default"
                } ${
                  day.isToday
                    ? "border-primary/50 bg-primary/10 glow-primary-sm"
                    : "border-border bg-card/30"
                }`}
              >
                <span className={`text-[9px] font-bold uppercase ${day.isToday ? "text-primary" : "text-muted-foreground"}`}>
                  {day.day}
                </span>
                <span className={`text-sm font-black font-display leading-none ${day.isToday ? "text-primary glow-text" : "text-foreground"}`}>
                  {day.date}
                </span>
                <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-black text-foreground font-display uppercase tracking-wider m-0">
          {t("weekCalendar.weekSchedule")}
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border cursor-pointer bg-transparent"
          >
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => setWeekOffset((w) => w + 1)}
            className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border cursor-pointer bg-transparent"
          >
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              title={t("weekCalendar.collapse")}
              aria-label={t("weekCalendar.collapse")}
              className="ml-1 p-1.5 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border cursor-pointer bg-transparent"
            >
              <ChevronsRight className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground mb-3">{weekLabel}</p>

      <div className="flex-1 flex flex-col gap-2 overflow-y-auto">
        {weekDays.map((day) => {
          const Icon =
            day.eventType === "match"    ? Trophy :
            day.eventType === "rest"     ? Moon   :
            Dumbbell;

          const matchColors =
            day.outcome === "W"
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/35"
              : day.outcome === "D"
                ? "bg-amber-500/15 text-amber-800 dark:text-amber-400 border-amber-500/35"
                : day.outcome === "L"
                  ? "bg-red-500/15 text-red-800 dark:text-red-400 border-red-500/35"
                  : "bg-primary/20 text-primary border-primary/40";

          const eventColors =
            day.eventType === "match"    ? matchColors :
            day.eventType === "rest"     ? "bg-indigo-500/15 text-indigo-400 border-indigo-500/35" :
            "bg-muted/50 text-muted-foreground border-border";

          return (
            <div
              key={day.dateStr}
              className={`rounded-xl border p-3 transition-all ${
                day.isToday
                  ? "border-primary/50 bg-primary/10 glow-primary-sm"
                  : "border-border bg-card/30 hover:bg-card/50"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold uppercase tracking-wider ${day.isToday ? "text-primary" : "text-muted-foreground"}`}>
                    {day.day}
                  </span>
                  <span className={`text-xl font-black font-display ${day.isToday ? "text-primary glow-text" : "text-foreground"}`}>
                    {day.date}
                  </span>
                </div>
                {day.isToday && (
                  <span className="text-[10px] font-black text-primary-foreground bg-primary px-2 py-0.5 rounded-md uppercase tracking-wider">
                    {t("weekCalendar.today")}
                  </span>
                )}
              </div>

              <div
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-[11px] font-semibold ${eventColors} ${
                  day.isToggleable
                    ? "cursor-pointer hover:opacity-80 active:scale-[0.98] transition-all select-none"
                    : ""
                }`}
                onClick={
                  day.isToggleable
                    ? () => onToggleDayType(day.dateStr, day.eventType === "rest" ? "training" : "rest")
                    : undefined
                }
                title={day.isToggleable ? (day.eventType === "rest" ? t("weekCalendar.switchToTraining") : t("weekCalendar.switchToRest")) : undefined}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate min-w-0 flex-1">{day.label}</span>
                {day.isToggleable && (
                  <span className="text-[9px] opacity-50 shrink-0">{t("weekCalendar.tapToSwitch")}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-border">
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <div className="flex items-center gap-1.5">
            <Trophy className="w-3 h-3 text-primary" />
            <span className="text-muted-foreground font-medium">{t("weekCalendar.match")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Dumbbell className="w-3 h-3 text-muted-foreground" />
            <span className="text-muted-foreground font-medium">{t("weekCalendar.training")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Moon className="w-3 h-3 text-indigo-400" />
            <span className="text-muted-foreground font-medium">{t("weekCalendar.restDay")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
