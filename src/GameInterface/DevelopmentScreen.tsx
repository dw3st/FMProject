import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PageHeadline } from "@/GameInterface/Components/PageHeadline";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { PlayerProfile, getAgePhaseDisplay } from "@/GameInterface/Development/PlayerProfile";
import { AttributesPanel } from "@/GameInterface/Development/AttributesPanel";
import { PlayerSelector } from "@/GameInterface/Development/PlayerSelector";
import { RecentTrend } from "@/GameInterface/Development/RecentTrend";
import { DevelopmentExplanation } from "@/GameInterface/Development/DevelopmentExplanation";
import { DevelopmentWarnings } from "@/GameInterface/Development/DevelopmentWarnings";
import { DevelopmentTrainingConfig } from "@/GameInterface/Development/DevelopmentTrainingConfig";
import { ATTRIBUTE_LABELS } from "@/GameInterface/AttributeLabels";
import type { AttributeId } from "@/GameInterface/AttributeLabels";
import type { Squad, RosterPlayer, DevelopmentProgress } from "@/types/playerTypes";
import ROLES from "@/Data/roles.json";
import type { AgePhase, DevStatus } from "@/GameInterface/Development/PlayerProfile";
import type { DevAttribute, AttrFocus } from "@/GameInterface/Development/AttributesPanel";
import type { PlayerOption } from "@/GameInterface/Development/PlayerSelector";
import type { TrendDirection } from "@/GameInterface/Development/RecentTrend";
import { roleForDevelopmentWeights } from "@/GameInterface/positionHelpers";

function getAgePhase(age: number): AgePhase {
  if (age <= 23) return "developing";
  if (age <= 27) return "approachingPeak";
  if (age <= 31) return "atPeak";
  return "declining";
}

function getDevStatus(age: number, progress: DevelopmentProgress | undefined): DevStatus {
  if (!progress) return "stable";
  const total = Object.values(progress).reduce((a, b) => a + b, 0);
  if (age >= 32) return "declining";
  if (getAgePhase(age) === "atPeak") return "stable";
  if (total > 50) return "improving";
  return "stable";
}

const ALL_ATTR_IDS: AttributeId[] = [
  "passing", "vision", "finishing", "dribbling",
  "speed", "acceleration", "tackling", "pressing",
  "stamina", "strength",
  "reflex", "jump",
];

type RolesType = Record<string, { attrWeights?: Record<string, number> }>;

function getVisibleAttrs(position: string): AttributeId[] {
  const weights = (ROLES as RolesType)[position]?.attrWeights ?? {};
  return ALL_ATTR_IDS.filter((id) => (weights[id] ?? 0) > 0);
}

function getAttrFocus(attrId: AttributeId, position: string): AttrFocus {
  const w = (ROLES as RolesType)[position]?.attrWeights?.[attrId] ?? 0;
  if (w >= 0.8) return "primary";
  if (w >= 0.5) return "secondary";
  return "limited";
}

function getAttrDirection(
  age: number,
  progress: DevelopmentProgress | undefined,
  stat: AttributeId,
): TrendDirection {
  if (!progress) return "stable";
  const dp = progress[stat as keyof DevelopmentProgress] ?? 0;
  if (getAgePhase(age) === "atPeak") {
    if (dp < -2) return "down";
    return "stable";
  }
  if (dp > 5) return "up";
  if (dp < -2) return "down";
  return "stable";
}

// Mirrors PlayerDevelopment.ts dpRequired formula (BASE_COST=10, SCALE=0.10)
function dpRequired(value: number): number {
  return 10 * (1 + value * value * 0.10);
}

function buildDevAttributes(player: RosterPlayer): DevAttribute[] {
  const pos = roleForDevelopmentWeights(player.positions ?? []);
  const stats = player.stats as unknown as Record<string, number>;
  const attrIds = getVisibleAttrs(pos);
  return attrIds.map((id) => {
    const value = stats[id] ?? 0;
    const dp    = player.progress?.[id as keyof DevelopmentProgress];
    const progressPct = dp !== undefined ? Math.max(0, dp) / dpRequired(value) : undefined;
    return {
      name: ATTRIBUTE_LABELS[id].label,
      value,
      direction: getAttrDirection(player.age, player.progress, id),
      focus: getAttrFocus(id, pos),
      progressPct,
    };
  });
}

