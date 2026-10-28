import { aiDive, aiKick, resolveKick, type GoalArea, type KickInput, type KickOutcome } from "@/Domain/penalty/penaltyKick";
import type { GameState, PenaltyOutcome, TeamId } from "@/GameEngine/types";
import { PenaltyScreen } from "@/GameInterface/Penalty/PenaltyScreen";

/**
 * The 2D penalty screen over a live match when `state.pendingPenalty` is for a team the manager controls
 * (`state.penaltyInteractive`). Solo: the other side is the AI and the kick resolves in the browser; `choose`
 * replaces that (the server, in a live match between two managers).
 */
export function PenaltyOverlay({ state, mySide, kits, names, onOutcome, choose }: {
  state: GameState;
  mySide: TeamId;
  kits: { A: string; B: string };
  /** Shootout rows in the order shown (home first) and which engine team each is. */
  names: { left: { team: TeamId; name: string }; right: { team: TeamId; name: string } };
  onOutcome: (o: PenaltyOutcome) => void;
  choose?: (choice: { kick: KickInput } | { dive: GoalArea }) => Promise<KickOutcome>;
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
    keeper: keeper ? { reflex: keeper.runtimeStats.withoutBall.gkReflex, diving: keeper.runtimeStats.withoutBall.gkDiving } : null,
  };
  const local = async (choice: { kick: KickInput } | { dive: GoalArea }) => ("kick" in choice
    ? resolveKick(choice.kick, aiDive(Math.random), players, Math.random)
    : resolveKick(aiKick(Math.random), choice.dive, players, Math.random));
  return (
    <PenaltyScreen
      key={`${pending.kind}:${pending.team}:${kicks.length}:${state.matchTime}`}
      role={pending.team === mySide ? "kick" : "save"}
      takerName={taker.name}
      keeperName={keeper?.name ?? null}
      takerColor={kits[pending.team]}
      keeperColor={kits[pending.team === "A" ? "B" : "A"]}
      shootout={pending.kind === "shootout"
        ? { homeName: names.left.name, awayName: names.right.name, home: rowOf(names.left.team), away: rowOf(names.right.team) }
        : null}
      choose={choose ?? local}
      onDone={(o) => onOutcome({ scored: o.scored, result: o.result, chance: o.chance })}
    />
  );
}
