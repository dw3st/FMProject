import type { Formation } from "@/GameEngine/types";
import { shirtName } from "@/Domain/shirtName";
import type { RosterPlayer } from "@/types/playerTypes";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { GameState, PendingSub, TeamId } from "@/GameEngine/types";
import { FORMATION_IDS, formationForSimId } from "@/Domain/matchFormations";
import { ratingTextClass10 } from "@/GameInterface/scoreColors";
import { Icon } from "@/GameInterface/Icons";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { Chip } from "@/GameInterface/ui/Chip";
import { SlotInstructionChips, useInstructionShort } from "@/GameInterface/Components/SlotInstructionChips";
import { ManMarkingPanel } from "@/GameInterface/Components/ManMarkingPanel";
import { SubsPitchView, averageRating, displayRating10 } from "@/GameInterface/Components/SubsPitchView";
import type { SlotInstruction } from "@/types/tacticsTypes";
import { FormationPreview } from "@/GameInterface/Components/FormationPreview";
import { Button } from "@/GameInterface/ui/Button";
import { LiveTacticsPanel } from "@/GameInterface/Components/LiveTacticsPanel";
import { InjuryVacancyPanel } from "@/GameInterface/Components/InjuryVacancyPanel";
import type { ComponentProps } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SubstitutionPanelProps {
  gameState: GameState;
  playerTeam: TeamId;
  /** Live match ratings (0–10) keyed by engine player id — from PlayerRating. */
  ratings?: Record<number, number>;
  onQueueSub: (sub: PendingSub) => void;
  /** Takes a queued substitution back (by the player going off); absent hides the undo buttons. */
  onUnqueueSub?: (outId: number) => void;
  /** Two starters swap positions on the pitch (no substitution used, #115). */
  onSwapPositions?: (aId: number, bId: number) => void;
  /** A starter moves to an empty slot (after a red card or an injury). */
  onMoveToSlot?: (id: number, slot: number) => void;
  /** A bench player takes the slot an injured player left (#140, manual injury substitutions). */
  onFillVacancy?: (injuredId: number, inId: number) => void;
  /** Live formation change; absent hides the Formation tab (`/test` has its own selector). */
  onChangeFormation?: (formationId: string) => void;
  /** The manager's own formations (saved free formation, saved lineups) offered next to the ready ones (tester report, 8.9.37). */
  userFormations?: UserFormation[];
  /** Live slot instruction change (player instructions) — this match only. */
  onInstruction?: (slot: number, instruction: SlotInstruction | null) => void;
  /** Live man-marking (engine ids of opponents on the pitch). */
  onManMarks?: (marks: { markerSlot: number; targetId: number }[]) => void;
  /** Live tactical style and axes (Etapa 35) — this match only. */
  liveTactics?: ComponentProps<typeof LiveTacticsPanel>;
  /** Face URL per roster id of this side's players (the match's faces); absent = initials on the mini pitch. */
  faceUrls?: Record<string, string>;
  /** The club's squad, for the hover card of the mini pitch and the bench. */
  roster?: RosterPlayer[];
  onClose: () => void;
}

const FORMATION_LIST = [...FORMATION_IDS];

/** A formation the manager made: his saved free formation or one of his saved lineups. */
export interface UserFormation { id: string; label: string; formation: Formation }

// ── Component ─────────────────────────────────────────────────────────────────

