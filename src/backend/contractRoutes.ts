import { saveService } from "@/backend/SaveService";
import { requireSaveOwner } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { renewalWithinLimits, addYearsIso, contractDemand, defaultSeasonEnd, evaluateContractOffer } from "@/Domain/contracts/contracts";
import { MAX_SQUAD } from "@/Domain/contracts/freeAgents";
import { humanRosterSize } from "@/backend/negotiationWorld";
import { buildContractMessage, buildPlayerMessage, emitInboxMessage } from "@/Domain/inbox/inboxEvents";
import { afterRenewal, moraleBand, moraleDemandMult, refusesRenewal } from "@/Domain/morale/morale";

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
      if (!squad) return Response.json({ error: "player not found" }, { status: 404 });
      // One of ours out on loan (`.claude/rules/game/negotiation.md`): the contract is still ours,
      // written into the borrowing club's squad where he plays.
      const market = await saveService.getMarket(saveId);
      const out = (market?.loans ?? []).find((l) => l.playerId === playerId && l.fromClubId === squad.id);
      const holder = out ? await saveService.getSquadById(saveId, out.toClubId) : squad;
      const player = holder?.players.find((p) => p.id === playerId);
      if (!holder || !player) return Response.json({ error: "player not found" }, { status: 404 });
      // A borrowed player keeps his parent club's contract.
      if (!out && player.loan) return Response.json({ error: "onLoan" }, { status: 400 });

      const date = meta.currentDate ?? new Date().toISOString().slice(0, 10);
      // A furious player only renews with an open renewal promise (`.claude/rules/game/morale.md`).
      if (!out && refusesRenewal(squad, player)) {
        return Response.json({ error: "unhappy", demand: contractDemand(player, squad, date) }, { status: 400 });
      }
      const check = evaluateContractOffer({ wage, years }, player, squad, date);
      if (!check.accepted) {
        return Response.json({ error: check.reason, demand: check.demand }, { status: 400 });
      }

      const seasonEnd = (meta.activeLeagues ?? []).find((l) => l.leagueSlug === meta.leagueSlug)?.end
        ?? defaultSeasonEnd(date);
      if (!renewalWithinLimits(player, date, seasonEnd, years)) {
        return Response.json({ error: "tooManyYears", demand: check.demand }, { status: 400 });
      }
      const contract = { until: addYearsIso(player.contract?.until ?? seasonEnd, years), wage };
      if (out) {
        await saveService.saveSquadById(saveId, { ...holder, players: holder.players.map((p) => (p.id === playerId ? { ...p, contract } : p)) });
        await saveService.saveMarket(saveId, { ...market!, loans: (market!.loans ?? []).map((l) => (l === out ? { ...l, wage } : l)) });
      } else {
        // Renewal accepted: +6 morale, and an open renewal promise is kept (`morale.md`).
        const renewed = afterRenewal({
          ...squad,
          players: squad.players.map((p) => (p.id === playerId ? { ...p, contract } : p)),
        }, playerId, date);
        await saveService.saveSquad(saveId, ref.leagueSlug, ref.clubSlug, renewed.squad);
        for (const n of renewed.news) await emitInboxMessage(saveId, buildPlayerMessage(n), saveService);
      }
      await emitInboxMessage(
        saveId,
        buildContractMessage({ date, kind: "renewed", players: [{ id: player.id, name: player.name }], until: contract.until }),
        saveService,
      );
      return Response.json({ contract, demand: check.demand });
    });
  },

  /**
   * `GET /api/saves/:saveId/players/:playerId/demand?from=<squadId>` — the weekly wage this player
   * would ask of the human club. `from` is the player's current squad; omitted = the free-agent pool.
   */
  "/api/saves/:saveId/players/:playerId/demand": async (
    req: Request & { params: Record<string, string> },
  ) => {
    const saveId = req.params.saveId!;
    const playerId = req.params.playerId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const meta = await saveService.getMeta(saveId);
    if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
    const ref = await saveService.resolveSquadId(saveId, meta.clubId);
    const mine = ref ? await saveService.getSquad(saveId, ref.leagueSlug, ref.clubSlug) : null;
    if (!mine) return Response.json({ error: "squad not found" }, { status: 404 });

    const from = new URL(req.url).searchParams.get("from");
    let player;
    if (from) {
      const src = await saveService.resolveSquadId(saveId, from);
      const squad = src ? await saveService.getSquad(saveId, src.leagueSlug, src.clubSlug) : null;
      player = squad?.players.find((p) => p.id === playerId);
    } else {
      player = (await saveService.getFreeAgents(saveId)).find((f) => f.player.id === playerId)?.player;
    }
    if (!player) return Response.json({ error: "player not found" }, { status: 404 });
    const date = meta.currentDate ?? new Date().toISOString().slice(0, 10);
    // Own player: the morale behind the demand (an unhappy one asks more, a furious one refuses).
    const own = !from || from === mine.id ? mine.players.find((p) => p.id === playerId) : undefined;
    return Response.json({
      demand: contractDemand(player, mine, date),
      ...(own && own.morale !== undefined
        ? { moraleBand: moraleBand(own.morale), moraleDemandMult: moraleDemandMult(own), refuses: refusesRenewal(mine, own) }
        : {}),
    });
  },

  /**
   * `POST /api/saves/:saveId/free-agents/:playerId/sign` `{ wage, years }` — sign a free agent for
   * the human club: no fee, offer judged by `evaluateContractOffer`, squad capped at 30.
   */
  "/api/saves/:saveId/free-agents/:playerId/sign": async (
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
      if (!squad) return Response.json({ error: "squad not found" }, { status: 404 });
      const pool = await saveService.getFreeAgents(saveId);
      const agent = pool.find((f) => f.player.id === playerId);
      if (!agent) return Response.json({ error: "player not found" }, { status: 404 });
      if ((await humanRosterSize(saveService, saveId, squad)) >= MAX_SQUAD) return Response.json({ error: "squadFull" }, { status: 400 });

      const date = meta.currentDate ?? new Date().toISOString().slice(0, 10);
      const check = evaluateContractOffer({ wage, years }, agent.player, squad, date);
      if (!check.accepted) return Response.json({ error: check.reason, demand: check.demand }, { status: 400 });

      const seasonEnd = (meta.activeLeagues ?? []).find((l) => l.leagueSlug === meta.leagueSlug)?.end
        ?? defaultSeasonEnd(date);
      const contract = { until: addYearsIso(seasonEnd, years - 1), wage };
      await saveService.saveSquad(saveId, ref.leagueSlug, ref.clubSlug, {
        ...squad,
        players: [...squad.players, { ...agent.player, squadId: squad.id, contract }],
      });
      await saveService.writeFreeAgents(saveId, pool.filter((f) => f.player.id !== playerId));
      return Response.json({ contract });
    });
  },
};
