import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, ArrowRightLeft } from "lucide-react";
import type { GamePlayer, GameState, PendingSub } from "@/GameEngine/types";
import { SUPPORTED_FORMATIONS } from "@/GameEngine/Domain/SetPieceLayouts";
import { getMainRole, getPositionColor, MAIN_ROLE_BADGE_CLASSES } from "@/GameInterface/positionHelpers";
import { ratingTextClass10 } from "@/GameInterface/scoreColors";

// ── Energy bar helpers ───────────────────────────────────────────────────────

function energyBarClass(energy: number): string {
  if (energy >= 60) return "bg-emerald-500";
  if (energy >= 35) return "bg-amber-500";
  return "bg-red-500";
}

function energyLabel(energy: number): string {
  return Math.round(energy).toString();
}

/** Match rating from live engine when available; otherwise approximate from runtime stats (bench). */
function displayRating10(p: GamePlayer, ratings?: Record<number, number>): number {
  const live = ratings?.[p.id];
  if (live !== undefined && !Number.isNaN(live)) return live;
  if (p.role === "GK") {
    const wob = p.runtimeStats.withoutBall;
    return ((wob.gkPositioning + wob.gkReflex + wob.gkDiving) / 3) * 10;
  }
  const wb = p.runtimeStats.withBall;
  const wob = p.runtimeStats.withoutBall;
  const nums = [
    wb.speed,
    wb.passingSkill,
    wb.dribbling,
    wb.vision,
    wb.shootAccuracy,
    wob.speed,
    wob.tackleChance,
    wob.interceptionChance,
  ];
  return (nums.reduce((a, b) => a + b, 0) / nums.length) * 10;
}

