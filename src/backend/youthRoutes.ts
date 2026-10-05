import { saveService } from "@/backend/SaveService";
import { requireSaveOwner } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { MAX_SQUAD, toFreeAgent } from "@/Domain/contracts/freeAgents";
import { humanRosterSize } from "@/backend/negotiationWorld";
import { overallAvg } from "@/Domain/playerRating";
import { wageFactorOf, playerWeeklyWage } from "@/Domain/finance/wages";
import { potentialBand } from "@/Domain/youth/youth";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

type Req = Request & { params: Record<string, string> };

async function loadHumanSquad(saveId: string) {
  const meta = await saveService.getMeta(saveId);
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
    return { player, overall: overallAvg(player), potential: { low: lo, high: hi } };
  });
  return { youth, squadSize: squad.players.length, squadLimit: MAX_SQUAD };
}

/**
 * Youth academy (`.claude/rules/game/youth.md`): the human club's `squad.youth` list, promotion into
 * the squad (limit 30) and release into the free-agent pool. Only the owner of the save may call.
 */
export const youthRoutes = {
  "/api/saves/:saveId/youth": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const found = await loadHumanSquad(saveId);
    if (!found) return Response.json({ error: "squad not found" }, { status: 404 });
    return Response.json(youthView(found.squad));
  },

  /** `POST` - move an academy player into the squad (400 `squadFull` at 30). New wage from the curve. */
  "/api/saves/:saveId/youth/:playerId/promote": async (req: Req) => {
    const saveId = req.params.saveId!;
    const playerId = req.params.playerId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    return withSaveLock(saveId, async () => {
      const found = await loadHumanSquad(saveId);
      if (!found) return Response.json({ error: "squad not found" }, { status: 404 });
      const { squad } = found;
      const player = squad.youth?.find((p) => p.id === playerId);
      if (!player) return Response.json({ error: "player not found" }, { status: 404 });
      if ((await humanRosterSize(saveService, saveId, squad)) >= MAX_SQUAD) return Response.json({ error: "squadFull" }, { status: 400 });
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
      return Response.json(youthView(next));
    });
  },

  /** `POST` - dismiss an academy player; he joins the free-agent pool. */
  "/api/saves/:saveId/youth/:playerId/release": async (req: Req) => {
    const saveId = req.params.saveId!;
    const playerId = req.params.playerId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    return withSaveLock(saveId, async () => {
      const found = await loadHumanSquad(saveId);
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
