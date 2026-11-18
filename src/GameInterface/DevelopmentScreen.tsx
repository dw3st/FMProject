import { PositionPitch } from "@/GameInterface/Components/PositionPitch";
import { positionAptitudes } from "@/Domain/positions/positionAptitude";
import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ScreenTitle } from "@/GameInterface/ui/ScreenTitle";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { PlayerProfile } from "@/GameInterface/Development/PlayerProfile";
import { AttributesPanel } from "@/GameInterface/Development/AttributesPanel";
import { PlayerSelector } from "@/GameInterface/Development/PlayerSelector";
import { GrowthFactorsPanel, factorName, factorValue } from "@/GameInterface/Development/GrowthFactorsPanel";
import { DevHistoryPanel } from "@/GameInterface/Development/DevHistoryPanel";
import { SquadDevelopmentTable, type SquadDevRow } from "@/GameInterface/Development/SquadDevelopmentTable";
import { developmentFactors } from "@/Domain/development/developmentFactors";
import { ovrChange } from "@/Domain/development/devHistory";
import { potentialBand } from "@/Domain/youth/potential";
import { attrDisplay } from "@/Domain/attributes";
import { DEFAULT_TRAINING_INTENSITY, type TrainingIntensity } from "@/types/developmentTypes";
import { DevelopmentExplanation } from "@/GameInterface/Development/DevelopmentExplanation";
import { DevelopmentWarnings } from "@/GameInterface/Development/DevelopmentWarnings";
import { DevelopmentTrainingConfig } from "@/GameInterface/Development/DevelopmentTrainingConfig";
import { IndividualTrainingPanel } from "@/GameInterface/Development/IndividualTrainingPanel";
import { attributeText } from "@/GameInterface/attributeText";
import type { AttributeId } from "@/Domain/attributes";
import type { RosterPlayer, DevelopmentProgress } from "@/types/playerTypes";
import ROLES from "@/Data/roles.json";
import type { AgePhase, DevStatus } from "@/GameInterface/Development/PlayerProfile";
import type { DevAttribute, AttrFocus } from "@/GameInterface/Development/AttributesPanel";
import type { PlayerOption } from "@/GameInterface/Development/PlayerSelector";
import { positionLabel, roleForDevelopmentWeights } from "@/GameInterface/positionHelpers";
import { preferredRole } from "@/Domain/positions/positionAptitude";
import { compareSquadPositions } from "@/Domain/positions/positionSort";
import { overallAvg } from "@/Domain/playerRating";
import { dpRequired } from "@/GameEngine/PlayerDevelopment";
import { navigate } from "@/GameInterface/router/navigation";

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
  "stamina", "heading", "strength",
  "reflex", "jump",
];

const FOCUS_ORDER: Record<AttrFocus, number> = { primary: 0, secondary: 1, limited: 2 };

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

// Progress is DP toward the next 0.1 step (seeded at half a step), so the trend reads it as a fraction of the step.
function getAttrDirection(
  age: number,
  progress: DevelopmentProgress | undefined,
  stat: AttributeId,
  value: number,
): "up" | "stable" | "down" {
  if (!progress) return "stable";
  const dp = progress[stat as keyof DevelopmentProgress] ?? 0;
  if (dp < 0) return "down";
  if (getAgePhase(age) === "atPeak") return "stable";
  if (dp / dpRequired(value) > 0.5) return "up";
  return "stable";
}

function buildDevAttributes(player: RosterPlayer, nameOf: (id: string) => string): DevAttribute[] {
  const pos = roleForDevelopmentWeights(player.positions ?? []);
  const stats = player.stats as unknown as Record<string, number>;
  return ALL_ATTR_IDS.map((id) => {
    const value = stats[id] ?? 0;
    const dp    = player.progress?.[id as keyof DevelopmentProgress];
    const progressPct = dp !== undefined ? Math.max(0, dp) / dpRequired(value) : undefined;
    return {
      name: nameOf(id),
      value,
      direction: getAttrDirection(player.age, player.progress, id, value),
      focus: getAttrFocus(id, pos),
      progressPct,
    };
  }).sort((a, b) => FOCUS_ORDER[a.focus] - FOCUS_ORDER[b.focus]);
}

