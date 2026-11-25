import { openTotal } from "@/Domain/bets/bets";
import { requireSeat } from "@/backend/auth/middleware";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import { recordMoney } from "@/backend/FinancialService";
import { leagueTierOf } from "@/backend/facilityWorld";
import { reputationOf } from "@/backend/jobWorld";
import { withSaveLock } from "@/backend/saveLock";
import { SaveService, type SeatMeta } from "@/backend/SaveService";
import { ledgerSeason } from "@/backend/staffRoutes";
import { BOARD_FANS } from "@/Domain/boardFans/boardFansConfig";
import { attendanceOf, comfortPriceMult } from "@/Domain/facilities/facilities";
import { gateFromAttendance } from "@/Domain/finance/gate";
import { wageRevenueBasisOf } from "@/Domain/finance/wages";
import { managerWallet } from "@/Domain/managers/assets";
import { FOUNDED } from "@/Domain/ownClub/ownClubConfig";
import { isPresident, managerWageCap, parseTicketPrice } from "@/Domain/ownClub/ownClub";
import type { Squad } from "@/types/playerTypes";

type Req = Request & { params: Record<string, string> };

const MAX_BODY = 8 * 1024;

interface Ctx {
  service: SaveService;
  meta: SeatMeta;
  ref: { leagueSlug: string; clubSlug: string };
  squad: Squad;
}

/** The seat's club, or the response to give (404 / 409 `noClub`). */
async function loadClub(service: SaveService, saveId: string, seatId: string): Promise<Ctx | Response> {
  const meta = await service.getSeatMeta(saveId, seatId);
  if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
  if (!meta.clubId || meta.unemployed) return Response.json({ error: "noClub" }, { status: 409 });
  const ref = await service.resolveSquadId(saveId, meta.clubId);
  const squad = ref ? await service.getSquad(saveId, ref.leagueSlug, ref.clubSlug) : null;
  if (!ref || !squad) return Response.json({ error: "noClub" }, { status: 409 });
  return { service, meta, ref, squad };
}

/** Expected crowd and gate of a home league game at a ticket multiplier. */
async function projection(c: Ctx, mult: number): Promise<{ attendance: number; capacity: number; gate: number } | null> {
  const f = c.squad.facilities;
  if (!f?.items) return null;
  const a = attendanceOf(f, {
    followers: c.squad.finances?.followers ?? 0,
    tier: await leagueTierOf(c.ref.leagueSlug),
    fans: c.meta.board?.fans ?? BOARD_FANS.START,
    priceMult: mult,
  });
  return {
    attendance: Math.round(a.attendance),
    capacity: a.capacity,
    gate: gateFromAttendance(a.attendance, "league", false, comfortPriceMult(f) * mult),
  };
}

async function readBody(req: Request): Promise<{ body: Record<string, unknown> | null } | Response> {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return Response.json({ error: "tooLarge" }, { status: 413 });
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY) return Response.json({ error: "tooLarge" }, { status: 413 });
  try {
    const b = JSON.parse(text);
    return { body: b && typeof b === "object" ? b as Record<string, unknown> : null };
  } catch {
    return { body: null };
  }
}

async function walletOf(service: SaveService, saveId: string, seatId: string): Promise<number> {
  const seat = await service.getSeat(saveId, seatId);
  const bets = await service.getBets(saveId, seatId);
  return managerWallet(seat?.managerEarnings, seat?.managerSpent, seat?.betNet, openTotal(bets), seat?.casinoNet);
}

const plain = () => new SaveService(new FileSystemDAL());

