import { squadWeeklyWages, wageFactorOf, wageRevenueBasisOf } from "@/Domain/finance/wages";
import { managerDemandCtx } from "@/backend/managerDemand";
import { releaseToFreePool } from "@/backend/playerRelease";
import { arriving } from "@/Domain/settling/settling";
import { releaseClause } from "@/Domain/negotiation/releaseClause";
import { saveService } from "@/backend/SaveService";
import { requireSeat } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { loanedInFrom } from "@/Domain/negotiation/loans";
import { expectedWeeklyBonus, goalsPerGame, parseContractBonus, productivityAllowed } from "@/Domain/contracts/productivity";
import { renewalUntil, renewalAvailableOn, addYearsIso, contractDemand, defaultSeasonEnd, demandBreakdown, evaluateContractOffer } from "@/Domain/contracts/contracts";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { Personality } from "@/types/personalityTypes";
import { obscurePersonality, personalityOf } from "@/Domain/personality/personality";
import { loadViewer, viewFor } from "@/backend/scoutingWorld";
import { HUMAN_MAX_SQUAD } from "@/Domain/contracts/freeAgents";
import { humanRosterSize } from "@/backend/negotiationWorld";
import { buildContractMessage, buildPlayerMessage, emitInboxMessage } from "@/Domain/inbox/inboxEvents";
import { afterRenewal, moraleBand, moraleDemandMult, refusesRenewal } from "@/Domain/morale/morale";
import { terminationBreaksDepth, terminationQuote, terminationThinLine } from "@/Domain/contracts/termination";
import { playerMarketValue } from "@/Domain/negotiation/askingPrice";
import { ledgerSeason } from "@/backend/staffRoutes";
import { freeSigningContext } from "@/backend/freeSigningWorld";
import { freeArrivalCtx } from "@/Domain/negotiation/freeSigning";
import { prestigeOf } from "@/backend/rivalWorld";
import { preferredRival } from "@/Domain/negotiation/freeSigning";
import { starterChance } from "@/Domain/negotiation/rivals";
import { facilitiesAppeal } from "@/Domain/facilities/facilities";
import { recordMoney } from "@/backend/FinancialService";
import { payrollCapRefusal } from "@/Domain/contracts/payrollCap";

/** The last club of a free agent (his latest history row), for the smaller-club rule (`personality.md`). */
async function lastClubOf(saveId: string, player: RosterPlayer): Promise<Squad | null> {
  const rows = player.history ?? [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const id = rows[i]!.squadId;
    if (id) return saveService.getSquadById(saveId, id);
  }
  return null;
}

/**
 * `POST /api/saves/:saveId/players/:playerId/renew` `{ wage, years }` — renew a player of the
 * human club. The offer is judged by `evaluateContractOffer`; a refusal answers 400 with the
 * reason (`lowWage` | `tooManyYears` | `invalidYears`) and the player's `demand`. On success the
 * contract's end moves `years` seasons past its current end and the new wage applies at once.
 */