function buildRoleFocus(player: RosterPlayer, nameOf: (id: string) => string): { primary: string[]; secondary: string[]; limited: string[] } {
  const pos = roleForDevelopmentWeights(player.positions ?? []);
  const visible = getVisibleAttrs(pos);
  const primary: string[] = [];
  const secondary: string[] = [];
  const limited: string[] = [];
  for (const id of visible) {
    const focus = getAttrFocus(id, pos);
    if (focus === "primary") primary.push(nameOf(id));
    else if (focus === "secondary") secondary.push(nameOf(id));
    else limited.push(nameOf(id));
  }
  return { primary, secondary, limited };
}

/** Key of the development explanation (`developmentScreen.explanation.<key>`). */
function buildExplanation(player: RosterPlayer): string {
  const phase = getAgePhase(player.age);
  const status = getDevStatus(player.age, player.progress);
  if (phase === "developing" && status === "improving") return "developingImproving";
  if (phase === "developing") return "developing";
  if (phase === "approachingPeak") return "approachingPeak";
  if (phase === "atPeak") return "atPeak";
  if (status === "declining") return "declining";
  return "default";
}

/** Returns stable warning codes; UI translates them through `warnings.development.<code>`. */
function buildWarnings(player: RosterPlayer): string[] {
  const warnings: string[] = [];
  if (player.age >= 32) warnings.push("ageDecline");
  if (player.age >= 34) warnings.push("reduceLoad");
  const log = player.seasonLog;
  // Morale (`.claude/rules/game/morale.md`): an unhappy player develops slower.
  if (player.morale !== undefined && player.morale < 40) warnings.push("lowMorale");
  if (log && log.fitness < 50) warnings.push("poorFitness");
  if (log && log.appearances === 0) warnings.push("noMatchTime");
  return warnings;
}

