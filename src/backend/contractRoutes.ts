import { saveService } from "@/backend/SaveService";
import { requireSaveOwner } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { addYearsIso, defaultSeasonEnd, evaluateContractOffer } from "@/Domain/contracts/contracts";
import { buildContractMessage, emitInboxMessage } from "@/Domain/inbox/inboxEvents";

/**
 * `POST /api/saves/:saveId/players/:playerId/renew` `{ wage, years }` — renew a player of the
 * human club. The offer is judged by `evaluateContractOffer`; a refusal answers 400 with the
 * reason (`lowWage` | `tooManyYears` | `invalidYears`) and the player's `demand`. On success the
 * contract's end moves `years` seasons past its current end and the new wage applies at once.
 */
export const contractRoutes = {
  "/api/saves/:saveId/players/:playerId/renew": async (
    req: Request & { params: Record<string, string> },
  ) => {
    const saveId = req.params.saveId!;
    const playerId = req.params.playerId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });

    let body: unknown;
    try { body = await req.json(); } catch { return Response.json({ error: "invalid body" }, { status: 400 }); }
    const { wage, years } = (body ?? {}) as Record<string, unknown>;
    if (typeof wage !== "number" || !Number.isFinite(wage) || typeof years !== "number") {
      return Response.json({ error: "missing or invalid fields" }, { status: 400 });
    }

    return withSaveLock(saveId, async () => {
      const meta = await saveService.getMeta(saveId);
      if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
      const ref = await saveService.resolveSquadId(saveId, meta.clubId);
      if (!ref) return Response.json({ error: "squad not found" }, { status: 404 });
      const squad = await saveService.getSquad(saveId, ref.leagueSlug, ref.clubSlug);
      const player = squad?.players.find((p) => p.id === playerId);
      if (!squad || !player) return Response.json({ error: "player not found" }, { status: 404 });

      const date = meta.currentDate ?? new Date().toISOString().slice(0, 10);
      const check = evaluateContractOffer({ wage, years }, player, squad, date);
      if (!check.accepted) {
        return Response.json({ error: check.reason, demand: check.demand }, { status: 400 });
      }

      const seasonEnd = (meta.activeLeagues ?? []).find((l) => l.leagueSlug === meta.leagueSlug)?.end
        ?? defaultSeasonEnd(date);
      const contract = { until: addYearsIso(player.contract?.until ?? seasonEnd, years), wage };
      await saveService.saveSquad(saveId, ref.leagueSlug, ref.clubSlug, {
        ...squad,
        players: squad.players.map((p) => (p.id === playerId ? { ...p, contract } : p)),
      });
      await emitInboxMessage(
        saveId,
        buildContractMessage({ date, kind: "renewed", players: [{ id: player.id, name: player.name }], until: contract.until }),
        saveService,
      );
      return Response.json({ contract, demand: check.demand });
    });
  },
};
