import { recordPromotion } from "@/Domain/achievements/progress";
import { saveService } from "@/backend/SaveService";
import { requireSeat } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { HUMAN_MAX_SQUAD, toFreeAgent } from "@/Domain/contracts/freeAgents";
import { humanRosterSize } from "@/backend/negotiationWorld";
import { overallAvg } from "@/Domain/playerRating";
import { wageFactorOf, playerWeeklyWage } from "@/Domain/finance/wages";
import { potentialBand } from "@/Domain/youth/youth";
import { DEFAULT_YOUTH_PLAN, parsePlayerTraining, parseYouthPlan, TRAINING_POSITIONS, youthTrendDelta } from "@/Domain/youth/youthTraining";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

type Req = Request & { params: Record<string, string> };

async function loadHumanSquad(saveId: string, seatId: string) {
  const meta = await saveService.getSeatMeta(saveId, seatId);
  if (!meta) return null;
  const ref = await saveService.resolveSquadId(saveId, meta.clubId);
  if (!ref) return null;
  const squad = await saveService.getSquad(saveId, ref.leagueSlug, ref.clubSlug);
  if (!squad) return null;
  return { meta, ref, squad };
}

function youthView(squad: Squad) {
  const youth = (squad.youth ?? []).map((player) => {
    const [lo, hi] = potentialBand(player);
    return { player, overall: overallAvg(player), potential: { low: lo, high: hi }, trend: youthTrendDelta(player) };
  });
  return {
    youth, squadSize: squad.players.length, squadLimit: HUMAN_MAX_SQUAD,
    training: squad.youthTraining ?? DEFAULT_YOUTH_PLAN, positions: TRAINING_POSITIONS,
  };
}

/**
 * Youth academy (`.claude/rules/game/youth.md`): the human club's `squad.youth` list, promotion into
 * the squad (limit 30) and release into the free-agent pool. Only the owner of the save may call.
 */
export const youthRoutes = {
  "/api/saves/:saveId/youth": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const found = await loadHumanSquad(saveId, auth.seatId);
    if (!found) return Response.json({ error: "squad not found" }, { status: 404 });
    return Response.json(youthView(found.squad));
  },

  /**
   * `PUT { intensity, focus, players }` - the academy training plan (`youthTraining.ts`). Free in the lobby, like the
   * tactics. 400 `invalidTraining`.
   */
  "/api/saves/:saveId/youth/training": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "PUT") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = await req.json().catch(() => null);
    return withSaveLock(saveId, async () => {
      const found = await loadHumanSquad(saveId, auth.seatId);
      if (!found) return Response.json({ error: "noClub" }, { status: 409 });
      const plan = parseYouthPlan(body, new Set((found.squad.youth ?? []).map((p) => p.id)));
      if (!plan) return Response.json({ error: "invalidTraining" }, { status: 400 });
      const next: Squad = { ...found.squad, youthTraining: plan };
      await saveService.saveSquad(saveId, found.ref.leagueSlug, found.ref.clubSlug, next);
      return Response.json(youthView(next));
    });
  },

  /**
   * `PUT { focus, position }` - a first-team player's individual training (4.39); `{}` (or nulls) clears it. Free in
   * the lobby, like the tactics. 400 `invalidTraining`, 404 `notYourPlayer`.
   */
  "/api/saves/:saveId/players/:playerId/training": async (req: Req) => {
    const saveId = req.params.saveId!;
    const playerId = req.params.playerId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "PUT") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = await req.json().catch(() => null);
    return withSaveLock(saveId, async () => {
      const found = await loadHumanSquad(saveId, auth.seatId);
      if (!found) return Response.json({ error: "noClub" }, { status: 409 });
      if (!found.squad.players.some((p) => p.id === playerId)) return Response.json({ error: "notYourPlayer" }, { status: 404 });
      const entry = parsePlayerTraining(body);
      if (!entry) return Response.json({ error: "invalidTraining" }, { status: 400 });
      const ids = new Set(found.squad.players.map((p) => p.id));
      const playerTraining = Object.fromEntries(Object.entries(found.squad.playerTraining ?? {}).filter(([id]) => ids.has(id) && id !== playerId));
      if (entry.focus || entry.position) playerTraining[playerId] = entry;
      const next: Squad = { ...found.squad, playerTraining };
      await saveService.saveSquad(saveId, found.ref.leagueSlug, found.ref.clubSlug, next);
      return Response.json({ playerTraining });
    });
  },

  /** `POST` - move an academy player into the squad (400 `squadFull` at `HUMAN_MAX_SQUAD`). New wage from the curve. */
  "/api/saves/:saveId/youth/:playerId/promote": async (req: Req) => {
    const saveId = req.params.saveId!;
    const playerId = req.params.playerId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    return withSaveLock(saveId, async () => {
      const found = await loadHumanSquad(saveId, auth.seatId);
      if (!found) return Response.json({ error: "squad not found" }, { status: 404 });
      const { squad } = found;
      const player = squad.youth?.find((p) => p.id === playerId);
      if (!player) return Response.json({ error: "player not found" }, { status: 404 });
      if ((await humanRosterSize(saveService, saveId, auth.seatId, squad)) >= HUMAN_MAX_SQUAD) return Response.json({ error: "squadFull" }, { status: 400 });
      if (!player.contract) return Response.json({ error: "noContract" }, { status: 409 });
      const promoted: RosterPlayer = {
        ...player,
        contract: { until: player.contract.until, wage: playerWeeklyWage(player, wageFactorOf(squad)) },
      };
      const next: Squad = {
        ...squad,
        players: [...squad.players, promoted],
        youth: (squad.youth ?? []).filter((p) => p.id !== playerId),
      };
      await saveService.saveSquad(saveId, found.ref.leagueSlug, found.ref.clubSlug, next);
      // Achievements (`.claude/rules/game/achievements.md`): an academy player in the first team.
      await saveService.writeAchievements(saveId, recordPromotion(await saveService.getAchievements(saveId, auth.seatId), playerId), auth.seatId);
      return Response.json(youthView(next));
    });
  },

  /** `POST` - dismiss an academy player; he joins the free-agent pool. */
  "/api/saves/:saveId/youth/:playerId/release": async (req: Req) => {
    const saveId = req.params.saveId!;
    const playerId = req.params.playerId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    return withSaveLock(saveId, async () => {
      const found = await loadHumanSquad(saveId, auth.seatId);
      if (!found) return Response.json({ error: "squad not found" }, { status: 404 });
      const { squad, meta } = found;
      const player = squad.youth?.find((p) => p.id === playerId);
      if (!player) return Response.json({ error: "player not found" }, { status: 404 });
      const next: Squad = { ...squad, youth: (squad.youth ?? []).filter((p) => p.id !== playerId) };
      await saveService.saveSquad(saveId, found.ref.leagueSlug, found.ref.clubSlug, next);
      const date = meta.currentDate ?? new Date().toISOString().slice(0, 10);
      const pool = await saveService.getFreeAgents(saveId);
      await saveService.writeFreeAgents(saveId, [...pool, toFreeAgent(player, date)]);
      return Response.json(youthView(next));
    });
  },
};