function averageRating(players: GamePlayer[], ratings?: Record<number, number>): number {
  if (players.length === 0) return 0;
  const sum = players.reduce((acc, p) => acc + displayRating10(p, ratings), 0);
  return Math.round((sum / players.length) * 10) / 10;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SubstitutionPanelProps {
  gameState: GameState;
  playerTeam: "A";
  /** Live match ratings (0–10) keyed by engine player id — from PlayerRating. */
  ratings?: Record<number, number>;
  onQueueSub: (sub: PendingSub) => void;
  onChangeFormation: (formationId: string) => void;
  onClose: () => void;
}

const FORMATION_LIST = Array.from(SUPPORTED_FORMATIONS).sort();

// ── Component ─────────────────────────────────────────────────────────────────

export function SubstitutionPanel({
  gameState,
  playerTeam,
  ratings,
  onQueueSub,
  onChangeFormation,
  onClose,
}: SubstitutionPanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"subs" | "formation">("subs");
  const [selectedOutId, setSelectedOutId] = useState<number | null>(null);

  const subsRemaining =
    playerTeam === "A" ? gameState.subsRemainingA : gameState.subsRemainingB;
  const pendingCount =
    playerTeam === "A" ? gameState.pendingSubsA.length : gameState.pendingSubsB.length;

  const bench = playerTeam === "A" ? gameState.benchA : gameState.benchB;
  const onPitch = gameState.players
    .filter((p) => p.team === playerTeam)
    .sort((a, b) => a.slotIndex - b.slotIndex);

  const currentFormationId =
    playerTeam === "A" ? gameState.formationA.id : gameState.formationB.id;

  const pendingQueue =
    playerTeam === "A" ? gameState.pendingSubsA : gameState.pendingSubsB;
  const queuedOutIds = new Set(pendingQueue.map((s) => s.outId));
  const queuedInIds = new Set(pendingQueue.map((s) => s.inId));

  const availableBench = bench.filter((p) => !queuedInIds.has(p.id));

  const xiAvg = averageRating(onPitch, ratings);
  const benchAvg = averageRating(availableBench, ratings);

  const selectedOut = selectedOutId ? onPitch.find((p) => p.id === selectedOutId) : undefined;

  function handleSelectOut(id: number) {
    setSelectedOutId((prev) => (prev === id ? null : id));
  }

  function handleSelectIn(inId: number) {
    if (!selectedOutId) return;
    onQueueSub({ outId: selectedOutId, inId });
    setSelectedOutId(null);
  }

  const canAddMore = subsRemaining - pendingCount > 0;

  function RoleBadge({ role }: { role: string }) {
    const main = getMainRole(role);
    const cls = MAIN_ROLE_BADGE_CLASSES[main];
    return (
      <span
        className={`inline-flex items-center justify-center min-w-[2rem] px-1 py-0.5 rounded text-[9px] font-black uppercase border shrink-0 ${cls}`}
      >
        {role}
      </span>
    );
  }

  function roleNameClass(role: string): string {
    return getPositionColor(role);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-[80vw] h-[80vh] max-w-[calc(100vw-1.5rem)] max-h-[calc(100vh-1.5rem)] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <ArrowRightLeft className="w-5 h-5 text-primary" />
            <h2 className="font-black font-display uppercase tracking-wider text-foreground m-0 text-base">
              {t("substitutionPanel.title")}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-[10px] font-bold tabular-nums text-muted-foreground">
              {t("substitutionPanel.xiAvg")} <span className={ratingTextClass10(xiAvg)}>{xiAvg.toFixed(1)}</span>
              <span className="mx-1.5 text-border">·</span>
              {t("substitutionPanel.benchAvg")} <span className={ratingTextClass10(benchAvg)}>{benchAvg.toFixed(1)}</span>
            </span>
            <span
              className={`text-sm font-bold tabular-nums px-3 py-1 rounded-full border ${
                subsRemaining > 0
                  ? "border-primary/40 text-primary bg-primary/10"
                  : "border-border text-muted-foreground"
              }`}
            >
              {t("substitutionPanel.remaining", { remaining: subsRemaining - pendingCount })}
            </span>
            {pendingCount > 0 && (
              <span className="text-xs font-bold text-amber-400 bg-amber-400/10 border border-amber-400/30 px-2 py-1 rounded-full">
                {t("substitutionPanel.pending", { count: pendingCount })}
              </span>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          {(["subs", "formation"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-sm font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                activeTab === tab
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "subs" ? t("substitutionPanel.playerSwap") : t("substitutionPanel.formation")}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {activeTab === "subs" && (
            <>
              {/* Pending — full width strip */}
              {pendingQueue.length > 0 && (
                <div className="shrink-0 px-4 py-2 border-b border-border/60 bg-amber-400/5">
                  <p className="text-[10px] font-black uppercase tracking-wider text-amber-400 m-0 mb-1.5">
                    {t("substitutionPanel.pendingSubstitutions")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {pendingQueue.map((pq) => {
                      const out =
                        onPitch.find((p) => p.id === pq.outId) ?? bench.find((p) => p.id === pq.outId);
                      const inP = bench.find((p) => p.id === pq.inId);
                      return (
                        <div
                          key={`${pq.outId}-${pq.inId}`}
                          className="flex items-center gap-2 px-2 py-1 rounded-lg bg-amber-400/10 border border-amber-400/20 text-xs"
                        >
                          <span className="text-red-400 font-medium truncate max-w-[8rem]">{out?.name ?? "?"}</span>
                          <ArrowRightLeft className="w-3 h-3 text-amber-400 shrink-0" />
                          <span className="text-emerald-400 font-medium truncate max-w-[8rem]">{inP?.name ?? "?"}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <p className="shrink-0 px-4 pt-2 pb-1 text-xs text-muted-foreground">
                {selectedOutId
                  ? t("substitutionPanel.chooseBench")
                  : canAddMore
                    ? t("substitutionPanel.chooseStarter")
                    : t("substitutionPanel.noSubsRemaining")}
              </p>

              {/* Horizontal 1v1 preview — out vs in, same row (not stacked) */}
              {selectedOut && (
                <div className="shrink-0 px-4 pb-2">
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 items-stretch rounded-xl border border-primary/30 bg-primary/5 p-3">
                    <div className="flex flex-col gap-1 min-w-0 rounded-lg border border-border/60 bg-card/80 px-3 py-2">
                      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{t("substitutionPanel.out")}</span>
                      <div className="flex items-center gap-2 min-w-0">
                        <RoleBadge role={selectedOut.role} />
                        <span className={`text-sm font-bold truncate ${roleNameClass(selectedOut.role)}`}>
                          {selectedOut.name}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span className={ratingTextClass10(displayRating10(selectedOut, ratings))}>
                          {displayRating10(selectedOut, ratings).toFixed(1)} {t("substitutionPanel.rating")}
                        </span>
                        <span>{t("substitutionPanel.energy")} {energyLabel(selectedOut.energy)}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-center py-1 sm:py-0">
                      <ArrowRightLeft className="w-6 h-6 text-primary shrink-0" aria-hidden />
                    </div>
                    <div className="flex flex-col gap-1 min-w-0 rounded-lg border border-dashed border-emerald-500/40 bg-emerald-500/5 px-3 py-2 justify-center">
                      <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                        {t("substitutionPanel.in")}
                      </span>
                      <p className="text-sm text-muted-foreground m-0">{t("substitutionPanel.selectBench")}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Side by side: XI | Bench */}
              <div className="flex-1 min-h-0 flex gap-3 px-4 pb-3">
                {/* Starting XI */}
                <div className="flex-1 min-w-0 flex flex-col border border-border/50 rounded-xl overflow-hidden bg-secondary/20">
                  <div className="shrink-0 px-3 py-2 border-b border-border/50 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      {t("substitutionPanel.startingXi")}
                    </span>
                    <span className="text-[10px] font-bold tabular-nums text-muted-foreground">
                      {t("common.average")} <span className={ratingTextClass10(xiAvg)}>{xiAvg.toFixed(1)}</span>
                    </span>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
                    {onPitch.map((p) => {
                      const isOut = queuedOutIds.has(p.id);
                      const isSelected = p.id === selectedOutId;
                      const isDisabled = !canAddMore || isOut || (!isSelected && !!selectedOutId);
                      const r10 = displayRating10(p, ratings);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => !isOut && canAddMore && handleSelectOut(p.id)}
                          disabled={isDisabled && !isSelected}
                          className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg border text-left transition-all ${
                            isSelected
                              ? "bg-primary/20 border-primary/60 ring-1 ring-primary/40"
                              : isOut
                                ? "opacity-40 border-border cursor-not-allowed"
                                : isDisabled
                                  ? "opacity-50 border-border cursor-not-allowed"
                                  : "border-border/60 hover:border-primary/40 hover:bg-secondary/40 cursor-pointer"
                          }`}
                        >
                          <RoleBadge role={p.role} />
                          <span
                            className={`flex-1 min-w-0 text-sm font-semibold truncate ${roleNameClass(p.role)}`}
                          >
                            {p.name}
                          </span>
                          <span className={`text-xs font-black tabular-nums shrink-0 w-8 text-right ${ratingTextClass10(r10)}`}>
                            {r10.toFixed(1)}
                          </span>
                          <div className="flex items-center gap-1 shrink-0 w-[4.5rem]">
                            <div className="h-1.5 flex-1 rounded-full bg-muted/60 overflow-hidden min-w-0">
                              <div
                                className={`h-full rounded-full ${energyBarClass(p.energy)}`}
                                style={{ width: `${p.energy}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-bold tabular-nums text-muted-foreground w-5 text-right">
                              {energyLabel(p.energy)}
                            </span>
                          </div>
                          {isOut && (
                            <span className="text-[8px] font-black text-amber-400 uppercase shrink-0">{t("substitutionPanel.off")}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {selectedOutId && (
                    <div className="shrink-0 px-2 py-1.5 border-t border-border/50">
                      <button
                        type="button"
                        onClick={() => setSelectedOutId(null)}
                        className="text-xs text-muted-foreground hover:text-foreground w-full py-1 cursor-pointer"
                      >
                        {t("substitutionPanel.cancelSelection")}
                      </button>
                    </div>
                  )}
                </div>

                {/* Bench */}
                <div className="flex-1 min-w-0 flex flex-col border border-border/50 rounded-xl overflow-hidden bg-secondary/10">
                  <div className="shrink-0 px-3 py-2 border-b border-border/50 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      {t("substitutionPanel.bench")}
                    </span>
                    <span className="text-[10px] font-bold tabular-nums text-muted-foreground">
                      {t("common.average")} <span className={ratingTextClass10(benchAvg)}>{benchAvg.toFixed(1)}</span>
                    </span>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
                    {availableBench.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-2 py-4 text-center">{t("substitutionPanel.noAvailable")}</p>
                    ) : (
                      availableBench.map((p) => {
                        const r10 = displayRating10(p, ratings);
                        const canPick = !!selectedOutId && canAddMore;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => canPick && handleSelectIn(p.id)}
                            disabled={!canPick}
                            className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg border text-left transition-all ${
                              canPick
                                ? "border-emerald-500/25 hover:border-emerald-500/60 hover:bg-emerald-500/10 cursor-pointer"
                                : "border-border/40 opacity-70 cursor-default"
                            }`}
                          >
                            <RoleBadge role={p.role} />
                            <span
                              className={`flex-1 min-w-0 text-sm font-semibold truncate ${roleNameClass(p.role)}`}
                            >
                              {p.name}
                            </span>
                            <span className={`text-xs font-black tabular-nums shrink-0 w-8 text-right ${ratingTextClass10(r10)}`}>
                              {r10.toFixed(1)}
                            </span>
                            <div className="flex items-center gap-1 shrink-0 w-[4.5rem]">
                              <div className="h-1.5 flex-1 rounded-full bg-muted/60 overflow-hidden min-w-0">
                                <div
                                  className={`h-full rounded-full ${energyBarClass(p.energy)}`}
                                  style={{ width: `${p.energy}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-bold tabular-nums text-muted-foreground w-5 text-right">
                                {energyLabel(p.energy)}
                              </span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === "formation" && (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
              <p className="text-xs text-muted-foreground m-0">
                {t("substitutionPanel.changeFormationHint")}
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {FORMATION_LIST.map((fid) => {
                  const isActive = fid === currentFormationId;
                  return (
                    <button
                      key={fid}
                      type="button"
                      onClick={() => onChangeFormation(fid)}
                      className={`py-3 rounded-xl border font-bold text-sm transition-all cursor-pointer ${
                        isActive
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-secondary/40 border-border hover:border-primary/40 hover:bg-secondary/60 text-foreground"
                      }`}
                    >
                      {fid}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-secondary/60 border border-border hover:border-primary/40 text-sm font-bold text-foreground transition-colors cursor-pointer"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