/** What the president of a founded club decides (`.claude/rules/game/own-club.md`): ticket price, deposit, own wage. */
export const presidentRoutes = {
  "/api/saves/:saveId/president": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const c = await loadClub(plain(), saveId, auth.seatId);
    if (c instanceof Response) return c;
    if (!isPresident(c.squad, auth.seatId)) return Response.json({ president: false });
    const mult = c.squad.ticketPriceMult ?? 1;
    const reputation = await reputationOf(c.service, saveId, c.meta);
    return Response.json({
      president: true,
      mult,
      wallet: await walletOf(c.service, saveId, auth.seatId),
      wage: c.meta.managerContract?.wage ?? 0,
      wageCap: managerWageCap(wageRevenueBasisOf(c.squad), reputation),
      projection: await projection(c, mult),
    });
  },

  /** `PUT { mult }`: the ticket price multiplier (0.5-2.0, step 0.1). 400 `invalidPrice`. */
  "/api/saves/:saveId/ticket-price": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "PUT") return Response.json({ error: "method not allowed" }, { status: 405 });
    const read = await readBody(req);
    if (read instanceof Response) return read;
    return withSaveLock(saveId, async () => {
      const buffer = new BufferingSaveDAL(new FileSystemDAL());
      const c = await loadClub(new SaveService(buffer), saveId, auth.seatId);
      if (c instanceof Response) return c;
      if (!isPresident(c.squad, auth.seatId)) return Response.json({ error: "notPresident" }, { status: 409 });
      const mult = parseTicketPrice(read.body?.mult);
      if (mult === null) return Response.json({ error: "invalidPrice" }, { status: 400 });
      const squad = { ...c.squad, ticketPriceMult: mult };
      await c.service.saveSquad(saveId, c.ref.leagueSlug, c.ref.clubSlug, squad);
      await buffer.flush();
      return Response.json({ mult, projection: await projection({ ...c, squad }, mult) });
    });
  },

  /** `POST { amount }`: the president puts his own money into the club. 400 `invalidAmount`, 409 `noMoney`. */
  "/api/saves/:saveId/club-deposit": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const read = await readBody(req);
    if (read instanceof Response) return read;
    return withSaveLock(saveId, async () => {
      const buffer = new BufferingSaveDAL(new FileSystemDAL());
      const service = new SaveService(buffer);
      const c = await loadClub(service, saveId, auth.seatId);
      if (c instanceof Response) return c;
      if (!isPresident(c.squad, auth.seatId)) return Response.json({ error: "notPresident" }, { status: 409 });
      const amount = read.body?.amount;
      if (typeof amount !== "number" || !Number.isInteger(amount) || amount < FOUNDED.DEPOSIT_MIN) {
        return Response.json({ error: "invalidAmount" }, { status: 400 });
      }
      const wallet = await walletOf(service, saveId, auth.seatId);
      if (amount > wallet) return Response.json({ error: "noMoney" }, { status: 409 });
      const seat = await service.getSeat(saveId, auth.seatId);
      const date = c.meta.currentDate ?? "";
      await service.updateSeat(saveId, auth.seatId, { managerSpent: (seat?.managerSpent ?? 0) + amount });
      const updated = await recordMoney(service, saveId, await ledgerSeason(service, saveId, c.ref.leagueSlug, date), c.ref, {
        date, kind: "club_change", amount, label: "President's deposit", ref: { stage: "deposit" },
      }, auth.seatId);
      await buffer.flush();
      return Response.json({ balance: updated.finances?.budget ?? 0, wallet: wallet - amount });
    });
  },

  /** `PUT { wage }`: the president's own weekly wage, 0 to the cap of his reputation. 400 `invalidWage`. */
  "/api/saves/:saveId/manager-wage": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "PUT") return Response.json({ error: "method not allowed" }, { status: 405 });
    const read = await readBody(req);
    if (read instanceof Response) return read;
    return withSaveLock(saveId, async () => {
      const c = await loadClub(plain(), saveId, auth.seatId);
      if (c instanceof Response) return c;
      if (!isPresident(c.squad, auth.seatId)) return Response.json({ error: "notPresident" }, { status: 409 });
      const contract = c.meta.managerContract;
      if (!contract) return Response.json({ error: "noClub" }, { status: 409 });
      const cap = managerWageCap(wageRevenueBasisOf(c.squad), await reputationOf(c.service, saveId, c.meta));
      const wage = read.body?.wage;
      if (typeof wage !== "number" || !Number.isInteger(wage) || wage < 0 || wage > cap) {
        return Response.json({ error: "invalidWage" }, { status: 400 });
      }
      await c.service.updateSeat(saveId, auth.seatId, { managerContract: { ...contract, wage } });
      return Response.json({ wage, wageCap: cap });
    });
  },
};
