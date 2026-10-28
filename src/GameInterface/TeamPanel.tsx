import { shirtName } from "@/Domain/shirtName";
import { useTranslation } from "react-i18next";
import type { GamePlayer } from "@/GameEngine/types";
import type { PlayerDecision } from "@/GameEngine/Domain/DecisionTree";
import { ratingTextClass10 } from "@/GameInterface/scoreColors";
import type { StarKind } from "@/Domain/world/stars";
import { StarBadge } from "@/GameInterface/Components/StarBadge";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { useStarPlayers } from "@/GameInterface/useStarPlayers";
import { Icon } from "@/GameInterface/Icons";
import { gamePlayerNaturalRole } from "@/GameInterface/positionHelpers";
import { kitDotStyle, readableOnDark } from "@/GameInterface/matchTeamColors";
import { cardRowClass, countCell, isOneYellowFromBan, type PlayerMatchEvents } from "@/GameInterface/matchPlayerEvents";

/** Fitness number coloured by band (#149): green, amber, red. */
function energyTextClass(energy: number): string {
  if (energy >= 60) return "text-chart-2";
  if (energy >= 35) return "text-chart-4";
  return "text-destructive";
}

/** Card shown in the lineup list: a small upright rectangle in the card colour. */
function CardMark({ red }: { red?: boolean }) {
  return <span className={`inline-block w-2.5 h-3.5 rounded-[2px] shrink-0 ${red ? "bg-destructive" : "bg-card-yellow"}`} aria-hidden />;
}

/**
 * One yellow from a ban ("pendurado"): a filled yellow card with a letter, the full text in the tooltip (tester
 * report: an empty card read as a mistake; a written label took the name's room in the narrow lists).
 */
export function BanRiskMark() {
  const { t } = useTranslation();
  const full = t("match.playerEvents.banRisk");
  return (
    <span title={full} className="inline-flex items-center justify-center shrink-0 w-[18px] h-[22px] rounded-[2px] bg-card-yellow text-black font-display font-bold text-sm leading-none">
      {t("match.playerEvents.banRiskShort")}
      <span className="sr-only">{full}</span>
    </span>
  );
}

/** Column widths of the lineup list (#149): position, name, rating, fitness, goals, assists. */
export const LINEUP_COLS = {
  pos: "w-9 shrink-0",
  rating: "w-9 shrink-0 text-right",
  fitness: "w-9 shrink-0 text-right",
  stat: "w-6 shrink-0 text-center",
} as const;

const DEPARTED_ICON: Record<DepartedReason, "xcircle" | "heart-pulse" | "arrow-down-left"> = {
  sentOff: "xcircle",
  injured: "heart-pulse",
  subbedOff: "arrow-down-left",
};