export function SubstitutionPanel({
  gameState,
  playerTeam,
  ratings,
  onQueueSub,
  onUnqueueSub,
  onSwapPositions,
  onMoveToSlot,
  onFillVacancy,
  onChangeFormation,
  userFormations = [],
  onInstruction,
  onManMarks,
  liveTactics,
  faceUrls,
  roster,
  onClose,
}: SubstitutionPanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"subs" | "formation" | "tactics" | "instructions">("subs");
  const [instrSlot, setInstrSlot] = useState<number | null>(null);
  /** The formation being looked at in the Formation tab; null = the current one. */
  const [previewFormation, setPreviewFormation] = useState<string | null>(null);
  const instructionShort = useInstructionShort();

  const subsRemaining =
    playerTeam === "A" ? gameState.subsRemainingA : gameState.subsRemainingB;
  const pendingQueue =
    playerTeam === "A" ? gameState.pendingSubsA : gameState.pendingSubsB;
  const pendingCount = pendingQueue.length;

  const bench = playerTeam === "A" ? gameState.benchA : gameState.benchB;
  const onPitch = gameState.players
    .filter((p) => p.team === playerTeam)
    .sort((a, b) => a.slotIndex - b.slotIndex);

  const currentFormationId =
    playerTeam === "A" ? gameState.formationA.id : gameState.formationB.id;
  const shownFormation = previewFormation ?? currentFormationId;
  const userFormation = (id: string) => userFormations.find((u) => u.id === id);
  const formationLabel = (id: string) => userFormation(id)?.label ?? id;

  const queuedInIds = new Set(pendingQueue.map((s) => s.inId));
  const availableBench = bench.filter((p) => !queuedInIds.has(p.id));

  const xiAvg = averageRating(onPitch, ratings);
  const benchAvg = averageRating(availableBench, ratings);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3">
      <div className="bg-card border border-border rounded-md w-[min(80vw,72rem)] h-[90vh] max-w-[calc(100vw-1.5rem)] max-h-[calc(100vh-1.5rem)] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <Icon name="arrow-right-left" className="w-5 h-5 text-primary" />
            <h2 className="font-display font-black uppercase text-xl leading-none m-0">
              {t("substitutionPanel.title")}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-sm font-bold tabular-nums text-muted-foreground">
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
              <span className="text-sm font-bold text-chart-4 bg-chart-4/10 border border-chart-4/30 px-2 py-1 rounded-full">
                {t("substitutionPanel.pending", { count: pendingCount })}
              </span>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <Icon name="close" className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 py-2 border-b border-border shrink-0">
          <SegmentedTabs
            tabs={[
              { key: "subs", label: t("substitutionPanel.playerSwap") },
              ...(onChangeFormation ? [{ key: "formation" as const, label: t("substitutionPanel.formation") }] : []),
              ...(liveTactics ? [{ key: "tactics" as const, label: t("substitutionPanel.tabTactics") }] : []),
              ...(onInstruction ? [{ key: "instructions" as const, label: t("substitutionPanel.tabInstructions") }] : []),
            ]}
            active={activeTab}
            onChange={setActiveTab}
          />
        </div>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {activeTab === "subs" && onFillVacancy && (
            <InjuryVacancyPanel
              vacancies={gameState.injuryVacancies?.[playerTeam] ?? []}
              bench={availableBench}
              ratings={ratings}
              canSub={subsRemaining > 0}
              onFill={onFillVacancy}
            />
          )}
          {/* Always there, one line high: queueing a change never moves the pitch below (tester report). */}
          {activeTab === "subs" && (
            <div className="px-4 h-14 border-b border-border flex items-center gap-4 shrink-0">
              <div className="shrink-0 font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
                {t("substitutionPanel.queuedTitle")}
              </div>
              {pendingQueue.length === 0 && <span className="text-sm text-muted-foreground">{t("substitutionPanel.queuedEmpty")}</span>}
              <ul className="m-0 p-0 list-none flex-1 min-w-0 flex gap-2 overflow-x-auto">
                {pendingQueue.map((s) => {
                  const out = onPitch.find((p) => p.id === s.outId);
                  const inn = bench.find((p) => p.id === s.inId);
                  return (
                    <li key={s.outId} className="shrink-0 flex items-center gap-2 rounded-md border border-border bg-secondary/20 pl-3 pr-1 py-1 text-sm">
                      <span className="text-destructive">{out ? shirtName(out.name) : "?"}</span>
                      <Icon name="arrow-right-left" className="w-4 h-4 text-muted-foreground" />
                      <span className="text-primary">{inn ? shirtName(inn.name) : "?"}</span>
                      {onUnqueueSub && (
                        <button
                          type="button"
                          onClick={() => onUnqueueSub(s.outId)}
                          className="h-8 px-2 rounded text-sm font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          {t("substitutionPanel.undo")}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {activeTab === "subs" && (
            <SubsPitchView
              gameState={gameState}
              playerTeam={playerTeam}
              ratings={ratings}
              onQueueSub={onQueueSub}
              onSwapPositions={onSwapPositions}
              {...(onMoveToSlot ? { onMoveToSlot } : {})}
              faceUrls={faceUrls}
              {...(roster ? { roster } : {})}
            />
          )}

          {activeTab === "tactics" && liveTactics && <LiveTacticsPanel {...liveTactics} />}

          {activeTab === "instructions" && onInstruction && (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
              <p className="text-sm text-muted-foreground m-0">{t("instructions.liveOnly")}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {onPitch.map((p) => {
                  const instr = p.instruction;
                  const tag = instructionShort(instr);
                  return (
                    <Chip
                      key={p.id}
                      selected={instrSlot === p.slotIndex}
                      onClick={() => setInstrSlot(p.slotIndex)}
                      className="py-2"
                    >
                      {p.role} · {shirtName(p.name)}{tag ? ` · ${tag}` : ""}{instr?.press && instr.press !== "normal" ? ` · ${t(`instructions.press.${instr.press}`)}` : ""}
                    </Chip>
                  );
                })}
              </div>
              {instrSlot !== null && (() => {
                const p = onPitch.find((q) => q.slotIndex === instrSlot);
                if (!p) return null;
                return (
                  <SlotInstructionChips
                    role={p.role}
                    instruction={p.instruction}
                    onChange={(next) => onInstruction(instrSlot, next)}
                  />
                );
              })()}
              {onManMarks && (
                <ManMarkingPanel
                  markers={onPitch.filter((p) => p.role !== "GK").map((p) => ({ value: String(p.slotIndex), label: `${p.role} · ${p.name}` }))}
                  targets={gameState.players
                    .filter((p) => p.team !== playerTeam && p.role !== "GK")
                    .map((p) => ({ value: String(p.id), label: `${p.role} · ${p.name}`, overall: displayRating10(p) }))}
                  value={(gameState.manMarks?.[playerTeam] ?? []).map((m) => ({ slot: m.markerSlot, targetId: String(m.targetId) }))}
                  onChange={(next) => onManMarks(next.map((m) => ({ markerSlot: m.slot, targetId: Number(m.targetId) })))}
                />
              )}
            </div>
          )}

          {activeTab === "formation" && onChangeFormation && (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
              <p className="text-sm text-muted-foreground m-0">
                {t("substitutionPanel.changeFormationHint")}
              </p>
              <div className="flex flex-col md:flex-row gap-5 items-start justify-center">
                <div className="flex flex-col gap-3 w-full md:w-72 shrink-0">
                  {userFormations.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t("substitutionPanel.myFormations")}</span>
                      <div className="flex flex-wrap gap-2">
                        {userFormations.map((u) => (
                          <Chip key={u.id} selected={u.id === shownFormation} onClick={() => setPreviewFormation(u.id)} className="py-2.5">
                            {u.label}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    {FORMATION_LIST.map((fid) => (
                      <Chip key={fid} selected={fid === shownFormation} onClick={() => setPreviewFormation(fid)} className="py-2.5 tabular-nums">
                        {fid}
                      </Chip>
                    ))}
                  </div>
                  <Button
                    disabled={shownFormation === currentFormationId}
                    onClick={() => { onChangeFormation(shownFormation); setPreviewFormation(null); }}
                  >
                    {shownFormation === currentFormationId
                      ? t("substitutionPanel.currentFormation")
                      : t("substitutionPanel.useFormation", { formation: formationLabel(shownFormation) })}
                  </Button>
                </div>
                <FormationPreview
                  players={gameState.players.filter((p) => p.team === playerTeam).sort((x, y) => x.slotIndex - y.slotIndex)}
                  formation={shownFormation === currentFormationId
                    ? (playerTeam === "A" ? gameState.formationA : gameState.formationB)
                    : userFormation(shownFormation)?.formation ?? formationForSimId(shownFormation)}
                  current={playerTeam === "A" ? gameState.formationA : gameState.formationB}
                  blocked={(gameState.injuryVacancies?.[playerTeam] ?? []).map((v) => v.slotIndex)}
                  {...(faceUrls ? { faceUrls } : {})}
                />
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-md bg-secondary/60 border border-border hover:border-primary/40 text-sm font-bold text-foreground transition-colors cursor-pointer"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
