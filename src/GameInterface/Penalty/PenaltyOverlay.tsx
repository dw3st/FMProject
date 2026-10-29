import { aiDive, aiKick, resolveKick, type GoalArea, type KickInput, type KickOutcome } from "@/Domain/penalty/penaltyKick";
import type { GameState, PenaltyOutcome, TeamId } from "@/GameEngine/types";
import { PenaltyScreen } from "@/GameInterface/Penalty/PenaltyScreen";
import { matchClockMinutes, matchLighting, minutesOf } from "@/GraficsEngine/matchLighting";
import { ATMOSPHERE } from "@/GraficsEngine/stadiumAtmosphere";
import type { PitchLighting } from "@/GraficsEngine/PixiPitch";

/**
 * The 2D penalty screen over a live match when `state.pendingPenalty` is for a team the manager controls
 * (`state.penaltyInteractive`). Solo: the other side is the AI and the kick resolves in the browser; `choose`
 * replaces that (the server, in a live match between two managers).
 */
export function PenaltyOverlay({ state, mySide, kits, names, onOutcome, choose, faceUrls, lighting, seed }: {
  state: GameState;
  mySide: TeamId;
  kits: { A: string; B: string };
  /** Shootout rows in the order shown (home first) and which engine team each is. */
  names: { left: { team: TeamId; name: string }; right: { team: TeamId; name: string } };
  onOutcome: (o: PenaltyOutcome) => void;
  choose?: (choice: { kick: KickInput } | { dive: GoalArea }) => Promise<KickOutcome>;
  /** Faces by team and roster id (the match's own). */
  faceUrls?: { A: Record<string, string>; B: Record<string, string> };
  /** The match's light: at night the penalty screen shows floodlights and phones. */
  lighting?: PitchLighting | null;
  seed?: string;
}) {
  const pending = state.pendingPenalty ?? null;
  if (!pending || !(state.penaltyInteractive ?? []).includes(mySide)) return null;
  const taker = state.players.find((p) => p.id === pending.takerId);
  if (!taker) return null;
  const keeper = pending.keeperId != null ? state.players.find((p) => p.id === pending.keeperId) ?? null : null;
  const kicks = state.shootout?.kicks ?? [];
  const rowOf = (tm: TeamId): (boolean | null)[] => {
    const done = kicks.filter((k) => k.team === tm).map((k) => k.scored);
    const len = Math.max(5, kicks.filter((k) => k.team === "A").length, done.length);
    return [...done, ...Array.from({ length: len - done.length }, () => null)];
  };
  const players = {
    accuracy: taker.runtimeStats.withBall.shootAccuracy,
    strength: taker.runtimeStats.withBall.strength ?? 0.5,
    keeper: keeper ? { reflex: keeper.runtimeStats.withoutBall.gkReflex, diving: keeper.runtimeStats.withoutBall.gkDiving } : null,
  };
  const keeperTeam: TeamId = pending.team === "A" ? "B" : "A";
  const keeperFace = keeper ? faceUrls?.[keeperTeam]?.[keeper.rosterId] : undefined;
  const night = !!lighting && matchLighting({
    clock: lighting.clockOverride ?? matchClockMinutes(state, minutesOf(lighting.kickoff)),
    sunset: minutesOf(lighting.sunset),
    weather: lighting.weather === "wind_rain" ? "rain" : lighting.weather,
    sun: lighting.sun,
    ...(lighting.date ? { date: lighting.date } : {}),
  }).flood >= ATMOSPHERE.LIGHTS_ON;
  const local = async (choice: { kick: KickInput } | { dive: GoalArea }) => ("kick" in choice
    ? resolveKick(choice.kick, aiDive(Math.random), players, Math.random)
    : resolveKick(aiKick(Math.random), choice.dive, players, Math.random));
  return (
    <PenaltyScreen
      key={`${pending.kind}:${pending.team}:${kicks.length}:${state.matchTime}`}
      role={pending.team === mySide ? "kick" : "save"}
      takerName={taker.name}
      keeperName={keeper?.name ?? null}
      takerStrength={players.strength}
      takerColor={kits[pending.team]}
      keeperColor={kits[pending.team === "A" ? "B" : "A"]}
      shootout={pending.kind === "shootout"
        ? { homeName: names.left.name, awayName: names.right.name, home: rowOf(names.left.team), away: rowOf(names.right.team) }
        : null}
      choose={choose ?? local}
      onDone={(o) => onOutcome({ scored: o.scored, result: o.result, chance: o.chance })}
      {...(keeperFace ? { keeperFace } : {})}
      night={night}
      seed={seed ?? "penalty"}
    />
  );
}
