import { saveService } from "@/backend/SaveService";
import { requireSaveOwner } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { loadWindowContext } from "@/backend/marketWindowWorld";
import { getLeagueData, type LeagueDataEntry } from "@/backend/advanceDay";
import { emptyMarket, humanRosterSize, seasonEndOf } from "@/backend/negotiationWorld";
import { prestigeOf } from "@/backend/rivalWorld";
import { reputationOf } from "@/backend/jobWorld";
import { emitInboxMessage, buildBoardMessage, buildTransferNegotiationMessage } from "@/Domain/inbox/inboxEvents";
import { answerPreContract } from "@/Domain/negotiation/preContract";
import { MAX_SQUAD } from "@/Domain/contracts/freeAgents";
import { addYearsIso } from "@/Domain/contracts/contracts";
import { renewedContract } from "@/Domain/managers/managerContract";
import { wageRevenueBasisOf } from "@/Domain/finance/wages";
import type { MarketState } from "@/types/transferMarketTypes";

type Req = Request & { params: Record<string, string> };
const json = (body: unknown, status = 200) => Response.json(body, { status });

/**
 * Etapa 25 routes (`.claude/rules/game/transfer-windows.md`, `negotiation.md`, `jobs.md`): the
 * transfer windows, pre-contracts and the human manager's contract.
 */