function PlayerRow({
  player,
  accentColor,
  isHolder,
  isPassFrom,
  isPassTo,
  rating,
  side,
  isSelected,
  onSelect,
  isSubbedIn,
  starKind,
  events,
  departed,
}: {
  player:      GamePlayer;
  accentColor: string;
  isHolder:    boolean;
  isPassFrom:  boolean;
  isPassTo:    boolean;
  decision?:   PlayerDecision;
  rating?:     number;
  side:        "left" | "right";
  isSelected?: boolean;
  onSelect?:   (id: number) => void;
  isSubbedIn?: boolean;
  starKind?:   StarKind;
  events?:     PlayerMatchEvents;
  /** Left the pitch (sent off, injured, substituted): shown dimmed at the end of the list. */
  departed?:   DepartedReason;
}) {
  const { t } = useTranslation();
  const color = accentColor;
  const edge = `2px solid ${readableOnDark(color)}`;
  const highlighted = isHolder || isPassFrom || isPassTo;
  const isLeft = side === "left";
  const role = gamePlayerNaturalRole(player);
  const energy = Math.max(0, Math.min(100, player.energy));
  const tint = cardRowClass(events);
  const cardLabel = events?.red ? t("match.playerEvents.red") : events && events.yellows > 0 ? t("match.playerEvents.yellow") : undefined;
  return (
    <div
      onClick={() => onSelect?.(player.id)}
      title={departed ? t(`match.playerEvents.${departed}`) : cardLabel}
      className={`flex items-center gap-1.5 min-h-8 px-3 py-1.5 border-b border-border/30 text-sm transition-colors ${departed ? "opacity-60" : ""} ${
        onSelect ? "cursor-pointer" : ""
      } ${isSelected ? "bg-primary/10 border-l-2 border-primary" : highlighted ? "bg-secondary/40" : tint || "hover:bg-secondary/30"} ${
        isLeft ? "" : "flex-row-reverse"
      }`}
      style={{
        borderLeft: isSelected ? undefined : isHolder && isLeft ? edge : undefined,
        borderRight: isHolder && !isLeft ? edge : undefined,
      }}
    >
      <span className={`${LINEUP_COLS.pos} flex items-center gap-1.5`}>
        <span className="w-2 h-2 rounded-full shrink-0" style={kitDotStyle(color)} />
        <span className="text-[13px] font-bold text-muted-foreground uppercase font-display">{t(`roles.detailedAbbr.${role}`, { defaultValue: role })}</span>
      </span>
      <span className={`flex-1 min-w-0 font-semibold text-foreground flex items-center gap-1.5 ${isLeft ? "" : "flex-row-reverse text-right"}`}>
        <span className="truncate" title={player.name}>{shirtName(player.name)}</span>
        {starKind && <StarBadge kind={starKind} />}
        {events && events.yellows > 0 && !events.red && (
          <span role="img" aria-label={t("match.playerEvents.yellow")} className="inline-flex items-center gap-0.5">
            {Array.from({ length: events.yellows }, (_, i) => <CardMark key={i} />)}
          </span>
        )}
        {events?.red && (
          <span role="img" aria-label={t("match.playerEvents.red")} className="inline-flex items-center"><CardMark red /></span>
        )}
        {!departed && isOneYellowFromBan(player.seasonYellows, events) && <BanRiskMark />}
        {isSubbedIn && (
          <Icon name="arrow-right-left" className="w-3 h-3 text-chart-2 shrink-0" aria-label={t("common.substitutedIn")} />
        )}
      </span>
      <span className={`${LINEUP_COLS.rating} font-display font-bold text-base tabular-nums ${rating !== undefined ? ratingTextClass10(rating) : ""}`}>
        {rating !== undefined ? rating.toFixed(1) : ""}
      </span>
      <span className={`${LINEUP_COLS.fitness} font-display font-bold text-base tabular-nums ${departed ? "text-muted-foreground" : energyTextClass(energy)}`}>
        {departed
          ? <Icon name={DEPARTED_ICON[departed]} size={16} className={`inline-block ${departed === "sentOff" ? "text-destructive" : ""}`} aria-label={t(`match.playerEvents.${departed}`)} />
          : Math.round(energy)}
      </span>
      <span className={`${LINEUP_COLS.stat} font-display font-bold text-base tabular-nums text-foreground`} aria-label={events?.goals ? t("match.playerEvents.goals", { count: events.goals }) : undefined}>
        {countCell(events?.goals)}
      </span>
      <span className={`${LINEUP_COLS.stat} font-display font-bold text-base tabular-nums text-chart-2`} aria-label={events?.assists ? t("match.playerEvents.assists", { count: events.assists }) : undefined}>
        {countCell(events?.assists)}
      </span>
    </div>
  );
}

type DepartedReason = "sentOff" | "injured" | "subbedOff";

/** A player who left the pitch during the match, and why. */
export interface DepartedPlayer {
  player: GamePlayer;
  reason: DepartedReason;
}

