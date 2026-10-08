import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { shirtName } from "@/Domain/shirtName";
import { compareSquadPositions } from "@/Domain/positions/positionSort";
import type { GamePlayer, GameState, PendingSub } from "@/GameEngine/types";
import { getDetailedPositionColor } from "@/GameInterface/positionHelpers";
import { ratingTextClass10 } from "@/GameInterface/scoreColors";
import { Icon } from "@/GameInterface/Icons";
import { PitchMarkingsSvg } from "@/GameInterface/Components/PitchMarkingsSvg";
import { DragGhost, useDragDrop } from "@/GameInterface/Components/useDragDrop";
import { tapSubsPlayer, type SubsAction, type SubsSelection } from "@/GameInterface/subsSelection";

// ── Shared helpers (also used by the panel header) ─────────────────────────────

export function energyBarClass(energy: number): string {
  if (energy >= 60) return "bg-chart-2";
  if (energy >= 35) return "bg-chart-4";
  return "bg-destructive";
}

/** Match rating from the live engine when available; otherwise approximated from runtime stats (bench). */
export function displayRating10(p: GamePlayer, ratings?: Record<number, number>): number {
  const live = ratings?.[p.id];
  if (live !== undefined && !Number.isNaN(live)) return live;
  if (p.role === "GK") {
    const wob = p.runtimeStats.withoutBall;
    return ((wob.gkPositioning + wob.gkReflex + wob.gkDiving) / 3) * 10;
  }
  const wb = p.runtimeStats.withBall;
  const wob = p.runtimeStats.withoutBall;
  const nums = [wb.speed, wb.passingSkill, wb.dribbling, wb.vision, wb.shootAccuracy, wob.speed, wob.tackleChance, wob.interceptionChance];
  return (nums.reduce((a, b) => a + b, 0) / nums.length) * 10;
}

export function averageRating(players: GamePlayer[], ratings?: Record<number, number>): number {
  if (players.length === 0) return 0;
  const sum = players.reduce((acc, p) => acc + displayRating10(p, ratings), 0);
  return Math.round((sum / players.length) * 10) / 10;
}

/** Marker centre on the pitch (percent), kept inside the pitch so edge slots stay readable. */
function markerPos(slot: { x: number; y: number } | undefined): { left: string; top: string } {
  const x = slot ? (slot.x / 115) * 100 : 50;
  const y = slot ? (slot.y / 74) * 100 : 50;
  return { left: `${Math.min(92, Math.max(8, x))}%`, top: `${Math.min(88, Math.max(12, y))}%` };
}