export function DevelopmentScreen() {
  const { t } = useTranslation();
  const { squad, save, loading: saveLoading, session, refresh } = useGameSave();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");

  useEffect(() => {
    if (!saveLoading && !session) {
      navigate("/new-game");
    }
  }, [saveLoading, session]);

  const player = useMemo(() => squad?.players.find((p) => p.id === selectedPlayerId) ?? null, [squad, selectedPlayerId]);
  const intensity: TrainingIntensity = save?.training_intensity ?? session?.training_intensity ?? DEFAULT_TRAINING_INTENSITY;
  const today = save?.currentDate ?? session?.currentDate ?? "";

  const playerOptions = useMemo((): PlayerOption[] => {
    if (!squad) return [];
    // Pitch order (GK, DEF, MID, FWD, then the detailed position), best rated first inside a position.
    return squad.players
      .map((p) => ({
        option: {
          id:       p.id,
          name:     p.name,
          nationality: p.nationality,
          position: p.stats ? preferredRole(p) : (p.positions[0] ?? "—"),
          agePhase: getAgePhase(p.age),
        },
        pos:    p.positions[0] ?? "",
        rating: p.stats ? overallAvg(p) : 0,
      }))
      .sort((a, b) =>
        compareSquadPositions({ pos: a.pos, natural: a.option.position, name: "" }, { pos: b.pos, natural: b.option.position, name: "" })
        || b.rating - a.rating
        || a.option.name.localeCompare(b.option.name))
      .map((e) => e.option);
  }, [squad]);

  // The squad overview (all own players, in pitch order): OVR, 4-week change, phase and main growth factor.
  const squadRows = useMemo((): SquadDevRow[] => {
    if (!squad) return [];
    const order = new Map(playerOptions.map((o, i) => [o.id, i]));
    return squad.players.filter((p) => p.stats).map((p) => {
      const f = developmentFactors(p, squad, intensity);
      const change = today ? ovrChange(p.devHistory, p, today) : null;
      const main = f.main
        ? f.main.id === "age" ? factorName(t, f.main, intensity) : `${factorName(t, f.main, intensity)} ${factorValue(t, f.main.mult)}`
        : "";
      return {
        id: p.id,
        name: p.name,
        position: preferredRole(p),
        order: order.get(p.id) ?? 0,
        age: p.age,
        ovr: attrDisplay(overallAvg(p)),
        change: change === null ? null : Math.round(change * 10),
        phase: f.phase,
        main,
      };
    }).sort((a, b) => a.order - b.order);
  }, [squad, playerOptions, intensity, today, t]);

  useEffect(() => {
    if (playerOptions.length > 0 && !selectedPlayerId) {
      setSelectedPlayerId(playerOptions[0]!.id);
    }
  }, [playerOptions, selectedPlayerId]);

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
  const nameOf = (id: string) => attributeText(t, id).name;
  const attributes = buildDevAttributes(player, nameOf);
  const roleFocus = buildRoleFocus(player, nameOf);
  const explanation = t(`developmentScreen.explanation.${buildExplanation(player)}`);
  const warnings = buildWarnings(player);
  const factors = player.stats ? developmentFactors(player, squad, intensity) : null;
  const potential = player.stats && player.age <= 23 ? potentialBand(player) : null;

  const selectAndScroll = (id: string) => {
    setSelectedPlayerId(id);
    document.getElementById("dev-player")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <ScreenContainer>
          <ScreenTitle accent={t("screenTitles.development.accent")}>
            {t("screenTitles.development.main")}
          </ScreenTitle>

          <DevelopmentTrainingConfig />

          <div id="dev-player" className="flex flex-col xl:flex-row gap-6 xl:items-start scroll-mt-16">
            <div className="flex-1 min-w-0 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 phone:gap-3">
                <div className="lg:col-span-1 space-y-6 phone:space-y-3">
                  <PlayerProfile
                    clubColors={squad.colors}
                    player={{
                      id: player.id,
                      nationality: player.nationality,
                      name: player.name,
                      age: player.age,
                      role: player.stats ? positionLabel(t, preferredRole(player), player.positions[0] ?? "CM") : (player.positions[0] || "Player"),
                      agePhase,
                      developmentStatus: devStatus,
                    }}
                  />
                  {factors && <GrowthFactorsPanel factors={factors} age={player.age} intensity={intensity} />}
                  {session && (
                    <IndividualTrainingPanel
                      saveId={session.saveId}
                      playerId={player.id}
                      initial={squad.playerTraining?.[player.id]}
                      onSaved={() => void refresh()}
                    />
                  )}
                  {/* Where he plays naturally and where he needs to adapt (tester report), to pick a training position. */}
                  {player.stats && (
                    <div className="card-arcade rounded-md p-4">
                      <PositionPitch aptitudes={positionAptitudes(player)} />
                    </div>
                  )}
                  <DevelopmentWarnings warnings={warnings} />
                </div>

                <div className="lg:col-span-2 space-y-6 phone:space-y-3">
                  <AttributesPanel
                    attributes={attributes}
                    ovr={player.stats ? overallAvg(player) : 0}
                    potential={potential}
                    declining={factors?.phase === "declining"}
                  />
                  <DevHistoryPanel history={player.devHistory} log={player.devLog} />
                  <DevelopmentExplanation explanation={explanation} roleFocus={roleFocus} />
                </div>
              </div>
            </div>

            <aside className="w-full xl:w-[min(100%,20.5rem)]">
              <PlayerSelector
                players={playerOptions}
                selectedId={selectedPlayerId}
                onSelect={setSelectedPlayerId}
                clubColors={squad.colors}
              />
            </aside>
          </div>

          <SquadDevelopmentTable rows={squadRows} selectedId={selectedPlayerId} onSelect={selectAndScroll} />
    </ScreenContainer>
  );
}