export function TeamPanel({
  team,
  teamName,
  accentColor,
  players,
  ballHolderId,
  passFromId,
  passToId,
  decisions,
  ratings,
  selectedPlayerId,
  onSelectPlayer,
  subsRemaining,
  pendingSubsCount,
  subbedInPlayerIds,
  playerEvents,
  departedPlayers,
  side: sideProp,
  onFlip,
  flipLabel,
}: {
  team:             "A" | "B";
  /** Layout side; defaults to left for A and right for B. */
  side?:            "left" | "right";
  /** When set, the header shows an arrow button that switches the card to the other team. */
  onFlip?:          () => void;
  /** Accessible label/tooltip of the flip button. */
  flipLabel?:       string;
  /** Club name; falls back to "Team A/B" when unknown. */
  teamName?:        string;
  accentColor:      string;
  players:          GamePlayer[];
  ballHolderId:     number;
  passFromId?:      number;
  passToId?:        number;
  decisions?:       Record<number, PlayerDecision>;
  ratings?:         Record<number, number>;
  selectedPlayerId?: number | null;
  onSelectPlayer?:  (id: number) => void;
  subsRemaining?:   number;
  pendingSubsCount?: number;
  subbedInPlayerIds?: Set<number>;
  /** Goals, assists and cards per engine player id (#69). */
  playerEvents?:    Map<number, PlayerMatchEvents>;
  /** Players of this team who left the pitch, listed dimmed at the end with the reason. */
  departedPlayers?: DepartedPlayer[];
}) {
  const color = accentColor;
  const { t } = useTranslation();
  const { session, currentDate } = useGameSave();
  const starIds = useStarPlayers(session?.saveId, currentDate);
  const side = sideProp ?? (team === "A" ? "left" : "right");
  const isLeft = side === "left";

  return (
    <div className="w-72 card-arcade border-r border-border flex flex-col shrink-0">
      {/* The score lives in the scoreboard only (#55). The name shrinks (truncates) so the subs
          count and the flip button always stay inside the 256 px card and clickable. */}
      <div className={`flex items-center justify-between gap-2 p-4 border-b border-border ${isLeft ? "" : "flex-row-reverse"}`}>
        <div className={`flex items-center gap-2 min-w-0 ${isLeft ? "" : "flex-row-reverse"}`}>
          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={kitDotStyle(color)} />
          <span className="text-base font-semibold text-foreground truncate">{teamName ?? `${t("common.team")} ${team}`}</span>
        </div>
        <div className={`flex items-center gap-2 shrink-0 ${isLeft ? "flex-row-reverse" : ""}`}>
          {onFlip && (
            <button
              type="button"
              onClick={onFlip}
              aria-label={flipLabel}
              title={flipLabel}
              className="w-8 h-8 shrink-0 rounded border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors cursor-pointer"
            >
              <Icon name="arrow-right-left" className="w-4 h-4" />
            </button>
          )}
          {subsRemaining !== undefined && (
            <span className={`font-display font-bold text-sm tabular-nums px-2 py-0.5 rounded border ${
              pendingSubsCount && pendingSubsCount > 0
                ? "text-chart-4 border-chart-4/40 bg-chart-4/10"
                : subsRemaining > 0
                ? "text-muted-foreground border-border"
                : "text-muted-foreground/40 border-border/30"
            }`}>
              {subsRemaining}/5
            </span>
          )}
        </div>
      </div>

      <div
        aria-hidden
        className={`flex items-center gap-1.5 px-3 py-1.5 border-b border-border bg-secondary/30 font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground ${isLeft ? "" : "flex-row-reverse"}`}
      >
        <span className={LINEUP_COLS.pos}>{t("match.lineup.pos")}</span>
        <span className="flex-1 min-w-0 truncate">{t("match.lineup.name")}</span>
        <span className={LINEUP_COLS.rating} title={t("match.lineup.ratingFull")}>{t("match.lineup.rating")}</span>
        <span className={LINEUP_COLS.fitness} title={t("match.lineup.fitnessFull")}>{t("match.lineup.fitness")}</span>
        <span className={LINEUP_COLS.stat} title={t("match.lineup.goalsFull")}>{t("match.lineup.goals")}</span>
        <span className={LINEUP_COLS.stat} title={t("match.lineup.assistsFull")}>{t("match.lineup.assists")}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {players.map((p) => (
          <PlayerRow
            key={p.id}
            player={p}
            accentColor={color}
            isHolder={p.id === ballHolderId && passFromId === undefined}
            isPassFrom={p.id === passFromId}
            isPassTo={p.id === passToId}
            decision={decisions?.[p.id]}
            rating={ratings?.[p.id]}
            side={side}
            isSelected={selectedPlayerId === p.id}
            onSelect={onSelectPlayer}
            isSubbedIn={subbedInPlayerIds?.has(p.id)}
            starKind={starIds.get(p.rosterId)}
            events={playerEvents?.get(p.id)}
          />
        ))}
        {departedPlayers?.map(({ player: p, reason }) => (
          <PlayerRow
            key={`off-${p.id}`}
            player={p}
            accentColor={color}
            isHolder={false}
            isPassFrom={false}
            isPassTo={false}
            rating={ratings?.[p.id]}
            side={side}
            starKind={starIds.get(p.rosterId)}
            events={playerEvents?.get(p.id)}
            departed={reason}
          />
        ))}
      </div>
    </div>
  );
}
