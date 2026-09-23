import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Save, Users, UserPlus, Star, Zap, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { PageHeadline } from "@/GameInterface/Components/PageHeadline";
import { updateSaveFormation, updateSaveTacticalStyle, saveFormationAndTactics } from "@/GameInterface/gameSession";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { getFormationSlots } from "@/types/formationSlots";
import type { FormationSlot } from "@/types/formationSlots";
import { SUPPORTED_FORMATIONS } from "@/GameEngine/Domain/SetPieceLayouts";
import { TACTICAL_STYLE_OPTIONS, DEFAULT_TACTICAL_STYLE, getTacticalStyleMeta } from "@/types/tacticsTypes";
import type { TacticalStyle, TacticsSave } from "@/types/tacticsTypes";
import type { Squad, RosterPlayer } from "@/types/playerTypes";
import { Player } from "@/Domain/Player";
import { getMainRole, MAIN_ROLE_ABBR } from "@/GameInterface/positionHelpers";
import { ratingTextClass10 } from "@/GameInterface/scoreColors";
import {
  autoFillLineup,
  buildSlotAlignedLineup,
  isOutOfPosition,
  slotRoleFitRank,
} from "@/Domain/lineupHelpers";

interface FormationOption {
  id: string;
}

const DEFAULT_FORMATION = "4-3-3";

/** English fallback. UI prefers the i18n key `formations.blurbs.<id>` when available. */
const FORMATION_BLURBS: Record<string, string> = {
  "4-3-3": "Three forwards up top with midfield control and defensive stability.",
  "4-4-2": "Paired strikers backed by a balanced flat four across midfield.",
  "3-5-2": "Five midfielders dominate possession with wing-backs providing width.",
};

function getEnergyColor(energy: number) {
  if (energy >= 80) return "bg-emerald-500";
  if (energy >= 50) return "bg-amber-500";
  return "bg-red-500";
}

const ROLE_BADGE_COLORS: Record<string, string> = {
  GK:         "text-chart-4",
  Defender:   "text-blue-400",
  Midfielder: "text-primary",
  Forward:    "text-destructive",
};

