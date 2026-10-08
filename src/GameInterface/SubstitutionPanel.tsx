import { shirtName } from "@/Domain/shirtName";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { GameState, PendingSub } from "@/GameEngine/types";
import { FORMATION_IDS } from "@/Domain/matchFormations";
import { ratingTextClass10 } from "@/GameInterface/scoreColors";
import { Icon } from "@/GameInterface/Icons";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { Chip } from "@/GameInterface/ui/Chip";
import { SlotInstructionChips, useInstructionShort } from "@/GameInterface/Components/SlotInstructionChips";
import { ManMarkingPanel } from "@/GameInterface/Components/ManMarkingPanel";
import { SubsPitchView, averageRating, displayRating10 } from "@/GameInterface/Components/SubsPitchView";
import type { SlotInstruction } from "@/types/tacticsTypes";
import { LiveTacticsPanel } from "@/GameInterface/Components/LiveTacticsPanel";
import type { ComponentProps } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SubstitutionPanelProps {
  gameState: GameState;
  playerTeam: "A";
  /** Live match ratings (0–10) keyed by engine player id — from PlayerRating. */
  ratings?: Record<number, number>;
  onQueueSub: (sub: PendingSub) => void;
  /** Two starters swap positions on the pitch (no substitution used, #115). */
  onSwapPositions?: (aId: number, bId: number) => void;
  /** Live formation change; absent hides the Formation tab (`/test` has its own selector). */
  onChangeFormation?: (formationId: string) => void;
  /** Live slot instruction change (player instructions) — this match only. */
  onInstruction?: (slot: number, instruction: SlotInstruction | null) => void;
  /** Live man-marking (engine ids of opponents on the pitch). */
  onManMarks?: (marks: { markerSlot: number; targetId: number }[]) => void;
  /** Live tactical style and axes (Etapa 35) — this match only. */
  liveTactics?: ComponentProps<typeof LiveTacticsPanel>;
  onClose: () => void;
}

const FORMATION_LIST = [...FORMATION_IDS];

// ── Component ─────────────────────────────────────────────────────────────────

export function SubstitutionPanel({
  gameState,
  playerTeam,
  ratings,
  onQueueSub,
  onSwapPositions,
  onChangeFormation,
  onInstruction,
  onManMarks,
  liveTactics,
  onClose,
}: SubstitutionPanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"subs" | "formation" | "tactics" | "instructions">("subs");
  const [instrSlot, setInstrSlot] = useState<number | null>(null);
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

  const queuedInIds = new Set(pendingQueue.map((s) => s.inId));
  const availableBench = bench.filter((p) => !queuedInIds.has(p.id));

  const xiAvg = averageRating(onPitch, ratings);
  const benchAvg = averageRating(availableBench, ratings);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3">
      <div className="bg-card border border-border rounded-md w-[80vw] h-[80vh] max-w-[calc(100vw-1.5rem)] max-h-[calc(100vh-1.5rem)] flex flex-col overflow-hidden">

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
          {activeTab === "subs" && (
            <SubsPitchView
              gameState={gameState}
              playerTeam={playerTeam}
              ratings={ratings}
              onQueueSub={onQueueSub}
              onSwapPositions={onSwapPositions}
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
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {FORMATION_LIST.map((fid) => {
                  const isActive = fid === currentFormationId;
                  return (
                    <Chip key={fid} selected={isActive} onClick={() => onChangeFormation(fid)} className="py-2.5 tabular-nums">
                      {fid}
                    </Chip>
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
            className="w-full py-2.5 rounded-md bg-secondary/60 border border-border hover:border-primary/40 text-sm font-bold text-foreground transition-colors cursor-pointer"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
