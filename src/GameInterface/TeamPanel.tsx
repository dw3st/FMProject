import { useTranslation } from "react-i18next";
import type { GamePlayer } from "@/GameEngine/types";
import type { PlayerDecision } from "@/GameEngine/Domain/DecisionTree";
import { ratingTextClass10 } from "@/GameInterface/scoreColors";
import type { StarKind } from "@/Domain/world/stars";
import { StarBadge } from "@/GameInterface/Components/StarBadge";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { useStarPlayers } from "@/GameInterface/useStarPlayers";
import { Icon } from "@/GameInterface/Icons";
import { readableOnDark } from "@/GameInterface/matchTeamColors";

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
      <span className="text-[13px] font-bold tabular-nums text-muted-foreground w-6 text-right">{Math.round(v)}</span>
    </div>
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
}) {
  const { t } = useTranslation();
  const color = accentColor;
  const highlighted = isHolder || isPassFrom || isPassTo;
  const isLeft = side === "left";
  return (
    <div
      onClick={() => onSelect?.(player.id)}
      className={`flex flex-col gap-1 px-3 py-2 border-b border-border/30 transition-colors ${
        onSelect ? "cursor-pointer" : ""
      } ${isSelected ? "bg-primary/10 border-l-2 border-primary" : highlighted ? "bg-secondary/40" : "hover:bg-secondary/30"} ${
        isLeft ? "" : "items-end"
      }`}
      style={{
        borderLeft: isSelected ? undefined : isHolder && isLeft ? `2px solid ${color}` : undefined,
        borderRight: isHolder && !isLeft ? `2px solid ${color}` : undefined,
      }}
    >
      <div className={`flex items-center gap-2 w-full ${isLeft ? "" : "flex-row-reverse"}`}>
        <div className={`w-2 h-2 rounded-full shrink-0`} style={{ background: color }} />
        <span className="w-8 text-[13px] font-bold text-muted-foreground uppercase shrink-0">{player.role}</span>
        <span className={`flex-1 min-w-0 text-sm font-medium text-foreground truncate flex items-center gap-1.5 ${isLeft ? "" : "flex-row-reverse text-right"}`}>
          <span className="truncate">{player.name}</span>
          {starKind && <StarBadge kind={starKind} />}
        </span>
        {isSubbedIn && (
          <Icon name="arrow-right-left" className="w-3 h-3 text-chart-2 shrink-0" aria-label={t("common.substitutedIn")} />
        )}
        {rating !== undefined && (
          <span className={`text-sm font-bold tabular-nums shrink-0 ${ratingTextClass10(rating)}`}>{rating.toFixed(1)}</span>
        )}
      </div>

      <div className={`flex items-center w-full gap-2 ${isLeft ? "justify-end flex-row" : "justify-end flex-row-reverse"}`}>
        <EnergyReadout energy={player.energy} />
      </div>
    </div>
  );
}

export function TeamPanel({
  team,
  teamName,
  accentColor,
  players,
  score,
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
  score:            number;
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
}) {
  const color = accentColor;
  const textColor = readableOnDark(accentColor);
  const { t } = useTranslation();
  const { session, currentDate } = useGameSave();
  const starIds = useStarPlayers(session?.saveId, currentDate);
  const side = sideProp ?? (team === "A" ? "left" : "right");
  const isLeft = side === "left";

  return (
    <div className="w-64 card-arcade border-r border-border flex flex-col shrink-0">
      <div className={`flex items-center justify-between p-4 border-b border-border ${isLeft ? "" : "flex-row-reverse"}`}>
        <div className={`flex items-center gap-2 ${isLeft ? "" : "flex-row-reverse"}`}>
          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
          <span className="font-bold text-foreground truncate">{teamName ?? `${t("common.team")} ${team}`}</span>
        </div>
        <div className={`flex items-center gap-2 ${isLeft ? "flex-row-reverse" : ""}`}>
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
            <span className={`text-sm font-semibold px-2 py-0.5 rounded border ${
              pendingSubsCount && pendingSubsCount > 0
                ? "text-chart-4 border-chart-4/40 bg-chart-4/10"
                : subsRemaining > 0
                ? "text-muted-foreground border-border"
                : "text-muted-foreground/40 border-border/30"
            }`}>
              {subsRemaining}/5
            </span>
          )}
          <span className="text-2xl font-black font-display tabular-nums" style={{ color: textColor }}>
            {score}
          </span>
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
          />
        ))}
      </div>
    </div>
  );
}
