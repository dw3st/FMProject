import { useTranslation } from "react-i18next";
import type { GamePlayer } from "@/GameEngine/types";
import type { PlayerDecision } from "@/GameEngine/Domain/DecisionTree";
import { ratingTextClass10 } from "@/GameInterface/scoreColors";
import { ArrowRightLeft } from "lucide-react";
import { StarBadge } from "@/GameInterface/Components/StarBadge";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { useStarPlayers } from "@/GameInterface/useStarPlayers";

const DECISION_BADGE: Record<PlayerDecision["type"], { label: string; className: string }> = {
  carry:                { label: "CARRY",   className: "text-emerald-400 border-emerald-400" },
  shoot:                { label: "SHOOT",   className: "text-red-400 border-red-400" },
  pass:                 { label: "PASS",    className: "text-blue-400 border-blue-400" },
  through_ball:         { label: "TB",      className: "text-purple-400 border-purple-400" },
  dribble:              { label: "DRIBBLE", className: "text-fuchsia-400 border-fuchsia-400" },
  tackle:               { label: "TACKLE",  className: "text-orange-400 border-orange-400" },
  press:                { label: "PRESS",   className: "text-yellow-400 border-yellow-400" },
  support_run:          { label: "RUN",     className: "text-purple-400 border-purple-400" },
  create_space:         { label: "SPACE",   className: "text-pink-400 border-pink-400" },
  chase_loose_ball:     { label: "CHASE",   className: "text-amber-400 border-amber-400" },
  hold_shape:           { label: "SHAPE",   className: "text-blue-400 border-blue-400" },
  track_mark:           { label: "MARK",    className: "text-cyan-400 border-cyan-400" },
  step_into_carry_lane: { label: "STEP",    className: "text-red-400 border-red-400" },
  idle:                 { label: "IDLE",    className: "text-muted-foreground/20 border-muted-foreground/20" },
};

function energyBarColor(energy: number): string {
  if (energy >= 60) return "bg-emerald-500/90";
  if (energy >= 35) return "bg-amber-500/90";
  return "bg-red-500/85";
}

function EnergyReadout({ energy }: { energy: number }) {
  const v = Math.max(0, Math.min(100, energy));
  const barClass = energyBarColor(v);
  return (
    <div className="flex items-center gap-2 min-w-[5.5rem] shrink-0">
      <div className="h-1.5 flex-1 rounded-full bg-muted/80 overflow-hidden min-w-[2.5rem]">
        <div className={`h-full rounded-full transition-[width] ${barClass}`} style={{ width: `${v}%` }} />
      </div>
      <span className="text-[10px] font-bold tabular-nums text-muted-foreground w-6 text-right">{Math.round(v)}</span>
    </div>
  );
}

function actionLabel(
  decision: PlayerDecision | undefined,
  isHolder: boolean,
  isPassFrom: boolean,
  isPassTo: boolean,
): { label: string; className: string } {
  if (decision && DECISION_BADGE[decision.type]) {
    return {
      label: DECISION_BADGE[decision.type]!.label,
      className: DECISION_BADGE[decision.type]!.className,
    };
  }
  if (isHolder) return { label: "BALL", className: "text-amber-400 border-amber-400/70" };
  if (isPassFrom) return { label: "FROM", className: "text-blue-400 border-blue-400/70" };
  if (isPassTo) return { label: "TO", className: "text-blue-400 border-blue-400/70" };
  return { label: "IDLE", className: "text-muted-foreground/70 border-border/60" };
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
  isStar,
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
  isStar?:     boolean;
}) {
  const { t } = useTranslation();
  const color = accentColor;
  const highlighted = isHolder || isPassFrom || isPassTo;
  const isLeft = side === "left";
  const act = actionLabel(decision, isHolder, isPassFrom, isPassTo);

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
        <span className="w-8 text-xs font-bold text-muted-foreground uppercase shrink-0">{player.role}</span>
        <span className={`flex-1 min-w-0 text-sm font-medium text-foreground truncate flex items-center gap-1.5 ${isLeft ? "" : "flex-row-reverse text-right"}`}>
          <span className="truncate">{player.name}</span>
          {isStar && <StarBadge />}
        </span>
        {isSubbedIn && (
          <ArrowRightLeft className="w-3 h-3 text-emerald-400 shrink-0" aria-label={t("common.substitutedIn")} />
        )}
        {rating !== undefined && (
          <span className={`text-sm font-bold tabular-nums shrink-0 ${ratingTextClass10(rating)}`}>{rating.toFixed(1)}</span>
        )}
      </div>

      <div className={`flex items-center w-full gap-2 ${isLeft ? "justify-between flex-row" : "justify-between flex-row-reverse"}`}>
        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border shrink-0 ${act.className}`}>
          {act.label}
        </span>
        <EnergyReadout energy={player.energy} />
      </div>
    </div>
  );
}

export function TeamPanel({
  team,
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
}: {
  team:             "A" | "B";
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
  const { t } = useTranslation();
  const { session, currentDate } = useGameSave();
  const starIds = useStarPlayers(session?.saveId, currentDate);
  const side = team === "A" ? "left" : "right";
  const isLeft = side === "left";

  return (
    <div className="w-64 card-arcade border-r border-border flex flex-col shrink-0">
      <div className={`flex items-center justify-between p-4 border-b border-border ${isLeft ? "" : "flex-row-reverse"}`}>
        <div className={`flex items-center gap-2 ${isLeft ? "" : "flex-row-reverse"}`}>
          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
          <span className="font-bold text-foreground">{t("common.team")} {team}</span>
        </div>
        <div className={`flex items-center gap-2 ${isLeft ? "flex-row-reverse" : ""}`}>
          {subsRemaining !== undefined && (
            <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${
              pendingSubsCount && pendingSubsCount > 0
                ? "text-amber-400 border-amber-400/40 bg-amber-400/10"
                : subsRemaining > 0
                ? "text-muted-foreground border-border"
                : "text-muted-foreground/40 border-border/30"
            }`}>
              {subsRemaining}/5
            </span>
          )}
          <span className="text-2xl font-black font-display tabular-nums" style={{ color }}>
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
            isStar={starIds.has(p.rosterId)}
          />
        ))}
      </div>
    </div>
  );
}