export function FormationScreen() {
  const { t } = useTranslation();
  const { session, squad, loading: saveLoading, mergeSession } = useGameSave();
  const [formations, setFormations] = useState<FormationOption[]>([]);
  const [slots, setSlots] = useState<FormationSlot[]>([]);
  const [lineup, setLineup] = useState<string[]>([]);
  const [updating, setUpdating] = useState(false);
  const [tacticsUpdating, setTacticsUpdating] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [selectedSlotIdx, setSelectedSlotIdx] = useState<number | null>(null);
  const [benchTab, setBenchTab] = useState<"starting" | "bench">("starting");
  const [lineupReady, setLineupReady] = useState(false);

  const formationId = session?.formation ?? DEFAULT_FORMATION;

  useEffect(() => {
    if (!saveLoading && !session) {
      window.location.href = "/new-game";
    }
  }, [saveLoading, session]);

  useEffect(() => {
    if (!session) return;
    const saveId = session.saveId;
    fetch(`/api/saves/${saveId}/tactics`)
      .then((r) => r.json())
      .then((t: TacticsSave) => {
        if (t.lineup?.length) setLineup(t.lineup);
        mergeSession({
          formation: t.formation,
          tactical_style: t.tactical_style,
        });
        setLineupReady(true);
      })
      .catch(() => { setLineupReady(true); });
  }, [session?.saveId, mergeSession]);

  // Auto-fill lineup when no saved lineup exists and both slots and squad are available.
  useEffect(() => {
    if (!lineupReady || !squad || slots.length === 0 || lineup.length > 0) return;
    setLineup(autoFillLineup(slots, squad.players));
  }, [lineupReady, slots, squad, lineup.length]);

  useEffect(() => {
    fetch("/api/formations")
      .then((r) => r.json())
      .then((data: FormationOption[]) => setFormations(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!formationId) return;
    fetch(`/api/formations/${formationId}`)
      .then((r) => r.json())
      .then((data: { id: string; attacking: { role: string; x: number; y: number }[] }) => {
        setSlots(getFormationSlots(data));
      })
      .catch(() => setSlots([]));
  }, [formationId]);

  useEffect(() => {
    if (selectedSlotIdx === null) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setSelectedSlotIdx(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedSlotIdx]);

  async function handleSelectFormation(id: string) {
    if (!session || id === formationId || updating) return;
    setUpdating(true);
    try {
      const updated = await updateSaveFormation(session.saveId, id);
      mergeSession(updated);
    } finally {
      setUpdating(false);
    }
  }

  async function handleStyleChange(style: TacticalStyle) {
    if (!session || tacticsUpdating || session.tactical_style === style) return;
    setTacticsUpdating(true);
    try {
      const updated = await updateSaveTacticalStyle(session.saveId, style);
      mergeSession(updated);
    } finally {
      setTacticsUpdating(false);
    }
  }

  function handleAutoFill() {
    if (!squad || slots.length === 0) return;
    setLineup(autoFillLineup(slots, squad.players));
    setSelectedSlotIdx(null);
  }

  async function handleSave() {
    if (!session || saveStatus === "saving" || !squad) return;
    setSaveStatus("saving");
    try {
      const starting11Ids = [...lineup];
      while (starting11Ids.length < 11) starting11Ids.push("");
      const toSave = starting11Ids.slice(0, 11);
      const updated = await saveFormationAndTactics(session.saveId, {
        formation:      formationId,
        tactical_style: session.tactical_style ?? DEFAULT_TACTICAL_STYLE,
        lineup:         toSave,
      });
      mergeSession(updated);
      setLineup(toSave);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("idle");
    }
  }

  function handleSlotClick(slotIdx: number) {
    if (selectedSlotIdx === null) {
      setSelectedSlotIdx(slotIdx);
      setBenchTab("bench");
    } else if (selectedSlotIdx === slotIdx) {
      setSelectedSlotIdx(null);
    } else {
      // Swap two slots
      const newLineup = [...lineup];
      while (newLineup.length <= Math.max(selectedSlotIdx, slotIdx)) newLineup.push("");
      const tmp = newLineup[selectedSlotIdx]!;
      newLineup[selectedSlotIdx] = newLineup[slotIdx]!;
      newLineup[slotIdx] = tmp;
      setLineup(newLineup);
      setSelectedSlotIdx(null);
    }
  }

  function handleAssignPlayer(player: RosterPlayer) {
    if (selectedSlotIdx === null) return;
    const newLineup = [...lineup];
    while (newLineup.length <= selectedSlotIdx) newLineup.push("");
    // If player is already in lineup, swap positions
    const existingIdx = newLineup.indexOf(player.id);
    if (existingIdx !== -1) {
      newLineup[existingIdx] = newLineup[selectedSlotIdx] ?? "";
    }
    newLineup[selectedSlotIdx] = player.id;
    setLineup(newLineup);
    setSelectedSlotIdx(null);
    setBenchTab("starting");
  }

  const activeStyle: TacticalStyle = session?.tactical_style ?? DEFAULT_TACTICAL_STYLE;

  const parts = formationId.split("-").map(Number);
  const defenders = parts[0] ?? 0;
  const forwards = parts[parts.length - 1] ?? 0;
  const midfielders = parts.slice(1, -1).reduce((a, b) => a + b, 0);

  const startingBySlot = squad ? buildSlotAlignedLineup(squad.players, lineup) : Array<RosterPlayer | undefined>(11).fill(undefined);
  const usedInXi = new Set(
    startingBySlot.filter((p): p is RosterPlayer => p !== undefined).map((p) => p.id),
  );
  const bench = squad ? squad.players.filter((p) => !usedInXi.has(p.id)) : [];

  const targetSlotRole =
    selectedSlotIdx !== null && slots[selectedSlotIdx] ? slots[selectedSlotIdx]!.role : undefined;

  const benchOrderedForSlot =
    targetSlotRole && bench.length > 0
      ? [...bench].sort((a, b) => {
          const fit = slotRoleFitRank(b, targetSlotRole) - slotRoleFitRank(a, targetSlotRole);
          if (fit !== 0) return fit;
          return (
            Player.weightedScore(b.stats, targetSlotRole) - Player.weightedScore(a.stats, targetSlotRole)
          );
        })
      : bench;

  if (saveLoading || !session) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <main className="flex-1 p-4 overflow-auto">
        <div className="max-w-7xl mx-auto space-y-4">
          <PageHeadline
            backHref="/dashboard"
            subtitle={t("formations.subtitleHelp")}
            trailing={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAutoFill}
                  disabled={!squad || slots.length === 0}
                  className="flex items-center gap-2 py-3 px-4 rounded-xl bg-secondary text-foreground font-bold text-sm uppercase tracking-wider cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98] transition-transform border border-border/50 hover:border-primary/40 hover:bg-primary/10"
                >
                  <Users className="w-4 h-4" />
                  {t("formations.autoPosition")}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saveStatus === "saving" || !session}
                  className="flex items-center gap-2 py-3 px-6 rounded-xl bg-primary text-primary-foreground font-bold text-sm uppercase tracking-wider glow-primary-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98] transition-transform border-0"
                >
                  <Save className="w-4 h-4" />
                  {saveStatus === "saving" ? t("formations.saving") : saveStatus === "saved" ? t("formations.saved") : t("common.save")}
                </button>
              </div>
            }
          >
            {t("formations.title")} <span className="text-primary glow-text">{t("formations.subtitleTactics")}</span>
          </PageHeadline>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Formation Selector — absolute inside cell so pitch dictates row height */}
            <div className="lg:col-span-3 lg:relative">
              <div className="card-arcade rounded-xl p-4 lg:absolute lg:inset-0 overflow-y-auto">
                <h3 className="font-display font-bold text-sm uppercase tracking-wider text-primary mb-4">
                  {t("formations.selectFormation")}
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {formations.map((f) => {
                    const supported = SUPPORTED_FORMATIONS.has(f.id);
                    const isActive = f.id === formationId;
                    return (
                      <div key={f.id} className="relative group">
                        <button
                          onClick={() => supported ? handleSelectFormation(f.id) : undefined}
                          disabled={updating || !supported}
                          className={`w-full px-3 py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition-all duration-200 border-0 ${
                            isActive
                              ? "bg-primary text-primary-foreground glow-primary-sm cursor-pointer"
                              : supported
                              ? "bg-secondary/50 text-foreground border border-border/50 hover:border-primary/50 hover:bg-primary/10 cursor-pointer"
                              : "bg-muted/20 text-muted-foreground/40 border border-border/20 cursor-not-allowed"
                          }`}
                        >
                          {f.id}
                        </button>
                        {!supported && (
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded-md bg-card border border-border shadow-lg text-[10px] text-muted-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                            {t("common.comingSoon")}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-card border-r border-b border-border rotate-45 -mt-1" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {formations.length === 0 && (
                  <p className="text-muted-foreground text-sm py-4 text-center m-0">{t("formations.noFormations")}</p>
                )}

                <div className="mt-6 pt-4 border-t border-border/30">
                  <h4 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">{t("formations.formationInfo")}</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("roles.groups.Defender")}</span>
                      <span className="font-bold text-foreground">{defenders}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("roles.groups.Midfielder")}</span>
                      <span className="font-bold text-foreground">{midfielders}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("roles.groups.Forward")}</span>
                      <span className="font-bold text-foreground">{forwards}</span>
                    </div>
                  </div>
                  {(t(`formations.blurbs.${formationId}`, { defaultValue: FORMATION_BLURBS[formationId] ?? "" }) as string) && (
                    <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed m-0">
                      {t(`formations.blurbs.${formationId}`, { defaultValue: FORMATION_BLURBS[formationId] ?? "" })}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Pitch Preview */}
            <div className="lg:col-span-6">
              <FormationPitch
                slots={slots}
                formationId={formationId}
                players={startingBySlot}
                selectedSlotIdx={selectedSlotIdx}
                onSlotClick={handleSlotClick}
                getOutOfPosition={(player, slotRole) => isOutOfPosition(player, slotRole)}
              />
            </div>

            {/* Squad Panel — absolute inside cell so pitch dictates row height */}
            <div className="lg:col-span-3 lg:relative">
              <div className="card-arcade rounded-xl p-4 flex flex-col lg:absolute lg:inset-0 overflow-hidden">
                <div className="flex gap-1 p-1 bg-muted/30 rounded-lg mb-4 shrink-0">
                  <button
                    onClick={() => setBenchTab("starting")}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer border-0 ${
                      benchTab === "starting"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50 bg-transparent"
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    {t("formations.starting11")}
                  </button>
                  <button
                    onClick={() => setBenchTab("bench")}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer border-0 ${
                      benchTab === "bench"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50 bg-transparent"
                    }`}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    {t("formations.bench")}
                  </button>
                </div>

                {selectedSlotIdx !== null ? (
                  <p className="text-xs text-primary mb-3 px-2 py-1.5 bg-primary/10 rounded-lg border border-primary/30 m-0 shrink-0">
                    {t("formations.selectPlayerForSlot")} <span className="font-bold">{slots[selectedSlotIdx]?.role ?? selectedSlotIdx + 1}</span>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mb-3 m-0 shrink-0">
                    {benchTab === "starting" ? t("formations.currentStartingLineup") : t("formations.clickSlotHint")}
                  </p>
                )}

                <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
                  {benchTab === "starting" ? (
                    startingBySlot.map((player, idx) =>
                      player ? (
                        <SquadPlayerRow
                          key={player.id}
                          player={player}
                          slotLabel={slots[idx]?.role}
                          ratingRole={slots[idx]?.role}
                          showSlot
                          selected={selectedSlotIdx === idx}
                          outOfPosition={slots[idx] ? isOutOfPosition(player, slots[idx]!.role) : false}
                          onClick={() => handleSlotClick(idx)}
                        />
                      ) : (
                        <button
                          key={`empty-slot-${idx}`}
                          type="button"
                          onClick={() => handleSlotClick(idx)}
                          className={`flex w-full items-center gap-2 p-2 rounded-lg border text-left transition-colors cursor-pointer border-dashed ${
                            selectedSlotIdx === idx
                              ? "bg-primary/20 border-primary/50"
                              : "bg-muted/20 border-border/50 hover:bg-muted/40"
                          }`}
                        >
                          <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground w-6 shrink-0">
                            {slots[idx]?.role?.slice(0, 2) ?? "—"}
                          </span>
                          <span className="text-xs text-muted-foreground">{t("formations.emptySlotTapToFill")}</span>
                        </button>
                      ),
                    )
                  ) : (
                    bench.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4 m-0">{t("formations.noBenchPlayers")}</p>
                    ) : (
                      benchOrderedForSlot.map((player) => (
                        <SquadPlayerRow
                          key={player.id}
                          player={player}
                          ratingRole={targetSlotRole}
                          onClick={selectedSlotIdx !== null ? () => handleAssignPlayer(player) : undefined}
                          highlight={selectedSlotIdx !== null}
                        />
                      ))
                    )
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-border/30 shrink-0">
                  <p className="text-[10px] text-muted-foreground text-center m-0">
                    {benchTab === "starting"
                      ? t("formations.playersInStartingLineup", { count: startingBySlot.filter(Boolean).length })
                      : t("formations.playersOnBench", { count: bench.length })}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Tactical Style */}
          <div className="card-arcade rounded-xl p-5">
            <h3 className="font-display font-bold text-sm uppercase tracking-wider text-primary mb-6">
              {t("tactics.tacticalStyle")}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {TACTICAL_STYLE_OPTIONS.map((opt) => {
                const isActive = activeStyle === opt.value;
                const meta = getTacticalStyleMeta(opt.value, t as never);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleStyleChange(opt.value)}
                    disabled={tacticsUpdating}
                    className={`text-left p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      isActive
                        ? "bg-primary/10 border-primary glow-primary-sm"
                        : "bg-secondary/30 border-border/50 hover:border-primary/40 hover:bg-primary/5"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`font-bold text-sm uppercase tracking-wider ${isActive ? "text-primary" : "text-foreground"}`}>
                        {meta.label}
                      </span>
                      {isActive && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-primary text-primary-foreground font-bold uppercase tracking-wider">
                          {t("common.active")}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-3 m-0">
                      {meta.description}
                    </p>
                    <div className="space-y-1.5">
                      {meta.strengths.map((s) => (
                        <div key={s} className="flex items-start gap-1.5 text-[11px] text-emerald-400/90">
                          <CheckCircle2 className="w-3 h-3 shrink-0 mt-0.5" />
                          <span>{s}</span>
                        </div>
                      ))}
                      {meta.weaknesses.map((w) => (
                        <div key={w} className="flex items-start gap-1.5 text-[11px] text-red-400/80">
                          <XCircle className="w-3 h-3 shrink-0 mt-0.5" />
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
    </main>
  );
}

function SquadPlayerRow({
  player,
  slotLabel,
  ratingRole,
  showSlot,
  selected,
  highlight,
  outOfPosition,
  onClick,
}: {
  player: RosterPlayer;
  slotLabel?: string;
  /** Role used for weighted rating (formation slot). Falls back to slotLabel then primary position. */
  ratingRole?: string;
  showSlot?: boolean;
  selected?: boolean;
  highlight?: boolean;
  outOfPosition?: boolean;
  onClick?: () => void;
}) {
  const { t } = useTranslation();
  const scorePos = ratingRole ?? slotLabel ?? player.positions[0] ?? "CM";
  const avg = Player.weightedScore(player.stats, scorePos);
  const energy = player.seasonLog?.fitness ?? 100;
  const badgePos =
    showSlot && slotLabel
      ? slotLabel
      : ratingRole != null && !slotLabel
        ? (player.positions[0] ?? "CM")
        : (slotLabel ?? player.positions[0] ?? "CM");
  const mainRole = getMainRole(badgePos);
  const textColor = ROLE_BADGE_COLORS[mainRole] ?? "text-muted-foreground";

  return (
    <div
      className={`flex items-center gap-2 ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      {(showSlot && slotLabel) ? (
        <div className="flex items-center justify-center shrink-0">
          <span className={`text-[9px] font-black uppercase tracking-wider ${textColor}`}>
            {MAIN_ROLE_ABBR[mainRole]}
          </span>
        </div>
      ) : (
        <div className="shrink-0">
          <span className={`text-[9px] font-black uppercase tracking-wider ${textColor}`}>
            {MAIN_ROLE_ABBR[mainRole]}
          </span>
        </div>
      )}
      <div className={`flex-1 flex items-center gap-3 p-2 rounded-lg border transition-colors ${
        highlight
          ? "bg-primary/10 border-primary/40 hover:bg-primary/20"
          : selected
          ? "bg-primary/20 border-primary/50"
          : outOfPosition
          ? "bg-amber-500/10 border-amber-500/40"
          : "bg-secondary/30 border-border/30"
      }`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-semibold text-sm text-foreground truncate m-0">{player.name}</p>
            {outOfPosition && (
              <span title={t("formations.outOfPosition")}>
                <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" aria-hidden />
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[10px] mt-0.5">
            <div className="flex items-center gap-1">
              <Star className="w-3 h-3 text-muted-foreground" />
              <span className={`font-bold ${ratingTextClass10(avg)}`}>{avg.toFixed(1)}</span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Zap className="w-3 h-3" />
              <span>{Math.round(energy)}%</span>
            </div>
          </div>
        </div>
        <div className="w-12 shrink-0">
          <div className="h-1.5 bg-background/50 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${getEnergyColor(energy)}`}
              style={{ width: `${energy}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function FormationPitch({
  slots,
  formationId,
  players,
  selectedSlotIdx,
  onSlotClick,
  getOutOfPosition,
}: {
  slots: FormationSlot[];
  formationId: string;
  /** One entry per slot index; undefined = empty slot. */
  players: (RosterPlayer | undefined)[];
  selectedSlotIdx: number | null;
  onSlotClick: (slotIdx: number) => void;
  getOutOfPosition?: (player: RosterPlayer, slotRole: string) => boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="card-arcade rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-bold text-sm uppercase tracking-wider text-primary">
          {t("formations.preview")} — {formationId}
        </h3>
        <span className="text-xs text-muted-foreground">
          {t("formations.clickPositionHint")}
        </span>
      </div>

      {/* Field layer is clipped; markers sit outside so hover cards are not cut off */}
      <div className="relative w-full aspect-[3/4] rounded-xl border border-emerald-800/50">
        <div className="absolute inset-0 rounded-xl overflow-hidden bg-gradient-to-b from-emerald-900/40 to-emerald-950/60">
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <rect x="5" y="5" width="90" height="90" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
            <line x1="5" y1="50" x2="95" y2="50" stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
            <circle cx="50" cy="50" r="12" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
            <circle cx="50" cy="50" r="0.8" fill="rgba(255,255,255,0.3)" />
            <rect x="25" y="5" width="50" height="18" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
            <rect x="35" y="5" width="30" height="8" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
            <rect x="25" y="77" width="50" height="18" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
            <rect x="35" y="87" width="30" height="8" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
          </svg>
        </div>

        {slots.map((slot, i) => {
          const topPct = 100 - slot.y;
          const player = players[i];
          const isSelected = selectedSlotIdx === i;
          const oop = player && getOutOfPosition ? getOutOfPosition(player, slot.role) : false;
          const avg = player ? Player.weightedScore(player.stats, slot.role ?? player.positions[0] ?? "CM") : 0;
          const energy = player?.seasonLog?.fitness ?? 100;
          const tipAlign =
            slot.x < 38 ? "left" : slot.x > 62 ? "right" : "center";
          const tipPanelPos =
            tipAlign === "left"
              ? "left-0 translate-x-0"
              : tipAlign === "right"
                ? "right-0 left-auto translate-x-0"
                : "left-1/2 -translate-x-1/2";
          const tipArrowPos =
            tipAlign === "left"
              ? "left-6 -translate-x-1/2"
              : tipAlign === "right"
                ? "right-6 -translate-x-1/2"
                : "left-1/2 -translate-x-1/2";

          return (
            <div
              key={`${slot.role}-${i}`}
              className={`absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-200 group ${
                isSelected ? "scale-110 z-20" : "hover:scale-105 z-10 hover:z-[100]"
              }`}
              style={{ left: `${slot.x}%`, top: `${topPct}%` }}
            >
              <button
                onClick={() => onSlotClick(i)}
                className={`w-12 h-12 rounded-full flex flex-col items-center justify-center transition-all duration-200 cursor-pointer border-0 ${
                  isSelected
                    ? "bg-primary ring-2 ring-primary ring-offset-2 ring-offset-background glow-primary"
                    : "bg-primary/80 hover:bg-primary border-2 border-primary/50"
                }`}
              >
                <span className="text-[10px] font-bold text-primary-foreground uppercase">
                  {slot.role.length <= 3 ? slot.role : slot.role.slice(0, 2)}
                </span>
              </button>

              {oop && !isSelected && (
                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-400 flex items-center justify-center pointer-events-none">
                  <AlertTriangle className="w-2.5 h-2.5 text-amber-900" />
                </div>
              )}

              {player && (
                <>
                  <div className={`absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold px-2 py-0.5 rounded ${
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : oop
                      ? "bg-amber-500/20 text-amber-300"
                      : "bg-background/80 text-foreground"
                  }`}>
                    {player.name.split(" ").pop()}
                  </div>

                  <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                    <div
                      className={`absolute z-[100] bottom-full mb-2 w-48 p-3 rounded-xl bg-card border shadow-xl ${oop ? "border-amber-500/40" : "border-border"} ${tipPanelPos}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-foreground text-xs">{player.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${oop ? "bg-amber-500/20 text-amber-400" : "bg-primary/20 text-primary"}`}>
                          {player.positions[0]}
                        </span>
                      </div>
                      {oop && (
                        <div className="flex items-center gap-1 mb-2 text-[10px] text-amber-400">
                          <AlertTriangle className="w-3 h-3" />
                          <span>
                            {t("formations.outOfPositionPrimary", {
                              position: player.positions[0] ?? "—",
                              role: MAIN_ROLE_ABBR[getMainRole(player.positions[0] ?? "CM")],
                            })}
                          </span>
                        </div>
                      )}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Star className="w-3 h-3" />
                            <span>{t("formations.rating")}</span>
                          </div>
                          <span className={`font-bold text-sm ${ratingTextClass10(avg)}`}>{avg.toFixed(1)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Zap className="w-3 h-3" />
                            <span>{t("formations.energy")}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${getEnergyColor(energy)}`} style={{ width: `${energy}%` }} />
                            </div>
                            <span className="font-bold text-xs text-foreground">{Math.round(energy)}%</span>
                          </div>
                        </div>
                      </div>
                      <div
                        className={`absolute -bottom-2 w-4 h-4 bg-card border-r border-b rotate-45 ${oop ? "border-amber-500/40" : "border-border"} ${tipArrowPos}`}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
