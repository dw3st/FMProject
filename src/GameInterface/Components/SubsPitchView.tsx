import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { shirtName } from "@/Domain/shirtName";
import { compareSquadPositions } from "@/Domain/positions/positionSort";
import type { GamePlayer, GameState, PendingSub, TeamId } from "@/GameEngine/types";
import { gamePlayerNaturalRole, getDetailedPositionColor } from "@/GameInterface/positionHelpers";
import { ratingTextClass10 } from "@/GameInterface/scoreColors";
import { Icon } from "@/GameInterface/Icons";
import { PitchMarkingsSvg } from "@/GameInterface/Components/PitchMarkingsSvg";
import { DragGhost, useDragDrop } from "@/GameInterface/Components/useDragDrop";
import { tapSubsPlayer, type SubsAction, type SubsSelection } from "@/GameInterface/subsSelection";
import { isOneYellowFromBan } from "@/GameInterface/matchPlayerEvents";
import { BanRiskMark } from "@/GameInterface/TeamPanel";
import { FaceImage, playerInitials } from "@/GameInterface/Components/PlayerFace";
import { SUBS_CARD, subsCardCompact, subsCardPercent, subsSlotPositions } from "@/Domain/formation/subsPitch";
import { gameArtUrl, newVisualOn } from "@/Domain/art/paintedFaces";

const PITCH_BOARD = "formation/pitch-board-wide.webp";

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

function EnergyBar({ energy, compact }: { energy: number; compact?: boolean }) {
  return (
    <span className="flex items-center gap-1 w-full">
      <span className={`h-1.5 flex-1 ${compact ? "min-w-10" : "min-w-16"} rounded-full bg-border/70 overflow-hidden`}>
        <span className={`block h-full rounded-full ${energyBarClass(energy)}`} style={{ width: `${energy}%` }} />
      </span>
      <span className="text-sm font-bold tabular-nums text-muted-foreground w-6 text-right leading-none">{Math.round(energy)}</span>
    </span>
  );
}

