import type { Formation } from "@/GameEngine/types";
import { shirtName } from "@/Domain/shirtName";
import type { RosterPlayer } from "@/types/playerTypes";
import { useState, type ComponentProps } from "react";
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
import type { CustomFormation, SlotInstruction } from "@/types/tacticsTypes";
import { FormationPreview } from "@/GameInterface/Components/FormationPreview";
import { Button } from "@/GameInterface/ui/Button";
import { LiveTacticsPanel } from "@/GameInterface/Components/LiveTacticsPanel";
import { InjuryVacancyPanel } from "@/GameInterface/Components/InjuryVacancyPanel";
import { Modal } from "@/GameInterface/Components/Modal";
import { PanelBlock, PanelColumns } from "@/GameInterface/Components/SubsPanelLayout";
import { overallAvg } from "@/Domain/playerRating";
import { attrDisplay } from "@/Domain/attributes";

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
  /** Tab the panel opens on (the in-match assistant's advice). Absent = player swap. */
  initialTab?: "subs" | "formation" | "tactics" | "instructions";
  /** Live formation change; absent hides the Formation tab (`/test` has its own selector). */
  onChangeFormation?: (formationId: string) => void;
  /** The manager's own formations (saved free formation, saved lineups) offered next to the ready ones (tester report, 8.9.37). */
  userFormations?: UserFormation[];
  /** Live slot instruction change (player instructions) — this match only. */
  onInstruction?: (slot: number, instruction: SlotInstruction | null) => void;
  /** Live man-marking (engine ids of opponents on the pitch). */
  onManMarks?: (marks: { markerSlot: number; targetId: number }[]) => void;
  /** Live tactical style and axes (Etapa 35) — this match only. */
  liveTactics?: Omit<ComponentProps<typeof LiveTacticsPanel>, "pitch">;
  /** Face URL per roster id of this side's players (the match's faces); absent = initials on the mini pitch. */
  faceUrls?: Record<string, string>;
  /** The club's squad, for the hover card of the mini pitch and the bench. */
  roster?: RosterPlayer[];
  onClose: () => void;
}

const FORMATION_LIST = [...FORMATION_IDS];

