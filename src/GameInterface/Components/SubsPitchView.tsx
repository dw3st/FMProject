import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { shirtName } from "@/Domain/shirtName";
import { compareSquadPositions } from "@/Domain/positions/positionSort";
import type { GamePlayer, GameState, PendingSub, TeamId } from "@/GameEngine/types";
import { gamePlayerNaturalRole, getDetailedPositionColor } from "@/GameInterface/positionHelpers";
import { ratingTextClass10 } from "@/GameInterface/scoreColors";
import { Icon } from "@/GameInterface/Icons";
import { DragGhost, useDragDrop } from "@/GameInterface/Components/useDragDrop";
import { tapSubsPlayer, type SubsAction, type SubsSelection } from "@/GameInterface/subsSelection";
import { isOneYellowFromBan } from "@/GameInterface/matchPlayerEvents";
import { BanRiskMark } from "@/GameInterface/TeamPanel";
import { FaceImage, playerInitials } from "@/GameInterface/Components/PlayerFace";
import { spreadSubsMarkers } from "@/Domain/formation/pitchMarkers";
import { getFormationSlots } from "@/types/formationSlots";
import { gameArtUrl, newVisualOn } from "@/Domain/art/paintedFaces";
import { aptitudeFor, slotValue, type Aptitude } from "@/Domain/positions/positionAptitude";

const APT_RANK: Record<Aptitude, number> = { natural: 3, apt: 2, training: 1, unsuitable: 0 };
import { PlayerTipBody, ROW_TIP_H, ROW_TIP_W } from "@/GameInterface/Components/PlayerTipBody";
import type { RosterPlayer } from "@/types/playerTypes";

export const PITCH_BOARD = "formation/pitch-board.webp";

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

