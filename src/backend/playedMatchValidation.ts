import type { PlayedMatchRecording } from "@/Domain/advanceDay/matches";
import type { Fixture } from "@/types/calendarTypes";

/** A live recording sent by the client, or null when it fails the shape check (the server never simulates it then). */
export function validatePlayedMatch(raw: unknown): PlayedMatchRecording | null {
  const pm = raw as PlayedMatchRecording | null | undefined;
  const pe = pm?.playerEnergy;
  const peOk = !!pe && typeof pe === "object" && !!pm?.playerStats
    && Object.keys(pm.playerStats).every((id) => typeof (pe as Record<string, unknown>)[id] === "number");
  if (
    !pm
    || typeof pm.fixtureId !== "string"
    || !pm.score
    || typeof pm.score.home !== "number"
    || typeof pm.score.away !== "number"
    || !pm.teamStats?.home
    || !pm.teamStats?.away
    || !pm.playerStats
    || !pm.playerRatings
    || !peOk
    || typeof pm.durationMs !== "number"
  ) return null;
  return pm;
}

/** A knockout recording level on score + aggregate needs a shootout winner (`.claude/rules/match-flow.md`). */
export function knockoutRecordingDecided(fixture: Fixture, recording: PlayedMatchRecording): boolean {
  if (!fixture.knockout) return true;
  const level = recording.score.home + (fixture.aggregate?.home ?? 0) === recording.score.away + (fixture.aggregate?.away ?? 0);
  if (!level) return true;
  const pens = recording.decider?.penalties;
  return !!pens && pens.home !== pens.away;
}