function EnergyBar({ energy }: { energy: number }) {
  return (
    <span className="flex items-center gap-1 w-full">
      <span className="h-1.5 flex-1 min-w-16 rounded-full bg-border overflow-hidden">
        <span className={`block h-full rounded-full ${energyBarClass(energy)}`} style={{ width: `${energy}%` }} />
      </span>
      <span className="text-sm font-bold tabular-nums text-muted-foreground w-7 text-right">{Math.round(energy)}</span>
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface SubsPitchViewProps {
  gameState: GameState;
  playerTeam: "A";
  ratings?: Record<number, number>;
  onQueueSub: (sub: PendingSub) => void;
  /** Two starters swap positions (no substitution used). */
  onSwapPositions?: (aId: number, bId: number) => void;
}

/**
 * Substitutions tab of the live panel (#115): the current XI on a mini pitch (each starter in his
 * slot of the current formation, with position, energy and card/injury) and the bench sorted by
 * position. Tap a starter, then a bench player (or the other way) to queue a substitution; tap two
 * starters to swap their positions without using a substitution. Dragging works too.
 */
export function SubsPitchView({ gameState, playerTeam, ratings, onQueueSub, onSwapPositions }: SubsPitchViewProps) {
  const { t } = useTranslation();
  const [selection, setSelection] = useState<SubsSelection>(null);

  const subsRemaining = playerTeam === "A" ? gameState.subsRemainingA : gameState.subsRemainingB;
  const pendingQueue = playerTeam === "A" ? gameState.pendingSubsA : gameState.pendingSubsB;
  const bench = playerTeam === "A" ? gameState.benchA : gameState.benchB;
  const formation = playerTeam === "A" ? gameState.formationA : gameState.formationB;
  const onPitch = gameState.players.filter((p) => p.team === playerTeam).sort((a, b) => a.slotIndex - b.slotIndex);

  const queuedOutIds = new Set(pendingQueue.map((s) => s.outId));
  const queuedInIds = new Set(pendingQueue.map((s) => s.inId));
  const canSub = subsRemaining - pendingQueue.length > 0;

  const availableBench = useMemo(
    () =>
      bench
        .filter((p) => !queuedInIds.has(p.id))
        .sort((a, b) => compareSquadPositions({ pos: a.role, name: a.name }, { pos: b.role, name: b.name })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bench, pendingQueue],
  );

  const yellowIds = new Set(gameState.cards.filter((c) => c.team === playerTeam && c.card === "yellow").map((c) => c.playerId));
  const injuredIds = new Set(gameState.injuries.filter((i) => i.team === playerTeam).map((i) => i.playerId));

  const ctx = {
    canSub,
    isGoalkeeper: (id: number) => onPitch.find((p) => p.id === id)?.role === "GK",
    isQueuedOut: (id: number) => queuedOutIds.has(id),
  };

  function run(action: SubsAction | undefined) {
    if (!action) return;
    if (action.type === "sub") onQueueSub({ outId: action.outId, inId: action.inId });
    else onSwapPositions?.(action.aId, action.bId);
  }

  function tap(kind: "starter" | "bench", id: number) {
    if (consumeClick()) return;
    const ctxNow = onSwapPositions ? ctx : { ...ctx, isGoalkeeper: () => true };
    const out = tapSubsPlayer(selection, { kind, id }, ctxNow);
    setSelection(out.selection);
    run(out.action);
  }

  // Drag: a bench player onto a starter (or back) queues the substitution; a starter onto another
  // starter swaps them. `slot:<id>` and `bench:<id>` hold engine ids here.
  const { drag, dragProps, consumeClick } = useDragDrop((source, target) => {
    const from = { kind: source.kind === "slot" ? ("starter" as const) : ("bench" as const), id: Number(source.key) };
    const to =
      target.kind === "slot" ? { kind: "starter" as const, id: target.index }
        : target.kind === "bench" ? { kind: "bench" as const, id: Number(target.playerId) }
          : null;
    if (!to || (from.kind === "bench" && to.kind === "bench")) return;
    const ctxNow = onSwapPositions ? ctx : { ...ctx, isGoalkeeper: () => true };
    const out = tapSubsPlayer(from, to, ctxNow);
    setSelection(null);
    run(out.action);
  });

  const selectedStarter = selection?.kind === "starter" ? onPitch.find((p) => p.id === selection.id) : undefined;
  const hint = selectedStarter
    ? canSub
      ? onSwapPositions && selectedStarter.role !== "GK" ? t("substitutionPanel.pickBenchOrSwap") : t("substitutionPanel.chooseBench")
      : onSwapPositions && selectedStarter.role !== "GK" ? t("substitutionPanel.pickSwap") : t("substitutionPanel.noSubsRemaining")
    : selection?.kind === "bench"
      ? t("substitutionPanel.pickStarter")
      : canSub
        ? t("substitutionPanel.chooseStarter")
        : t("substitutionPanel.noSubsRemaining");

  return (
    <>
      <DragGhost drag={drag} />
      {pendingQueue.length > 0 && (
        <div className="shrink-0 px-4 py-2 border-b border-border/60 bg-chart-4/5">
          <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-chart-4 m-0 mb-1.5 font-display">
            {t("substitutionPanel.pendingSubstitutions")}
          </p>
          <div className="flex flex-wrap gap-2">
            {pendingQueue.map((pq) => {
              const out = onPitch.find((p) => p.id === pq.outId) ?? bench.find((p) => p.id === pq.outId);
              const inP = bench.find((p) => p.id === pq.inId);
              return (
                <div key={`${pq.outId}-${pq.inId}`} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-chart-4/10 border border-chart-4/20 text-sm">
                  <span className="text-destructive font-medium truncate max-w-[8rem]">{out?.name ?? "?"}</span>
                  <Icon name="arrow-right-left" size={16} className="text-chart-4 shrink-0" />
                  <span className="text-chart-2 font-medium truncate max-w-[8rem]">{inP?.name ?? "?"}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="shrink-0 px-4 pt-2 pb-1 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground m-0">{hint}</p>
        {selection && (
          <button type="button" onClick={() => setSelection(null)} className="text-sm text-muted-foreground hover:text-foreground cursor-pointer shrink-0">
            {t("substitutionPanel.cancelSelection")}
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 flex flex-col md:flex-row gap-3">
        {/* Mini pitch: the XI in the current formation, attacking to the right. */}
        <div className="md:flex-1 min-w-0 flex md:items-center justify-center">
          <div className="relative w-full md:max-w-[calc((80vh-19rem)*1.55)] aspect-[115/74] rounded-md overflow-hidden border border-border">
            <PitchMarkingsSvg />
            {onPitch.map((p) => {
              const pos = markerPos(formation.attacking[p.slotIndex]);
              const isOut = queuedOutIds.has(p.id);
              const isSelected = selection?.kind === "starter" && selection.id === p.id;
              const over = drag?.over === `slot:${p.id}`;
              const r10 = displayRating10(p, ratings);
              return (
                <button
                  key={p.id}
                  type="button"
                  data-pitch-marker
                  data-drop={`slot:${p.id}`}
                  {...dragProps({ kind: "slot", key: String(p.id) }, p.name)}
                  onClick={() => tap("starter", p.id)}
                  aria-pressed={isSelected}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 w-28 flex flex-col items-stretch gap-0.5 px-1.5 py-1 rounded-md border text-left cursor-pointer transition-colors bg-card/90 ${
                    isSelected || over
                      ? "border-primary ring-1 ring-primary"
                      : isOut
                        ? "border-chart-4/60 opacity-60"
                        : "border-border/70 hover:border-primary/60"
                  }`}
                  style={pos}
                >
                  <span className="flex items-center gap-1">
                    <span className={`font-display font-bold text-sm leading-none ${getDetailedPositionColor(p.role)}`}>
                      {t(`roles.detailedAbbr.${p.role}`, { defaultValue: p.role })}
                    </span>
                    {yellowIds.has(p.id) && (
                      <span className="inline-block w-2.5 h-3.5 rounded-sm bg-card-yellow" title={t("substitutionPanel.booked")} aria-label={t("substitutionPanel.booked")} />
                    )}
                    {injuredIds.has(p.id) && (
                      <span title={t("substitutionPanel.injured")} aria-label={t("substitutionPanel.injured")} className="inline-flex text-destructive"><Icon name="heart-pulse" size={16} /></span>
                    )}
                    {isOut && <span title={t("substitutionPanel.off")} aria-label={t("substitutionPanel.off")} className="inline-flex text-chart-4"><Icon name="arrow-right-left" size={16} /></span>}
                    <span className={`ml-auto text-sm font-black tabular-nums leading-none ${ratingTextClass10(r10)}`}>{r10.toFixed(1)}</span>
                  </span>
                  <span className="text-sm font-semibold text-foreground truncate leading-tight">{shirtName(p.name)}</span>
                  <EnergyBar energy={p.energy} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Bench, by position. */}
        <div className="md:w-80 shrink-0 flex flex-col border border-border/50 rounded-md overflow-hidden bg-secondary/10 md:min-h-0">
          <div className="shrink-0 px-3 py-2 border-b border-border/50">
            <span className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground font-display">
              {t("substitutionPanel.bench")}
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
            {availableBench.length === 0 ? (
              <p className="text-sm text-muted-foreground px-2 py-4 text-center m-0">{t("substitutionPanel.noAvailable")}</p>
            ) : (
              availableBench.map((p) => {
                const r10 = displayRating10(p, ratings);
                const isSelected = selection?.kind === "bench" && selection.id === p.id;
                const over = drag?.over === `bench:${p.id}`;
                return (
                  <button
                    key={p.id}
                    type="button"
                    data-drag-handle
                    data-drop={`bench:${p.id}`}
                    {...(canSub ? dragProps({ kind: "bench", key: String(p.id) }, p.name) : {})}
                    onClick={() => tap("bench", p.id)}
                    aria-pressed={isSelected}
                    className={`w-full min-h-10 flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-colors cursor-pointer ${
                      isSelected || over
                        ? "border-primary ring-1 ring-primary bg-primary/10"
                        : "border-border/60 hover:border-primary/40 hover:bg-secondary/40"
                    }`}
                  >
                    <span className={`w-9 shrink-0 font-display font-bold text-sm ${getDetailedPositionColor(p.role)}`}>
                      {t(`roles.detailedAbbr.${p.role}`, { defaultValue: p.role })}
                    </span>
                    <span className="flex-1 min-w-0 text-sm font-semibold text-foreground truncate">{shirtName(p.name)}</span>
                    <span className={`text-sm font-black tabular-nums shrink-0 w-8 text-right ${ratingTextClass10(r10)}`}>{r10.toFixed(1)}</span>
                    <span className="w-24 shrink-0">
                      <EnergyBar energy={p.energy} />
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}