export const contractRoutes = {
  /** Where a player plays now, for a link to his page (inbox names). 404 when he is at no club. */
  "/api/saves/:saveId/players/:playerId/where": async (req: Request & { params: Record<string, string> }) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const playerId = req.params.playerId!;
    for (const squad of await saveService.getAllSquads(saveId)) {
      if (!squad.players.some((p) => p.id === playerId) && !squad.youth?.some((p) => p.id === playerId)) continue;
      const ref = await saveService.resolveSquadId(saveId, squad.id);
      if (ref) return Response.json({ league: ref.leagueSlug, squadId: squad.id });
    }
    return Response.json({ error: "notFound" }, { status: 404 });
  },

  /**
   * Friendly termination (tester suggestion). `GET` quotes it (`{ fee, weeksLeft, wagesLeft, share, status, capped,
   * blocked }`), `POST` does it: the fee leaves the club's balance (ledger `wages`, stage `termination`) and the player
   * leaves as a free agent. 400 `onLoan` / `noContract`, 409 `squadDepth` (the squad would keep 14 or fewer); `thin` warns when his line drops below its minimum.
   */
  "/api/saves/:saveId/players/:playerId/terminate": async (req: Request & { params: Record<string, string> }) => {
    const saveId = req.params.saveId!;
    const playerId = req.params.playerId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET" && req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const run = async () => {
      const meta = await saveService.getSeatMeta(saveId, auth.seatId);
      if (!meta?.clubId) return Response.json({ error: "noClub" }, { status: 409 });
      const ref = await saveService.resolveSquadId(saveId, meta.clubId);
      const squad = ref ? await saveService.getSquad(saveId, ref.leagueSlug, ref.clubSlug) : null;
      const player = squad?.players.find((p) => p.id === playerId);
      if (!ref || !squad || !player) return Response.json({ error: "notYourPlayer" }, { status: 404 });
      if (player.loan) return Response.json({ error: "onLoan" }, { status: 400 });
      const date = meta.currentDate ?? new Date().toISOString().slice(0, 10);
      const quote = terminationQuote(player, squad, date, playerMarketValue(player));
      if (!quote) return Response.json({ error: "noContract" }, { status: 400 });
      const blocked = terminationBreaksDepth(squad, playerId);
      if (req.method === "GET") return Response.json({ ...quote, blocked, thin: terminationThinLine(squad, playerId) });
      if (blocked) return Response.json({ error: "squadDepth" }, { status: 409 });
      await saveService.saveSquad(saveId, ref.leagueSlug, ref.clubSlug, { ...squad, players: squad.players.filter((p) => p.id !== playerId) });
      if (quote.fee > 0) {
        await recordMoney(saveService, saveId, await ledgerSeason(saveService, saveId, ref.leagueSlug, date), ref, {
          date, kind: "wages", amount: -quote.fee, label: `Contract termination: ${player.name}`, ref: { stage: "termination" },
        }, auth.seatId);
      }
      await releaseToFreePool(saveId, auth.seatId, player, date);
      await emitInboxMessage(saveId, buildContractMessage({ date, kind: "released", players: [{ id: player.id, name: player.name }] }), saveService, auth.seatId);
      return Response.json({ fee: quote.fee });
    };
    return req.method === "GET" ? run() : withSaveLock(saveId, run);
  },

  "/api/saves/:saveId/players/:playerId/renew": async (
    req: Request & { params: Record<string, string> },
  ) => {
    const saveId = req.params.saveId!;
    const playerId = req.params.playerId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });

    let body: unknown;
    try { body = await req.json(); } catch { return Response.json({ error: "invalid body" }, { status: 400 }); }
    const { wage, years, productivity: rawBonus } = (body ?? {}) as Record<string, unknown>;
    if (typeof wage !== "number" || !Number.isFinite(wage) || typeof years !== "number") {
      return Response.json({ error: "missing or invalid fields" }, { status: 400 });
    }
    // Productivity contract (12.32): a bonus per match played and per goal.
    const bonus = parseContractBonus(rawBonus);
    if (bonus === "invalid") return Response.json({ error: "invalidBonus" }, { status: 400 });

    return withSaveLock(saveId, async () => {
      const meta = await saveService.getSeatMeta(saveId, auth.seatId);
      if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
      const ref = await saveService.resolveSquadId(saveId, meta.clubId);
      if (!ref) return Response.json({ error: "squad not found" }, { status: 404 });
      const squad = await saveService.getSquad(saveId, ref.leagueSlug, ref.clubSlug);
      if (!squad) return Response.json({ error: "player not found" }, { status: 404 });
      // One of ours out on loan (`.claude/rules/game/negotiation.md`): the contract is still ours,
      // written into the borrowing club's squad where he plays.
      const market = await saveService.getMarket(saveId, auth.seatId);
      const out = (market?.loans ?? []).find((l) => l.playerId === playerId && l.fromClubId === squad.id);
      const holder = out ? await saveService.getSquadById(saveId, out.toClubId) : squad;
      const player = holder?.players.find((p) => p.id === playerId);
      if (!holder || !player) return Response.json({ error: "player not found" }, { status: 404 });
      // A borrowed player keeps his parent club's contract.
      if (!out && player.loan) return Response.json({ error: "onLoan" }, { status: 400 });
      // Out on loan the borrower pays part of the wage: no productivity contract then.
      if (out && bonus) return Response.json({ error: "noProductivity" }, { status: 400 });

      const date = meta.currentDate ?? new Date().toISOString().slice(0, 10);
      // Renewed recently: not again before the cooldown ends.
      const availableOn = renewalAvailableOn(player.contract, date);
      if (availableOn) return Response.json({ error: "recentlyRenewed", availableOn }, { status: 409 });
      const { negotiation } = await managerDemandCtx(saveId, auth.seatId);
      // A furious player only renews with an open renewal promise (`.claude/rules/game/morale.md`).
      if (!out && refusesRenewal(squad, player)) {
        return Response.json({ error: "unhappy", demand: contractDemand(player, squad, date, { renewal: true, negotiation }) }, { status: 400 });
      }
      // A renewal at his own club, also when he is out on loan (`personality.md`): loyalty, no
      // smaller-club premium — the same context as the demand route.
      const check = evaluateContractOffer({ wage, years, productivity: bonus }, player, squad, date, { renewal: true, negotiation });
      if (!check.accepted) {
        return Response.json({ error: check.reason, demand: check.demand }, { status: 400 });
      }
      // The club's wage bill ceiling (`finances.md` → "Teto da folha"): a raise past it is refused; keeping or
      // lowering the wage always passes. A player out on loan is skipped (his wage is split with the borrower).
      const overCap = out ? null : payrollCapRefusal(squad, wage, { leaving: player.contract?.wage ?? 0 });
      if (overCap) return Response.json({ error: "payrollCap", ...overCap, demand: check.demand }, { status: 409 });

      const seasonEnd = (meta.activeLeagues ?? []).find((l) => l.leagueSlug === meta.leagueSlug)?.end
        ?? defaultSeasonEnd(date);
      const contract = { until: renewalUntil(player, date, seasonEnd, years), wage, renewedOn: date, ...(bonus ? { bonus } : {}) };
      if (out) {
        await saveService.saveSquadById(saveId, { ...holder, players: holder.players.map((p) => (p.id === playerId ? { ...p, contract } : p)) });
        await saveService.saveMarket(saveId, { ...market!, loans: (market!.loans ?? []).map((l) => (l === out ? { ...l, wage } : l)) }, auth.seatId);
      } else {
        // Renewal accepted: +6 morale, and an open renewal promise is kept (`morale.md`).
        const renewed = afterRenewal({
          ...squad,
          players: squad.players.map((p) => (p.id === playerId ? { ...p, contract } : p)),
        }, playerId, date);
        await saveService.saveSquad(saveId, ref.leagueSlug, ref.clubSlug, renewed.squad);
        for (const n of renewed.news) await emitInboxMessage(saveId, buildPlayerMessage(n), saveService, auth.seatId);
      }
      await emitInboxMessage(
        saveId,
        buildContractMessage({ date, kind: "renewed", players: [{ id: player.id, name: player.name }], until: contract.until }),
        saveService,
        auth.seatId,
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
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const meta = await saveService.getSeatMeta(saveId, auth.seatId);
    if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
    const ref = await saveService.resolveSquadId(saveId, meta.clubId);
    const mine = ref ? await saveService.getSquad(saveId, ref.leagueSlug, ref.clubSlug) : null;
    if (!mine) return Response.json({ error: "squad not found" }, { status: 404 });

    const from = new URL(req.url).searchParams.get("from");
    let player;
    let freeSince: string | undefined;
    if (from) {
      const src = await saveService.resolveSquadId(saveId, from);
      const squad = src ? await saveService.getSquad(saveId, src.leagueSlug, src.clubSlug) : null;
      player = squad?.players.find((p) => p.id === playerId);
      // On loan at the asking club from `from` (9.8): his demand to stay for good.
      if (!player && mine) {
        const lent = loanedInFrom(mine, playerId, from);
        if (lent) player = { ...lent, loan: undefined };
      }
    } else {
      const agent = (await saveService.getFreeAgents(saveId)).find((f) => f.player.id === playerId);
      player = agent?.player;
      freeSince = agent?.since;
    }
    if (!player) return Response.json({ error: "player not found" }, { status: 404 });
    const date = meta.currentDate ?? new Date().toISOString().slice(0, 10);
    // Own player: the morale behind the demand (an unhappy one asks more, a furious one refuses).
    const own = !from || from === mine.id ? mine.players.find((p) => p.id === playerId) : undefined;
    // One of ours out on loan: still a renewal at his own club (same context as the renew route).
    const lentOut = !own && (await saveService.getMarket(saveId, auth.seatId))?.loans?.some((l) => l.playerId === playerId && l.fromClubId === mine.id);
    const renewal = !!own || !!lentOut;
    // Personality parts of the demand (`personality.md`): where he comes from = his club, or the
    // last club of a free agent.
    const fromSquad = renewal ? null : from ? await saveService.getSquadById(saveId, from) : await lastClubOf(saveId, player);
    const { negotiation, fame } = await managerDemandCtx(saveId, auth.seatId);
    // A fee-free arrival has rivals (4.47.9). A pre-contract (`?pre=1`) asks more wage and a signing bonus; a free agent
    // (no `from`) asks neither and less the longer he waits (12.28.5).
    const freeKind = renewal ? null : !from ? "free" as const : new URL(req.url).searchParams.get("pre") === "1" ? "pre" as const : null;
    const b = demandBreakdown(player, mine, date, {
      fromSquad, renewal, negotiation, fame, ...(freeKind ? freeArrivalCtx(freeKind, freeSince) : {}),
    });
    const freeCtx = freeKind ? await freeSigningContext(saveService, saveId, { player, kind: freeKind, from: fromSquad ?? null, date, since: freeSince }) : null;
    // The explanation lines: exact for our own players; for anyone else, what the chief scout sees
    // (`obscurePersonality`) — nothing when he is unsure. `demand` (and the refusal on submit) stay real.
    let parts: Record<string, number | boolean | string> = {};
    if (renewal) {
      const renewableOn = renewalAvailableOn(player.contract, date);
      parts = {
        ambition: b.ambition, loyalty: b.loyalty, ...(player.contract ? { currentWage: player.contract.wage } : {}),
        ...(b.renewalCap !== undefined ? { renewalCap: b.renewalCap } : {}),
      };
      if (renewableOn) parts.renewableOn = renewableOn;
    } else {
      // Poor facilities of our club (a signing only): the club's own condition, always known.
      parts = {
        facilities: b.facilities,
        ...(b.freeDays !== undefined ? { freeDays: b.freeDays, freeWait: b.freeWait } : {}),
        ...(b.freeVeteran !== 1 ? { freeVeteran: b.freeVeteran } : {}),
      };
      // The uncertainty of this very player (`.claude/rules/game/scouting.md`).
      const viewer = await loadViewer(saveService, saveId, auth.seatId);
      const noise = viewer ? viewFor(viewer, player, fromSquad?.leagueSlug ?? (from ? (await saveService.getSquadIndex(saveId)).byId(from)?.leagueSlug ?? "" : "")).noise : 0;
      const view = obscurePersonality(personalityOf(player), noise, saveId, player.id);
      if (!view.uncertain && Object.values(view.traits).every((v) => v !== null)) {
        const seen = demandBreakdown({ ...player, personality: view.traits as Personality }, mine, date, { fromSquad });
        parts = {
          ...parts, ambition: seen.ambition, compatriot: seen.compatriot, smallerClub: seen.smallerClub, refusesSmallerClub: seen.refuses,
          refusesPoorFacilities: seen.refusesFacilities,
        };
      }
    }
    const aiSeller = !!from && !renewal && from !== mine.id && !(await saveService.seatOfClub(saveId, from));
    return Response.json({
      demand: b.demand,
      ...parts,
      // The club's weekly wage bill and revenue (report 2026-11-18): the window warns past PAYROLL_WARN_SHARE.
      payroll: { bill: squadWeeklyWages(mine.players, wageFactorOf(mine)), weeklyRevenue: Math.round(wageRevenueBasisOf(mine) / 52) },
      ...(aiSeller && !player.loan ? { clause: releaseClause(player) } : {}),
      // Productivity contract (12.32): a player of 30+ may take part of it as a bonus; his goals per game value it.
      ...(productivityAllowed(player) && !(renewal && player.loan) ? { productivity: { goalsPerGame: Math.round(goalsPerGame(player) * 1000) / 1000 } } : {}),
      ...(b.negotiation !== 1 ? { negotiation: b.negotiation } : {}),
      ...(b.fame !== 1 ? { fame: b.fame } : {}),
      ...(freeCtx ? { ...(freeCtx.ask > 0 ? { bonusAsk: freeCtx.ask } : {}), rivals: freeCtx.rivals.map((r) => r.rival.clubName) } : {}),
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
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });

    let body: unknown;
    try { body = await req.json(); } catch { return Response.json({ error: "invalid body" }, { status: 400 }); }
    // A free agent signs without a signing bonus (12.28.5): a `bonus` field is ignored.
    const { wage, years, productivity: rawBonus } = (body ?? {}) as Record<string, unknown>;
    if (typeof wage !== "number" || !Number.isFinite(wage) || typeof years !== "number") {
      return Response.json({ error: "missing or invalid fields" }, { status: 400 });
    }
    const bonus = parseContractBonus(rawBonus);
    if (bonus === "invalid") return Response.json({ error: "invalidBonus" }, { status: 400 });

    return withSaveLock(saveId, async () => {
      const meta = await saveService.getSeatMeta(saveId, auth.seatId);
      if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
      const ref = await saveService.resolveSquadId(saveId, meta.clubId);
      if (!ref) return Response.json({ error: "squad not found" }, { status: 404 });
      const squad = await saveService.getSquad(saveId, ref.leagueSlug, ref.clubSlug);
      if (!squad) return Response.json({ error: "squad not found" }, { status: 404 });
      const pool = await saveService.getFreeAgents(saveId);
      const agent = pool.find((f) => f.player.id === playerId);
      if (!agent) return Response.json({ error: "player not found" }, { status: 404 });
      if ((await humanRosterSize(saveService, saveId, auth.seatId, squad)) >= HUMAN_MAX_SQUAD) return Response.json({ error: "squadFull" }, { status: 400 });

      const date = meta.currentDate ?? new Date().toISOString().slice(0, 10);
      const { negotiation, fame } = await managerDemandCtx(saveId, auth.seatId);
      const lastClub = await lastClubOf(saveId, agent.player);
      const arrival = freeArrivalCtx("free", agent.since);
      const check = evaluateContractOffer({ wage, years, productivity: bonus }, agent.player, squad, date, { fromSquad: lastClub, negotiation, fame, ...arrival });
      // The AI clubs after him (4.47.9); no signing bonus for a free agent (12.28.5).
      const free = await freeSigningContext(saveService, saveId, { player: agent.player, kind: "free", from: lastClub, date, since: agent.since });
      if (!check.accepted) return Response.json({ error: check.reason, demand: check.demand }, { status: 400 });
      if (free.rivals.length > 0) {
        const prestige = (await prestigeOf(saveService, saveId, date, [squad.id])).get(squad.id) ?? 0.5;
        const rival = preferredRival({
          human: { pref: { wage: bonus ? wage + expectedWeeklyBonus(agent.player, bonus) : wage, demand: check.demand, prestige, starter: starterChance(agent.player, squad), facilitiesAppeal: facilitiesAppeal(squad, agent.player) }, bonus: 0 },
          rivals: free.rivals, ask: free.ask,
        });
        if (rival) return Response.json({ error: "prefersRival", rival: { clubName: rival.clubName }, demand: check.demand }, { status: 400 });
      }
      // The wage bill ceiling (`finances.md` → "Teto da folha").
      const overCap = payrollCapRefusal(squad, wage);
      if (overCap) return Response.json({ error: "payrollCap", ...overCap, demand: check.demand }, { status: 409 });

      const seasonEnd = (meta.activeLeagues ?? []).find((l) => l.leagueSlug === meta.leagueSlug)?.end
        ?? defaultSeasonEnd(date);
      const contract = { until: addYearsIso(seasonEnd, years - 1), wage, ...(bonus ? { bonus } : {}) };
      await saveService.saveSquad(saveId, ref.leagueSlug, ref.clubSlug, {
        ...squad,
        players: [...squad.players, { ...arriving(agent.player, squad), squadId: squad.id, contract, arrival: { squadId: squad.id, kind: "free", on: date } }],
      });
      await saveService.writeFreeAgents(saveId, pool.filter((f) => f.player.id !== playerId));
      // In the day log like every other move (achievements: free signings, `.claude/rules/game/achievements.md`).
      await saveService.appendDayTransfers(saveId, date, [{ playerId, from: "", to: squad.id, fee: 0, kind: "free", date }]);
      return Response.json({ contract });
    });
  },
};