/** Pitch lines of the vertical formation pitch (attack up), over the painted board or a plain grass. */
export function PitchLinesVertical({ grass }: { grass: boolean }) {
  const line = { fill: "none", stroke: "rgba(255,255,255,0.22)", strokeWidth: 0.3 } as const;
  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      {grass && <rect x="0" y="0" width="100" height="100" className="fill-chart-2/25" />}
      <rect x="5" y="5" width="90" height="90" {...line} />
      <line x1="5" y1="50" x2="95" y2="50" {...line} />
      <circle cx="50" cy="50" r="12" {...line} />
      <rect x="25" y="5" width="50" height="18" {...line} />
      <rect x="35" y="5" width="30" height="8" {...line} />
      <rect x="25" y="77" width="50" height="18" {...line} />
      <rect x="35" y="87" width="30" height="8" {...line} />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface SubsPitchViewProps {
  gameState: GameState;
  playerTeam: TeamId;
  ratings?: Record<number, number>;
  onQueueSub: (sub: PendingSub) => void;
  /** Two starters swap positions (no substitution used). */
  onSwapPositions?: (aId: number, bId: number) => void;
  /** A starter moves to a slot nobody holds (after a red card or an injury), no substitution used. */
  onMoveToSlot?: (id: number, slot: number) => void;
  /** Face URL per roster id (the match's faces, in the kit worn); absent = initials. */
  faceUrls?: Record<string, string>;
  /** The club's squad: the hover card of each player (the one of the Formation screen); absent = no card. */
  roster?: RosterPlayer[];
}

/**
 * Substitutions tab of the live panel (#115): the current XI on a mini pitch (each starter in his
 * slot of the current formation, with position, energy and card/injury) and the bench sorted by
 * position. Tap a starter, then a bench player (or the other way) to queue a substitution; tap two
 * starters to swap their positions without using a substitution. Dragging works too.
 */
export function SubsPitchView({ gameState, playerTeam, ratings, onQueueSub, onSwapPositions, onMoveToSlot, faceUrls, roster }: SubsPitchViewProps) {
  const { t } = useTranslation();
  const [selection, setSelection] = useState<SubsSelection>(null);
  const [tip, setTip] = useState<{ id: number; left: number; top: number } | null>(null);
  useEffect(() => {
    if (!tip) return;
    const hide = () => setTip(null);
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [tip]);
  const tipProps = (id: number) => ({
    onMouseEnter: (e: ReactMouseEvent<HTMLElement>) => {
      if (e.buttons !== 0) return; // dragging
      const r = e.currentTarget.getBoundingClientRect();
      const left = r.left >= ROW_TIP_W + 16 ? r.left - ROW_TIP_W - 8 : r.right + 8;
      setTip({ id, left, top: Math.max(64, Math.min(r.top, window.innerHeight - ROW_TIP_H - 48)) });
    },
    onMouseLeave: () => setTip(null),
    onMouseDown: () => setTip(null),
  });

  const subsRemaining = playerTeam === "A" ? gameState.subsRemainingA : gameState.subsRemainingB;
  const pendingQueue = playerTeam === "A" ? gameState.pendingSubsA : gameState.pendingSubsB;
  const bench = playerTeam === "A" ? gameState.benchA : gameState.benchB;
  const formation = playerTeam === "A" ? gameState.formationA : gameState.formationB;
  const onPitch = gameState.players.filter((p) => p.team === playerTeam).sort((a, b) => a.slotIndex - b.slotIndex);
  // Same placement as the Formation pitch: attacking up, markers spread so names and bars never touch.
  const slotPos = useMemo(() => spreadSubsMarkers(getFormationSlots(formation)), [formation]);
  const roleAbbr = (role: string) => t(`roles.detailedAbbr.${role}`, { defaultValue: role });
  const vacantSlots = (gameState.injuryVacancies?.[playerTeam] ?? []).map((v) => v.slotIndex);
  // Every slot nobody holds: an injury's, waiting for a replacement, or a sent-off player's, for good.
  const emptySlots = formation.attacking.map((_, i) => i).filter((i) => !onPitch.some((p) => p.slotIndex === i));

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

  function moveTo(id: number, slot: number) {
    if (onPitch.find((p) => p.id === id)?.role === "GK") return;
    setSelection(null);
    onMoveToSlot?.(id, slot);
  }

  // Drag: a bench player onto a starter (or back) queues the substitution; a starter onto another
  // starter swaps them. `slot:<id>` and `bench:<id>` hold engine ids here.
  const { drag, dragProps, consumeClick } = useDragDrop((source, target) => {
    if (target.kind === "empty") {
      if (source.kind === "slot") moveTo(Number(source.key), target.slot);
      return;
    }
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
  const canMove = !!onMoveToSlot && emptySlots.length > 0;
  const hint = canMove && (!selection || (selectedStarter && selectedStarter.role !== "GK"))
    ? t(selectedStarter ? "substitutionPanel.pickEmptySlot" : "substitutionPanel.chooseStarterEmptySlot")
    : selectedStarter
    ? canSub
      ? onSwapPositions && selectedStarter.role !== "GK" ? t("substitutionPanel.pickBenchOrSwap") : t("substitutionPanel.chooseBench")
      : onSwapPositions && selectedStarter.role !== "GK" ? t("substitutionPanel.pickSwap") : t("substitutionPanel.noSubsRemaining")
    : selection?.kind === "bench"
      ? t("substitutionPanel.pickStarter")
      : canSub
        ? t("substitutionPanel.chooseStarter")
        : t("substitutionPanel.noSubsRemaining");

  // The numbers at the slot he plays; the bench at his natural position.
  const tipPlayer = tip ? onPitch.find((p) => p.id === tip.id) ?? bench.find((p) => p.id === tip.id) : undefined;
  const tipRoster = tipPlayer ? roster?.find((p) => p.id === tipPlayer.rosterId) : undefined;
  const tipRole = tipPlayer ? (onPitch.includes(tipPlayer) ? tipPlayer.role : gamePlayerNaturalRole(tipPlayer)) : "";
  // Out of position = a slot he is not suited to (needs training or worse), as on the Formation screen: a left
  // wing-back at left-back is fine. Without the roster record, the old test (slot differs from his natural role).
  const poorFit = (p: GamePlayer, role: string): boolean => {
    const r = roster?.find((x) => x.id === p.rosterId);
    return r ? APT_RANK[aptitudeFor(r, role)] < APT_RANK.apt : role !== gamePlayerNaturalRole(p);
  };
  const tipPoorFit = tipPlayer ? poorFit(tipPlayer, tipRole) : false;
  const tipMatchRating = tipPlayer ? ratings?.[tipPlayer.id] : undefined;
  // A substitute with no minutes has no match rating: his level at his position (the number of his card).
  const benchRole = selectedStarter?.role;
  const benchNumber = (p: GamePlayer): number => {
    const live = ratings?.[p.id];
    if (live !== undefined && !Number.isNaN(live)) return live;
    const r = roster?.find((x) => x.id === p.rosterId);
    return r ? slotValue(r, benchRole ?? gamePlayerNaturalRole(p)) : displayRating10(p, ratings);
  };
  // With a starter picked, the bench lists who suits his position first (natural, then adapted), then the level
  // there, as on the Formation screen (tester report).
  const shownBench = useMemo(() => {
    if (!benchRole) return availableBench;
    const info = (p: GamePlayer) => {
      const r = roster?.find((x) => x.id === p.rosterId);
      return r ? { fit: APT_RANK[aptitudeFor(r, benchRole)], value: slotValue(r, benchRole) } : { fit: 0, value: 0 };
    };
    return availableBench.map((p) => ({ p, ...info(p) })).sort((a, b) => b.fit - a.fit || b.value - a.value).map((x) => x.p);
  }, [availableBench, benchRole, roster]);

  // A new signing still settling in: the games he has left (tester report: show it on this panel too).
  const settlingLeft = (p: GamePlayer): number => {
    const s = roster?.find((x) => x.id === p.rosterId)?.settling;
    return s ? Math.max(0, s.need - s.games) : 0;
  };

  return (
    <>
      <DragGhost drag={drag} />
      {tip && tipPlayer && tipRoster && createPortal(
        <div
          className={`fixed z-[100] w-60 p-3 rounded-md bg-card border pointer-events-none ${tipPoorFit ? "border-chart-4/40" : "border-border"}`}
          style={{ left: tip.left, top: tip.top }}
        >
          <PlayerTipBody player={tipRoster} role={tipRole} avg={slotValue(tipRoster, tipRole)} energy={tipPlayer.energy} oop={tipPoorFit} {...(tipMatchRating !== undefined && !Number.isNaN(tipMatchRating) ? { matchRating: tipMatchRating } : {})} />
        </div>,
        document.body,
      )}
      <div className="shrink-0 px-4 pt-2 pb-1 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground m-0">{hint}</p>
        {selection && (
          <button type="button" onClick={() => setSelection(null)} className="text-sm text-muted-foreground hover:text-foreground cursor-pointer shrink-0">
            {t("substitutionPanel.cancelSelection")}
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 flex flex-col md:flex-row md:justify-center gap-6">
        {/* The XI on the formation pitch (attacking up, as in Formation): face, role, rating, name and fitness. */}
        <div className="min-w-0 flex justify-center md:h-full">
          <div className="relative w-full md:w-auto md:h-full max-h-[calc(100vh-14rem)] aspect-[3/4] rounded-md border border-chart-2/50 self-start [container-type:inline-size]">
            <div className="absolute inset-0 rounded-md overflow-hidden">
              {newVisualOn() && (
                <img src={gameArtUrl(PITCH_BOARD)} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" />
              )}
              <PitchLinesVertical grass={!newVisualOn()} />
            </div>
            {/* A slot nobody holds (#140, or a red card): a dashed circle; a starter can move there. */}
            {emptySlots.map((slot) => {
              const pos = slotPos[slot] ?? { x: 50, y: 50 };
              const injury = vacantSlots.includes(slot);
              const open = !!onMoveToSlot && !!selectedStarter && selectedStarter.role !== "GK";
              const over = drag?.over === `empty:${slot}`;
              const color = open || over ? "border-primary text-primary" : injury ? "border-destructive/80 text-destructive" : "border-muted-foreground text-muted-foreground";
              return (
                <button
                  key={`vacant-${slot}`}
                  type="button"
                  data-drop={`empty:${slot}`}
                  disabled={!open}
                  onClick={() => selectedStarter && moveTo(selectedStarter.id, slot)}
                  className={`absolute -translate-x-1/2 -translate-y-[30%] flex flex-col items-center gap-1 bg-transparent border-0 p-0 ${open ? "cursor-pointer z-20" : "cursor-default"}`}
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                >
                  <span className={`w-10 h-10 rounded-full border-2 border-dashed bg-background/70 flex items-center justify-center font-display font-bold uppercase tracking-[0.08em] text-[13px] ${color} ${over ? "ring-2 ring-primary" : ""}`}>
                    {roleAbbr(formation.attacking[slot]?.role ?? "")}
                  </span>
                  <span className={`rounded bg-background/85 px-2 py-0.5 text-sm ${open ? "text-primary" : injury ? "text-destructive" : "text-muted-foreground"}`}>
                    {t(injury ? "substitutionPanel.vacant" : "substitutionPanel.emptySlot")}
                  </span>
                </button>
              );
            })}
            {onPitch.map((p) => {
              const pos = slotPos[p.slotIndex] ?? { x: 50, y: 50 };
              const isOut = queuedOutIds.has(p.id);
              const isSelected = selection?.kind === "starter" && selection.id === p.id;
              const over = drag?.over === `slot:${p.id}`;
              const r10 = displayRating10(p, ratings);
              const outOfPosition = poorFit(p, p.role);
              const roleClass = outOfPosition ? "text-chart-4" : getDetailedPositionColor(p.role);
              const booked = yellowIds.has(p.id);
              const banRisk = isOneYellowFromBan(p.seasonYellows, { goals: 0, assists: 0, yellows: yellowCount.get(p.id) ?? 0, red: false });
              const injured = injuredIds.has(p.id);
              const face = faceUrls?.[p.rosterId];
              const settling = settlingLeft(p);
              return (
                <button
                  key={p.id}
                  type="button"
                  data-pitch-marker
                  data-drop={`slot:${p.id}`}
                  {...dragProps({ kind: "slot", key: String(p.id) }, p.name)}
                  onClick={() => tap("starter", p.id)}
                  {...tipProps(p.id)}
                  aria-pressed={isSelected}
                  aria-label={`${roleAbbr(p.role)} ${p.name}`}
                  className={`absolute -translate-x-1/2 -translate-y-[35%] flex flex-col items-center gap-1 bg-transparent border-0 p-0 cursor-pointer select-none touch-none ${
                    isSelected || over ? "z-20" : "z-10"
                  } ${isOut ? "opacity-60" : ""}`}
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                >
                  <span
                    className={`relative rounded-full ${
                      isSelected || over ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : isOut ? "ring-2 ring-chart-4" : "hover:brightness-110"
                    }`}
                  >
                    {face ? (
                      <FaceImage src={face} size={40} fallback={playerInitials(p.name)} ringClassName={`border-2 border-current ${roleClass}`} />
                    ) : (
                      <span className={`w-10 h-10 rounded-full border-2 border-current bg-secondary flex items-center justify-center ${roleClass}`}>
                        <span className="font-display text-sm text-foreground">{playerInitials(p.name)}</span>
                      </span>
                    )}
                    <span
                      className={`absolute -top-2 -left-3 min-w-7 rounded border border-current bg-background/95 px-1 text-center font-display font-bold uppercase text-[13px] leading-tight ${roleClass}`}
                      title={outOfPosition ? t("substitutionPanel.naturalRole", { role: roleAbbr(gamePlayerNaturalRole(p)) }) : undefined}
                    >
                      {roleAbbr(p.role)}
                    </span>
                    {/* The rating sits on the face so the pill below has the whole width for the name. */}
                    <span className={`absolute -bottom-1 -right-5 rounded border border-border bg-background/95 px-1 text-sm font-black tabular-nums leading-tight ${ratingTextClass10(r10)}`}>
                      {r10.toFixed(1)}
                    </span>
                    {settling > 0 && (
                      <span
                        title={t("settling.left", { count: settling })}
                        aria-label={t("settling.left", { count: settling })}
                        className="absolute -bottom-1 right-[calc(100%-6px)] flex items-center gap-0.5 rounded border border-border bg-background/95 px-1 text-sm font-semibold tabular-nums leading-tight text-chart-4"
                      >
                        <Icon name="handshake" size={14} aria-hidden />
                        {settling}
                      </span>
                    )}
                    {(booked || banRisk || injured || isOut) && (
                      <span className="absolute -top-2 -right-3 flex items-center gap-0.5">
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
                  </span>
                  <span
                    className={`flex flex-col gap-0.5 w-[18cqw] rounded px-1.5 pt-0.5 pb-1 ${isSelected ? "bg-primary text-primary-foreground" : "bg-background/90 text-foreground"}`}
                    title={t("substitutionPanel.fitnessTitle", { value: Math.round(p.energy) })}
                  >
                    <span className="block min-w-0 truncate text-center text-sm font-semibold leading-tight">{shirtName(p.name)}</span>
                    <span className="block h-1.5 rounded-full bg-border/70 overflow-hidden">
                      <span className={`block h-full rounded-full ${energyBarClass(p.energy)}`} style={{ width: `${Math.max(0, Math.min(100, p.energy))}%` }} />
                    </span>
                  </span>
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
              shownBench.map((p) => {
                const r10 = benchNumber(p);
                const isSelected = selection?.kind === "bench" && selection.id === p.id;
                const over = drag?.over === `bench:${p.id}`;
                const settling = settlingLeft(p);
                return (
                  <button
                    key={p.id}
                    type="button"
                    data-drag-handle
                    data-drop={`bench:${p.id}`}
                    {...(canSub ? dragProps({ kind: "bench", key: String(p.id) }, p.name) : {})}
                    onClick={() => tap("bench", p.id)}
                    {...tipProps(p.id)}
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
                    {settling > 0 && (
                      <span
                        title={t("settling.left", { count: settling })}
                        aria-label={t("settling.left", { count: settling })}
                        className="shrink-0 rounded bg-chart-4/20 px-1 text-sm font-semibold leading-5 tabular-nums text-chart-4"
                      >
                        {settling}
                      </span>
                    )}
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
