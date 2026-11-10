import { requireSeat } from "@/backend/auth/middleware";
import { betQuotes, betsView, isBettableCompetition, walletOf } from "@/backend/betsWorld";
import { withSaveLock } from "@/backend/saveLock";
import { saveService } from "@/backend/SaveService";
import { checkBet, parsePick } from "@/Domain/bets/bets";
import type { Bet } from "@/types/betTypes";

type Req = Request & { params: Record<string, string> };

export const betRoutes = {
  "/api/saves/:saveId/bets": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    const seat = await saveService.getSeatMeta(saveId, auth.seatId);
    if (!seat) return Response.json({ error: "save not found" }, { status: 404 });
    if (req.method === "GET") {
      const query = new URL(req.url).searchParams;
      const competition = query.get("competition") ?? undefined;
      if (competition && !(await isBettableCompetition(saveService, saveId, competition))) return Response.json({ error: "invalidCompetition" }, { status: 400 });
      return Response.json(await betsView(saveService, saveId, auth.seatId, seat, query.get("summary") === "1", competition));
    }
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const pick = parsePick(body?.pick);
    if (!pick || typeof body?.competition !== "string" || typeof body?.fixtureId !== "string") return Response.json({ error: "invalidPick" }, { status: 400 });
    const stake = Number(body.stake);
    const clientOdds = Number(body.odds);
    const { competition, fixtureId } = body as { competition: string; fixtureId: string };
    return withSaveLock(saveId, async () => {
      const fresh = await saveService.getSeatMeta(saveId, auth.seatId);
      if (!fresh) return Response.json({ error: "save not found" }, { status: 404 });
      const quote = (await betQuotes(saveService, saveId, fresh, competition)).find((q) => q.game.competition === competition && q.game.fixtureId === fixtureId);
      if (!quote) return Response.json({ error: "closed" }, { status: 409 });
      const state = await saveService.getBets(saveId, auth.seatId);
      const checked = checkBet({ state, game: { competition, fixtureId }, pick, stake, clientOdds, wallet: walletOf(fresh, state), full: quote.full, offered: quote.game.markets });
      if ("error" in checked) return Response.json({ error: checked.error, ...(checked.odds ? { odds: checked.odds } : {}) }, { status: checked.status });
      const g = quote.game;
      const named = pick.market === "scorer" ? { ...pick, playerName: g.markets.scorers.find((s) => s.playerId === pick.playerId)!.playerName } : pick;
      const bet: Bet = {
        id: crypto.randomUUID(), placedOn: fresh.currentDate!, competition, fixtureId, date: g.date,
        home: g.home, away: g.away, homeName: g.homeName, awayName: g.awayName, pick: named, stake, odds: checked.odds,
      };
      await saveService.writeBets(saveId, { ...state, open: [...state.open, bet] }, auth.seatId);
      return Response.json({ bet });
    });
  },
};