function buildRoleFocus(player: RosterPlayer): { primary: string[]; secondary: string[]; limited: string[] } {
  const pos = roleForDevelopmentWeights(player.positions ?? []);
  const visible = getVisibleAttrs(pos);
  const primary: string[] = [];
  const secondary: string[] = [];
  const limited: string[] = [];
  for (const id of visible) {
    const focus = getAttrFocus(id, pos);
    if (focus === "primary") primary.push(ATTRIBUTE_LABELS[id].label);
    else if (focus === "secondary") secondary.push(ATTRIBUTE_LABELS[id].label);
    else limited.push(ATTRIBUTE_LABELS[id].label);
  }
  return { primary, secondary, limited };
}

function buildExplanation(player: RosterPlayer): string {
  const phase = getAgePhase(player.age);
  const status = getDevStatus(player.age, player.progress);

  if (phase === "developing" && status === "improving")
    return "Young and developing well. Regular playing time and good form are accelerating growth in key areas.";
  if (phase === "developing")
    return "Still in the development phase. Needs consistent match time and good performances to continue progressing.";
  if (phase === "approachingPeak")
    return "Approaching peak years with continued improvement potential in key areas.";
  if (phase === "atPeak")
    return "At peak age, maintaining level through consistent performances. Mental attributes can still grow.";
  if (status === "declining")
    return "Age-related physical decline is affecting this player. Mental and technical attributes remain more stable.";
  return "Development is progressing as expected for this player's age and role.";
}

/** Returns stable warning codes; UI translates them through `warnings.development.<code>`. */
function buildWarnings(player: RosterPlayer): string[] {
  const warnings: string[] = [];
  if (player.age >= 32) warnings.push("ageDecline");
  if (player.age >= 34) warnings.push("reduceLoad");
  const log = player.seasonLog;
  if (log && log.morale < 40) warnings.push("lowMorale");
  if (log && log.fitness < 50) warnings.push("poorFitness");
  if (log && log.appearances === 0) warnings.push("noMatchTime");
  return warnings;
}

function buildRecentForm(player: RosterPlayer): TrendDirection[] {
  const status = getDevStatus(player.age, player.progress);
  if (status === "improving") return ["up", "up", "stable", "up", "up"];
  if (status === "declining") return ["down", "stable", "down", "down", "stable"];
  return ["stable", "up", "stable", "stable", "stable"];
}

export function DevelopmentScreen() {
  const { t } = useTranslation();
  const { squad, loading: saveLoading, session } = useGameSave();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");

  useEffect(() => {
    if (!saveLoading && !session) {
      window.location.href = "/new-game";
    }
  }, [saveLoading, session]);

  useEffect(() => {
    if (squad && squad.players.length > 0 && !selectedPlayerId) {
      setSelectedPlayerId(squad.players[0]!.id);
    }
  }, [squad, selectedPlayerId]);

  const player = useMemo(() => squad?.players.find((p) => p.id === selectedPlayerId) ?? null, [squad, selectedPlayerId]);

  const playerOptions = useMemo((): PlayerOption[] => {
    if (!squad) return [];
    return squad.players.map((p) => ({
      id:       p.id,
      name:     p.name,
      position: p.positions[0] ?? "—",
      agePhase: getAgePhase(p.age),
    }));
  }, [squad]);

  if (saveLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">{t("developmentScreen.loading")}</p>
      </div>
    );
  }

  if (!squad || !player) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">{t("developmentScreen.noSquadData")}</p>
      </div>
    );
  }

  const agePhase = getAgePhase(player.age);
  const devStatus = getDevStatus(player.age, player.progress);
  const attributes = buildDevAttributes(player);
  const roleFocus = buildRoleFocus(player);
  const explanation = buildExplanation(player);
  const warnings = buildWarnings(player);
  const recentForm = buildRecentForm(player);

  return (
    <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          <PageHeadline backHref="/dashboard">
            {t("developmentScreen.playerDevelopment")}
          </PageHeadline>

          <DevelopmentTrainingConfig />

          <div className="flex flex-col xl:flex-row gap-6 xl:items-start">
            <div className="flex-1 min-w-0 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-6">
                  <PlayerProfile
                    player={{
                      name: player.name,
                      age: player.age,
                      role: player.positions[0] || "Player",
                      agePhase,
                      developmentStatus: devStatus,
                    }}
                  />
                  <RecentTrend trend={recentForm} />
                  <DevelopmentWarnings warnings={warnings} />
                </div>

                <div className="lg:col-span-2 space-y-6">
                  <AttributesPanel attributes={attributes} />
                  <DevelopmentExplanation explanation={explanation} roleFocus={roleFocus} />
                </div>
              </div>
            </div>

            <aside className="w-full xl:w-[min(100%,20.5rem)]">
              <PlayerSelector
                players={playerOptions}
                selectedId={selectedPlayerId}
                onSelect={setSelectedPlayerId}
              />
            </aside>
          </div>
        </div>
    </main>
  );
}