/** Pixel size of an element, kept current on resize (the pitch cards are sized in px, placed in percent). */
function useElementSize<T extends HTMLElement>(): [RefObject<T | null>, { w: number; h: number }] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setSize((s) => (s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface SubsPitchViewProps {
  gameState: GameState;
  playerTeam: TeamId;
  ratings?: Record<number, number>;
  onQueueSub: (sub: PendingSub) => void;
  /** Two starters swap positions (no substitution used). */
  onSwapPositions?: (aId: number, bId: number) => void;
  /** Face URL per roster id (the match's faces, in the kit worn); absent = initials. */
  faceUrls?: Record<string, string>;
}

/**
 * Substitutions tab of the live panel (#115): the current XI on a mini pitch (each starter in his
 * slot of the current formation, with position, energy and card/injury) and the bench sorted by
 * position. Tap a starter, then a bench player (or the other way) to queue a substitution; tap two
 * starters to swap their positions without using a substitution. Dragging works too.
 */
export function SubsPitchView({ gameState, playerTeam, ratings, onQueueSub, onSwapPositions, faceUrls }: SubsPitchViewProps) {
  const { t } = useTranslation();
  const [selection, setSelection] = useState<SubsSelection>(null);

  const subsRemaining = playerTeam === "A" ? gameState.subsRemainingA : gameState.subsRemainingB;
  const pendingQueue = playerTeam === "A" ? gameState.pendingSubsA : gameState.pendingSubsB;
  const bench = playerTeam === "A" ? gameState.benchA : gameState.benchB;
  const formation = playerTeam === "A" ? gameState.formationA : gameState.formationB;
  const onPitch = gameState.players.filter((p) => p.team === playerTeam).sort((a, b) => a.slotIndex - b.slotIndex);
  const [pitchRef, pitchSize] = useElementSize<HTMLDivElement>();
  const compact = subsCardCompact(pitchSize.w || 860);
  const slotPos = useMemo(() => {
    const card = subsCardPercent(pitchSize.w || 860, pitchSize.h || 555);
    return subsSlotPositions(formation.attacking, formation.defending, card).map((p) => ({ left: `${p.x}%`, top: `${p.y}%` }));
  }, [formation, pitchSize.w, pitchSize.h]);
  const cardStyle = { width: compact ? SUBS_CARD.COMPACT_W : SUBS_CARD.W, height: SUBS_CARD.H };
  const roleAbbr = (role: string) => t(`roles.detailedAbbr.${role}`, { defaultValue: role });
  const vacantSlots = (gameState.injuryVacancies?.[playerTeam] ?? []).map((v) => v.slotIndex);

  const queuedOutIds = new Set(pendingQueue.map((s) => s.outId));
  const queuedInIds = new Set(pendingQueue.map((s) => s.inId));
  const canSub = subsRemaining - pendingQueue.length > 0;

  const availableBench = useMemo(
    () =>
      bench
        .filter((p) => !queuedInIds.has(p.id))
        .sort((a, b) => compareSquadPositions({ pos: gamePlayerNaturalRole(a), name: a.name }, { pos: gamePlayerNaturalRole(b), name: b.name })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bench, pendingQueue],
  );

  const yellowIds = new Set(gameState.cards.filter((c) => c.team === playerTeam && c.card === "yellow").map((c) => c.playerId));
  const yellowCount = new Map<number, number>();
  for (const c of gameState.cards) if (c.team === playerTeam && c.card === "yellow") yellowCount.set(c.playerId, (yellowCount.get(c.playerId) ?? 0) + 1);
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
          <div
            ref={pitchRef}
            className="relative w-full md:max-w-[calc((80vh-19rem)*1.55)] aspect-[115/74] rounded-md overflow-hidden border border-chart-2/50"
          >
            {newVisualOn() && (
              <img src={gameArtUrl(PITCH_BOARD)} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" />
            )}
            <PitchMarkingsSvg grass={!newVisualOn()} />
            {/* An injured player's empty slot (#140): a dashed card until the manager picks the replacement. */}
            {vacantSlots.map((slot) => (
              <div
                key={`vacant-${slot}`}
                className="absolute -translate-x-1/2 -translate-y-1/2 px-2 rounded-lg border border-dashed border-destructive/70 bg-background/70 text-sm text-destructive flex items-center gap-1.5"
                style={{ ...(slotPos[slot] ?? { left: "50%", top: "50%" }), ...cardStyle }}
              >
                <span className="font-display font-bold leading-none">{roleAbbr(formation.attacking[slot]?.role ?? "")}</span>
                <span className="truncate">{t("substitutionPanel.vacant")}</span>
              </div>
            ))}
            {onPitch.map((p) => {
              const pos = slotPos[p.slotIndex] ?? { left: "50%", top: "50%" };
              const isOut = queuedOutIds.has(p.id);
              const isSelected = selection?.kind === "starter" && selection.id === p.id;
              const over = drag?.over === `slot:${p.id}`;
              const r10 = displayRating10(p, ratings);
              const natural = gamePlayerNaturalRole(p);
              const outOfPosition = natural !== p.role;
              const roleClass = outOfPosition ? "text-chart-4" : getDetailedPositionColor(p.role);
              const booked = yellowIds.has(p.id);
              const banRisk = isOneYellowFromBan(p.seasonYellows, { goals: 0, assists: 0, yellows: yellowCount.get(p.id) ?? 0, red: false });
              const injured = injuredIds.has(p.id);
              const face = faceUrls?.[p.rosterId];
              const tag = (
                <span
                  className={`shrink-0 rounded border border-current bg-background/95 px-1 font-display font-bold uppercase text-[13px] leading-tight ${roleClass}`}
                  title={outOfPosition ? t("substitutionPanel.naturalRole", { role: roleAbbr(natural) }) : undefined}
                >
                  {roleAbbr(p.role)}
                </span>
              );
              return (
                <button
                  key={p.id}
                  type="button"
                  data-pitch-marker
                  data-drop={`slot:${p.id}`}
                  {...dragProps({ kind: "slot", key: String(p.id) }, p.name)}
                  onClick={() => tap("starter", p.id)}
                  aria-pressed={isSelected}
                  aria-label={`${roleAbbr(p.role)} ${p.name}`}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 pl-1 pr-1.5 rounded-lg border text-left cursor-pointer transition-colors ${
                    isSelected || over
                      ? "z-20 border-primary ring-2 ring-primary bg-background/90"
                      : isOut
                        ? "z-10 border-dashed border-chart-4 bg-background/60 opacity-70"
                        : "z-10 border-white/15 bg-background/80 hover:border-primary/60"
                  }`}
                  style={{ ...pos, ...cardStyle }}
                >
                  {!compact &&
                    (face ? (
                      <FaceImage src={face} size={32} fallback={playerInitials(p.name)} ringClassName={`border-2 border-current ${roleClass}`} className="shrink-0" />
                    ) : (
                      <span className={`shrink-0 w-8 h-8 rounded-full border-2 border-current bg-secondary flex items-center justify-center ${roleClass}`}>
                        <span className="font-display text-sm text-foreground">{playerInitials(p.name)}</span>
                      </span>
                    ))}
                  <span className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                    <span className="flex items-center gap-1 min-w-0">
                      {compact && tag}
                      <span className="flex-1 min-w-0 text-sm font-semibold text-foreground truncate leading-none">{shirtName(p.name)}</span>
                      {!compact && <span className={`text-sm font-black tabular-nums leading-none ${ratingTextClass10(r10)}`}>{r10.toFixed(1)}</span>}
                    </span>
                    <EnergyBar energy={p.energy} compact={compact} />
                  </span>
                  {/* Role tag and marks sit on the card's edges, so the card keeps its fixed size. */}
                  {!compact && <span className="absolute -top-2.5 -left-2 pointer-events-none">{tag}</span>}
                  {(booked || banRisk || injured || isOut) && (
                    <span className="absolute -top-2.5 -right-2 flex items-center gap-0.5 pointer-events-none">
                      {booked && <span className="inline-block w-2.5 h-3.5 rounded-sm bg-card-yellow" title={t("substitutionPanel.booked")} aria-label={t("substitutionPanel.booked")} />}
                      {banRisk && <BanRiskMark />}
                      {injured && (
                        <span title={t("substitutionPanel.injured")} aria-label={t("substitutionPanel.injured")} className="inline-flex rounded-full bg-background p-0.5 text-destructive"><Icon name="heart-pulse" size={16} /></span>
                      )}
                      {isOut && (
                        <span title={t("substitutionPanel.off")} aria-label={t("substitutionPanel.off")} className="inline-flex rounded-full bg-background p-0.5 text-chart-4"><Icon name="arrow-right-left" size={16} /></span>
                      )}
                    </span>
                  )}
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
                    <span className={`w-9 shrink-0 font-display font-bold text-sm ${getDetailedPositionColor(gamePlayerNaturalRole(p))}`}>
                      {t(`roles.detailedAbbr.${gamePlayerNaturalRole(p)}`, { defaultValue: gamePlayerNaturalRole(p) })}
                    </span>
                    <span className="flex-1 min-w-0 text-sm font-semibold text-foreground truncate">{shirtName(p.name)}</span>
                    {isOneYellowFromBan(p.seasonYellows) && <BanRiskMark />}
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