export const marketRoutes = {
  /**
   * `GET` - the human club's window (`{ country, open, until?, opensOn? }`) and every country's current
   * and next window (the player's country and the followed leagues' countries first).
   */
  "/api/saves/:saveId/transfer-windows": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return json({ error: "method not allowed" }, 405);
    const meta = await saveService.getMeta(saveId);
    if (!meta) return json({ error: "save not found" }, 404);
    const windows = await loadWindowContext(meta, await saveService.getSquadIndex(saveId));
    const mine = windows.humanCountry() || windows.countryOfLeague(meta.leagueSlug);
    const followed = new Set((meta.followedLeagues ?? []).map((l) => windows.countryOfLeague(l)));
    const human = windows.human();
    const catalog = (await getLeagueData()) as (LeagueDataEntry & { iso2?: string })[];
    const iso2Of = (country: string) => catalog.find((l) => l.country === country && l.iso2)?.iso2;
    const countries = windows.countries()
      .map((c) => ({
        country: c.country,
        ...(iso2Of(c.country) ? { iso2: iso2Of(c.country) } : {}),
        ...(c.status.current ? { current: c.status.current } : {}),
        ...(c.status.next ? { next: c.status.next } : {}),
        rank: c.country === mine ? 0 : followed.has(c.country) ? 1 : 2,
      }))
      .sort((a, b) => a.rank - b.rank || a.country.localeCompare(b.country))
      .map(({ rank: _r, ...c }) => c);
    return json({
      player: { country: mine, ...(iso2Of(mine) ? { iso2: iso2Of(mine) } : {}), open: human.open, ...(human.until ? { until: human.until } : {}), ...(human.opensOn ? { opensOn: human.opensOn } : {}) },
      countries,
    });
  },

  /**
   * `POST { playerId, fromSquadId, wage, years }` - pre-contract (D2) with an AI player whose contract
   * ends within 183 days: no fee, no window. `{ accepted, preference }`; 400 `notEligible` and the
   * contract refusals; 409 `squadFull`/`noClub`.
   */
  "/api/saves/:saveId/pre-contracts": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method === "GET") {
      return json((await saveService.getMarket(saveId))?.preContracts ?? []);
    }
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const { playerId, fromSquadId, wage, years } = body ?? {};
    if (typeof playerId !== "string" || !playerId || typeof fromSquadId !== "string" || !fromSquadId
      || typeof wage !== "number" || !Number.isFinite(wage) || wage <= 0 || typeof years !== "number") {
      return json({ error: "missing or invalid fields" }, 400);
    }
    return withSaveLock(saveId, async () => {
      const meta = await saveService.getMeta(saveId);
      if (!meta?.currentDate) return json({ error: "save not found" }, 404);
      if (meta.unemployed || !meta.clubId) return json({ error: "noClub" }, 409);
      const date = meta.currentDate;
      const human = await saveService.getSquadById(saveId, meta.clubId);
      const current = await saveService.getSquadById(saveId, fromSquadId);
      if (!human || !current) return json({ error: "squad not found" }, 404);
      if (current.id === human.id) return json({ error: "notEligible" }, 400);
      const player = current.players.find((p) => p.id === playerId);
      if (!player) return json({ error: "player not found" }, 404);
      const market: MarketState = (await saveService.getMarket(saveId)) ?? emptyMarket();
      const signed = market.preContracts ?? [];
      if (signed.some((p) => p.playerId === playerId)) return json({ error: "notEligible" }, 400);
      if ((await humanRosterSize(saveService, saveId, human)) + signed.length >= MAX_SQUAD) return json({ error: "squadFull" }, 409);
      const prestige = await prestigeOf(saveService, saveId, date, [human.id, current.id]);
      const answer = answerPreContract({
        offer: { wage, years }, player, human, current, date,
        humanPrestige: prestige.get(human.id) ?? 0.5, currentPrestige: prestige.get(current.id) ?? 0.5,
        nextSeasonEnd: addYearsIso(seasonEndOf(meta.activeLeagues, current.leagueSlug, date), 1),
      });
      if (!answer.accepted) {
        const status = answer.reason === "prefersCurrent" ? 200 : 400;
        return json(status === 200
          ? { accepted: false, reason: answer.reason, preference: answer.preference, demand: answer.demand }
          : { error: answer.reason, demand: answer.demand }, status);
      }
      await saveService.saveMarket(saveId, {
        ...market,
        preContracts: [...signed, {
          playerId, playerName: player.name, fromClubId: current.id, fromClubName: current.name, toClubId: human.id,
          wage, years, date,
        }],
      });
      await emitInboxMessage(saveId, buildTransferNegotiationMessage({
        date, kind: "pre_contract", playerId, playerName: player.name, clubName: current.name, wage, years,
      }), saveService);
      return json({ accepted: true, preference: answer.preference });
    });
  },

  /**
   * `GET` - the manager's contract, career earnings and the pending renewal. `POST { accept }` -
   * answer the board's renewal; 409 `offerClosed` without one.
   */
  "/api/saves/:saveId/manager-contract": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method === "GET") {
      const meta = await saveService.getMeta(saveId);
      if (!meta) return json({ error: "save not found" }, 404);
      const squad = meta.clubId ? await saveService.getSquadById(saveId, meta.clubId) : null;
      const contract = meta.managerContract ?? null;
      return json({
        contract,
        earnings: meta.managerEarnings ?? 0,
        renewal: meta.managerRenewal && meta.managerRenewal.expires >= (meta.currentDate ?? "") ? meta.managerRenewal : null,
        revenueShare: contract && squad ? (contract.wage * 52) / Math.max(1, wageRevenueBasisOf(squad)) : null,
        reputation: await reputationOf(saveService, saveId, meta),
      });
    }
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
    const body = (await req.json().catch(() => null)) as { accept?: unknown } | null;
    if (!body || typeof body.accept !== "boolean") return json({ error: "accept required" }, 400);
    return withSaveLock(saveId, async () => {
      const meta = await saveService.getMeta(saveId);
      if (!meta?.currentDate) return json({ error: "save not found" }, 404);
      const offer = meta.managerRenewal;
      if (!offer || !meta.managerContract || offer.expires < meta.currentDate) return json({ error: "offerClosed" }, 409);
      if (!body.accept) {
        await saveService.updateMeta(saveId, { managerRenewal: undefined });
        return json({ ok: true, status: "declined" });
      }
      const contract = renewedContract(meta.managerContract, offer, meta.currentDate);
      await saveService.updateMeta(saveId, { managerContract: contract, managerRenewal: undefined });
      await emitInboxMessage(saveId, buildBoardMessage({
        date: meta.currentDate, kind: "contract_renewed",
        contract: { wage: contract.wage, seasons: offer.seasons, until: contract.until },
      }), saveService);
      return json({ ok: true, status: "renewed", contract });
    });
  },
};