/** A formation the manager made: his saved free formation or one of his saved lineups. */
export interface UserFormation {
  id: string;
  label: string;
  formation: Formation;
  /** The free formation's slots, sent to the server in a match between two managers. */
  custom?: CustomFormation;
  /** The ready-made formation a saved line-up uses. */
  readyId?: string;
}

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
  initialTab,
}: SubstitutionPanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"subs" | "formation" | "tactics" | "instructions">(initialTab ?? "subs");
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
  const currentFormation = playerTeam === "A" ? gameState.formationA : gameState.formationB;
  // The same mini pitch on every tab (report 2026-11-16, option A): the XI where it plays now.
  const currentPreviewProps = {
    players: gameState.players.filter((p) => p.team === playerTeam).sort((x, y) => x.slotIndex - y.slotIndex),
    formation: currentFormation,
    current: currentFormation,
    blocked: (gameState.injuryVacancies?.[playerTeam] ?? []).map((v) => v.slotIndex),
    ...(ratings ? { ratings } : {}),
    ...(faceUrls ? { faceUrls } : {}),
  };
  const currentPitch = <FormationPreview {...currentPreviewProps} />;

  const queuedInIds = new Set(pendingQueue.map((s) => s.inId));
  const availableBench = bench.filter((p) => !queuedInIds.has(p.id));

  const xiAvg = averageRating(onPitch, ratings);
  // The bench by OVR (0-100, as everywhere), not a raw 0-10 estimate from engine stats (tester report).
  const benchOvrs = availableBench
    .map((p) => roster?.find((r) => r.id === p.rosterId))
    .filter((r): r is RosterPlayer => r !== undefined)
    .map((r) => overallAvg(r));
  const benchAvg = benchOvrs.length > 0 ? benchOvrs.reduce((a, b) => a + b, 0) / benchOvrs.length : null;
  const instrPlayer = instrSlot !== null ? onPitch.find((q) => q.slotIndex === instrSlot) : undefined;
  const instrTag = instrPlayer ? instructionShort(instrPlayer.instruction) : null;

  return (
    <Modal open onClose={onClose} size="wide" panelClassName="h-[90vh] max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden">
      {/* Header: title and close; tabs with one line of numbers below. */}
      <div className="shrink-0 px-6 pt-5 pb-4 border-b border-border flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display font-black uppercase text-xl leading-none m-0 flex items-center gap-2">
            <Icon name="arrow-right-left" size={20} className="text-primary" />
            {t("substitutionPanel.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            title={t("common.close")}
            className="w-10 h-10 inline-flex items-center justify-center rounded-md border border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-primary/40 cursor-pointer"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <SegmentedTabs
          aria-label={t("substitutionPanel.title")}
          tabs={[
            { key: "subs", label: t("substitutionPanel.playerSwap") },
            ...(onChangeFormation ? [{ key: "formation" as const, label: t("substitutionPanel.formation") }] : []),
            ...(liveTactics ? [{ key: "tactics" as const, label: t("substitutionPanel.tabTactics") }] : []),
            ...(onInstruction ? [{ key: "instructions" as const, label: t("substitutionPanel.tabInstructions") }] : []),
          ]}
          active={activeTab}
          onChange={setActiveTab}
        />
        <p className="m-0 text-sm tabular-nums text-muted-foreground">
          {t("substitutionPanel.xiAvg")} <span className={`font-semibold ${ratingTextClass10(xiAvg)}`}>{xiAvg.toFixed(1)}</span>
          <span className="mx-2 text-border">·</span>
          {benchAvg !== null && (
            <>
              {t("substitutionPanel.benchAvg")} <span className={`font-semibold ${ratingTextClass10(benchAvg)}`}>{attrDisplay(benchAvg)}</span>
              <span className="mx-2 text-border">·</span>
            </>
          )}
          <span className={subsRemaining - pendingCount > 0 ? "font-semibold text-primary" : ""}>
            {t("substitutionPanel.remaining", { remaining: subsRemaining - pendingCount })}
          </span>
          {pendingCount > 0 && (
            <>
              <span className="mx-2 text-border">·</span>
              <span className="font-semibold text-chart-4">{t("substitutionPanel.pending", { count: pendingCount })}</span>
            </>
          )}
        </p>
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {activeTab === "subs" && (
          <SubsPitchView
            gameState={gameState}
            playerTeam={playerTeam}
            ratings={ratings}
            onQueueSub={onQueueSub}
            onSwapPositions={onSwapPositions}
            {...(onMoveToSlot ? { onMoveToSlot } : {})}
            {...(onUnqueueSub ? { onUnqueueSub } : {})}
            faceUrls={faceUrls}
            {...(roster ? { roster } : {})}
            top={onFillVacancy ? (
              <InjuryVacancyPanel
                vacancies={gameState.injuryVacancies?.[playerTeam] ?? []}
                bench={availableBench}
                ratings={ratings}
                canSub={subsRemaining > 0}
                onFill={onFillVacancy}
              />
            ) : undefined}
          />
        )}

        {activeTab === "tactics" && liveTactics && (
          <LiveTacticsPanel {...liveTactics} pitch={currentPitch} />
        )}

        {activeTab === "instructions" && onInstruction && (
          <PanelColumns
            pitch={<FormationPreview {...currentPreviewProps} onPick={setInstrSlot} selectedSlot={instrSlot} />}
            title={instrPlayer ? (
              <>
                {instrPlayer.role} · {shirtName(instrPlayer.name)}
                {instrTag && <span className="text-primary"> · {instrTag}</span>}
              </>
            ) : t("substitutionPanel.tabInstructions")}
            hint={t("substitutionPanel.instructionsHint")}
          >
            {instrPlayer && instrSlot !== null && (
              <SlotInstructionChips
                role={instrPlayer.role}
                instruction={instrPlayer.instruction}
                onChange={(next) => onInstruction(instrSlot, next)}
              />
            )}
            {onManMarks && (
              <div className="flex flex-col gap-4 pt-6 border-t border-border">
                <div className="flex flex-col gap-2">
                  <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("instructions.marking.title")}</h3>
                  <p className="text-sm text-muted-foreground m-0">{t("substitutionPanel.markingHint")}</p>
                </div>
                <ManMarkingPanel
                  title={false}
                  markers={onPitch.filter((p) => p.role !== "GK").map((p) => ({ value: String(p.slotIndex), label: `${p.role} · ${p.name}` }))}
                  targets={gameState.players
                    .filter((p) => p.team !== playerTeam && p.role !== "GK")
                    .map((p) => ({ value: String(p.id), label: `${p.role} · ${p.name}`, overall: displayRating10(p) }))}
                  value={(gameState.manMarks?.[playerTeam] ?? []).map((m) => ({ slot: m.markerSlot, targetId: String(m.targetId) }))}
                  onChange={(next) => onManMarks(next.map((m) => ({ markerSlot: m.slot, targetId: Number(m.targetId) })))}
                />
              </div>
            )}
          </PanelColumns>
        )}

        {activeTab === "formation" && onChangeFormation && (
          <PanelColumns
            pitch={
              <FormationPreview
                {...currentPreviewProps}
                formation={shownFormation === currentFormationId
                  ? currentFormation
                  : userFormation(shownFormation)?.formation ?? formationForSimId(shownFormation)}
              />
            }
            title={t("substitutionPanel.formation")}
            hint={t("substitutionPanel.formationHint")}
            action={(
              <Button
                className="w-full"
                disabled={shownFormation === currentFormationId}
                onClick={() => { onChangeFormation(shownFormation); setPreviewFormation(null); }}
              >
                {shownFormation === currentFormationId
                  ? t("substitutionPanel.currentFormation")
                  : t("substitutionPanel.useFormation", { formation: formationLabel(shownFormation) })}
              </Button>
            )}
          >
            {userFormations.length > 0 && (
              <PanelBlock label={t("substitutionPanel.myFormations")}>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                  {userFormations.map((u) => (
                    <Chip key={u.id} selected={u.id === shownFormation} onClick={() => setPreviewFormation(u.id)} className="truncate">
                      {u.label}
                    </Chip>
                  ))}
                </div>
              </PanelBlock>
            )}
            <PanelBlock label={t("substitutionPanel.readyFormations")}>
              <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
                {FORMATION_LIST.map((fid) => (
                  <Chip key={fid} selected={fid === shownFormation} onClick={() => setPreviewFormation(fid)} className="tabular-nums">
                    {fid}
                  </Chip>
                ))}
              </div>
            </PanelBlock>
          </PanelColumns>
        )}
      </div>
    </Modal>
  );
}
