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
import { kitDotStyle, readableOnDark } from "@/GameInterface/matchTeamColors";
import type { PlayerMatchEvents } from "@/GameInterface/matchPlayerEvents";

function energyBarColor(energy: number): string {
  if (energy >= 60) return "bg-chart-2/90";
  if (energy >= 35) return "bg-chart-4/90";
  return "bg-destructive/85";
}

function EnergyReadout({ energy }: { energy: number }) {
  const v = Math.max(0, Math.min(100, energy));
  const barClass = energyBarColor(v);
  return (
    <div className="flex items-center gap-2 min-w-[5.5rem] shrink-0">
      <div className="h-1.5 flex-1 rounded-full bg-border overflow-hidden min-w-16">
        <div className={`h-full rounded-full transition-[width] ${barClass}`} style={{ width: `${v}%` }} />
      </div>
      <span className="font-display font-bold text-base tabular-nums text-muted-foreground w-6 text-right">{Math.round(v)}</span>
    </div>
  );
}

/** Card shown in the lineup list: a small upright rectangle in the card colour. */
function CardMark({ red }: { red?: boolean }) {
  return <span className={`inline-block w-2.5 h-3.5 rounded-[2px] shrink-0 ${red ? "bg-destructive" : "bg-card-yellow"}`} aria-hidden />;
}

/** Goals, assists and cards of one player in this match (#69). */
function EventMarkers({ events }: { events?: PlayerMatchEvents }) {
  const { t } = useTranslation();
  if (!events) return <span />;
  const count = (n: number) => n > 1 && <span className="font-display font-bold text-base tabular-nums leading-none">×{n}</span>;
  return (
    <span className="flex items-center gap-2 min-w-0">
      {events.goals > 0 && (
        <span role="img" aria-label={t("match.playerEvents.goals", { count: events.goals })} title={t("match.playerEvents.goals", { count: events.goals })} className="inline-flex items-center gap-0.5 text-foreground">
          <Icon name="ball" size={16} />
          {count(events.goals)}
        </span>
      )}
      {events.assists > 0 && (
        <span role="img" aria-label={t("match.playerEvents.assists", { count: events.assists })} title={t("match.playerEvents.assists", { count: events.assists })} className="inline-flex items-center gap-0.5 text-chart-2">
          <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] leading-none">A</span>
          {count(events.assists)}
        </span>
      )}
      {events.yellows > 0 && (
        <span role="img" aria-label={t("match.playerEvents.yellow")} title={t("match.playerEvents.yellow")} className="inline-flex items-center gap-0.5">
          {Array.from({ length: events.yellows }, (_, i) => <CardMark key={i} />)}
        </span>
      )}
      {events.red && (
        <span role="img" aria-label={t("match.playerEvents.red")} title={t("match.playerEvents.red")} className="inline-flex items-center">
          <CardMark red />
        </span>
      )}
    </span>
  );
}

function PlayerRow({
  player,
  accentColor,
  isHolder,
  isPassFrom,
  isPassTo,
  decision,
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
  return (
    <div
      onClick={() => onSelect?.(player.id)}
      className={`flex flex-col gap-1 px-3 py-2 border-b border-border/30 transition-colors ${departed ? "opacity-60" : ""} ${
        onSelect ? "cursor-pointer" : ""
      } ${isSelected ? "bg-primary/10 border-l-2 border-primary" : highlighted ? "bg-secondary/40" : "hover:bg-secondary/30"} ${
        isLeft ? "" : "items-end"
      }`}
      style={{
        borderLeft: isSelected ? undefined : isHolder && isLeft ? edge : undefined,
        borderRight: isHolder && !isLeft ? edge : undefined,
      }}
    >
      <div className={`flex items-center gap-2 w-full ${isLeft ? "" : "flex-row-reverse"}`}>
        <div className="w-2 h-2 rounded-full shrink-0" style={kitDotStyle(color)} />
        <span className="w-8 text-[13px] font-bold text-muted-foreground uppercase font-display shrink-0">{player.role}</span>
        <span className={`flex-1 min-w-0 text-sm font-semibold text-foreground truncate flex items-center gap-1.5 ${isLeft ? "" : "flex-row-reverse text-right"}`}>
          <span className="truncate" title={player.name}>{shirtName(player.name)}</span>
          {starKind && <StarBadge kind={starKind} />}
        </span>
        {isSubbedIn && (
          <Icon name="arrow-right-left" className="w-3 h-3 text-chart-2 shrink-0" aria-label={t("common.substitutedIn")} />
        )}
        {rating !== undefined && (
          <span className={`font-display font-bold text-base tabular-nums shrink-0 ${ratingTextClass10(rating)}`}>{rating.toFixed(1)}</span>
        )}
      </div>

      <div className={`flex items-center w-full gap-2 justify-between ${isLeft ? "flex-row" : "flex-row-reverse"}`}>
        <EventMarkers events={events} />
        {departed ? (
          <span className={`font-display font-bold uppercase tracking-[0.08em] text-[13px] shrink-0 ${departed === "sentOff" ? "text-destructive" : "text-muted-foreground"}`}>
            {t(`match.playerEvents.${departed}`)}
          </span>
        ) : (
          <EnergyReadout energy={player.energy} />
        )}
      </div>
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
    <div className="w-64 card-arcade border-r border-border flex flex-col shrink-0">
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
