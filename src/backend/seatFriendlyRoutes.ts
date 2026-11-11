import { randomUUID } from "node:crypto";
import { requireSeat } from "@/backend/auth/middleware";
import { nextClubOfficialDate } from "@/backend/advanceUntil";
import { getLeagueData } from "@/backend/advanceDay";
import { countryByLeague } from "@/backend/cupWorld";
import { emitInboxMessage } from "@/Domain/inbox/inboxEvents";
import { withSaveLock } from "@/backend/saveLock";
import { saveService, type SaveService } from "@/backend/SaveService";
import { addDays } from "@/Domain/dates";
import {
  SEAT_FRIENDLY, friendlyBusyDays, inviteRefusal, openFriendlies, pickFriendlyDate, pruneFriendlies, type SeatFriendly,
} from "@/Domain/friendlies/seatFriendly";
import { buildFriendlyInviteMessage } from "@/Domain/inbox/worldAdvanceMessage";
import { countryBlockedDays } from "@/Domain/national/fifaCalendar";
import type { SeatState } from "@/types/seatTypes";

type Req = Request & { params: Record<string, string> };

/** Official game days of a club from `from` to `to` (league, cup, continental). */
async function officialDays(service: SaveService, saveId: string, leagueSlug: string, clubId: string, from: string, to: string): Promise<string[]> {
  const out: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    const next = await nextClubOfficialDate(service, saveId, leagueSlug, clubId, cursor);
    if (!next || next > to) break;
    out.push(next);
    cursor = addDays(next, 1);
  }
  return out;
}

const managerOf = (s: SeatState) => s.manager?.name ?? s.clubName ?? "";

/** What a seat sees of a friendly. */
function view(f: SeatFriendly, me: string, names: Map<string, { manager: string; club: string }>) {
  const other = f.fromSeat === me ? f.toSeat : f.fromSeat;
  return {
    id: f.id, date: f.date, status: f.status, home: f.fromSeat === me, mine: f.fromSeat === me,
    otherSeat: other, otherManager: names.get(other)?.manager ?? "", otherClub: names.get(other)?.club ?? "",
    ...(f.score ? { score: f.score } : {}),
  };
}

export const seatFriendlyRoutes = {
  /** The friendlies of the asking seat; POST invites another seat (9.5). */
  "/api/worlds/:saveId/friendlies": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    const meta = await saveService.getMeta(saveId);
    if (!meta) return Response.json({ error: "notFound" }, { status: 404 });
    if (meta.mode !== "multi" || !meta.world) return Response.json({ error: "notMulti" }, { status: 409 });
    const seats = await saveService.listSeats(saveId);
    const names = new Map(seats.map((s) => [s.seatId, { manager: managerOf(s.seat), club: s.seat.clubName ?? "" }]));

    if (req.method === "GET") {
      const list = (meta.seatFriendlies ?? []).filter((f) => f.fromSeat === auth.seatId || f.toSeat === auth.seatId);
      return Response.json({ friendlies: list.map((f) => view(f, auth.seatId, names)).reverse() });
    }
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    if (meta.world.phase !== "running") return Response.json({ error: "lobby" }, { status: 409 });
    const body = await req.json().catch(() => null) as { seat?: unknown } | null;
    const toSeat = typeof body?.seat === "string" ? body.seat : "";
    return withSaveLock(saveId, async () => {
      const m = (await saveService.getMeta(saveId))!;
      const today = m.currentDate ?? "";
      const me = await saveService.getSeat(saveId, auth.seatId);
      const other = toSeat ? await saveService.getSeat(saveId, toSeat) : null;
      if (!me || !other) return Response.json({ error: "notFound" }, { status: 404 });
      if (!me.clubId || !other.clubId || me.unemployed || other.unemployed) return Response.json({ error: "noClub" }, { status: 409 });
      const list = pruneFriendlies(m.seatFriendlies, today);
      const refusal = inviteRefusal({ list, fromSeat: auth.seatId, toSeat });
      if (refusal) return Response.json({ error: refusal }, { status: 409 });
      const to = addDays(today, SEAT_FRIENDLY.HORIZON + 1);
      const catalog = countryByLeague(await getLeagueData());
      const busy = new Set([
        ...await officialDays(saveService, saveId, me.leagueSlug!, me.clubId, today, to),
        ...await officialDays(saveService, saveId, other.leagueSlug!, other.clubId, today, to),
        ...friendlyBusyDays(list, [me.clubId, other.clubId]),
      ]);
      const blocked = new Set([
        ...countryBlockedDays(catalog.get(me.leagueSlug!), today, to),
        ...countryBlockedDays(catalog.get(other.leagueSlug!), today, to),
      ]);
      const date = pickFriendlyDate(today, busy, blocked);
      if (!date) return Response.json({ error: "noDate" }, { status: 409 });
      const friendly: SeatFriendly = {
        id: randomUUID(), fromSeat: auth.seatId, toSeat, fromClub: me.clubId, toClub: other.clubId,
        date, status: "pending", createdOn: today,
      };
      await saveService.updateMeta(saveId, { seatFriendlies: [...list, friendly] });
      await emitInboxMessage(saveId, buildFriendlyInviteMessage({
        kind: "friendly_invite", date: today, friendlyId: friendly.id, match: date, managerName: managerOf(me), clubName: me.clubName ?? "",
      }), saveService, toSeat);
      return Response.json({ friendly: view(friendly, auth.seatId, names) });
    });
  },

  /** Accept / decline (the invited seat) or cancel (either) a friendly. */
  "/api/worlds/:saveId/friendlies/:friendlyId": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = await req.json().catch(() => null) as { action?: unknown } | null;
    const action = body?.action;
    if (action !== "accept" && action !== "decline" && action !== "cancel") return Response.json({ error: "invalidAction" }, { status: 400 });
    return withSaveLock(saveId, async () => {
      const m = await saveService.getMeta(saveId);
      if (!m) return Response.json({ error: "notFound" }, { status: 404 });
      const today = m.currentDate ?? "";
      const list = pruneFriendlies(m.seatFriendlies, today);
      const f = list.find((x) => x.id === req.params.friendlyId && (x.fromSeat === auth.seatId || x.toSeat === auth.seatId));
      if (!f) return Response.json({ error: "notFound" }, { status: 404 });
      if (!openFriendlies([f]).length || f.date <= today) return Response.json({ error: "closed" }, { status: 409 });
      if ((action === "accept" || action === "decline") && (f.toSeat !== auth.seatId || f.status !== "pending")) {
        return Response.json({ error: "notYours" }, { status: 403 });
      }
      const status = action === "accept" ? "accepted" : action === "decline" ? "declined" : "cancelled";
      const next = list.map((x) => (x.id === f.id ? { ...x, status } as SeatFriendly : x));
      await saveService.updateMeta(saveId, { seatFriendlies: next });
      const me = await saveService.getSeat(saveId, auth.seatId);
      const otherSeat = f.fromSeat === auth.seatId ? f.toSeat : f.fromSeat;
      if (me) {
        await emitInboxMessage(saveId, buildFriendlyInviteMessage({
          kind: action === "accept" ? "friendly_accepted" : action === "decline" ? "friendly_declined" : "friendly_cancelled",
          date: today, friendlyId: f.id, match: f.date, managerName: managerOf(me), clubName: me.clubName ?? "",
        }), saveService, otherSeat);
      }
      return Response.json({ status });
    });
  },
};
