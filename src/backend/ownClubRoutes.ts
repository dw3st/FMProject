import { saveService, SaveService } from "@/backend/SaveService";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import { requireSeat } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { checkFounding, foundClub, foundClubOptions } from "@/backend/ownClubWorld";
import { nudgeSeats, type SeatNudges } from "@/backend/seatOfferWorld";
import { parseIdentity } from "@/Domain/ownClub/ownClub";
import { logError } from "@/Logger";

type Req = Request & { params: Record<string, string> };

const MAX_BODY = 8 * 1024;

/** Founding the manager's own club (`.claude/rules/game/own-club.md`). */
export const ownClubRoutes = {
  /**
   * `GET` - unlock state and the lowest-division clubs; `POST { squadId, name, shortName, colors }` - found it.
   * 409 `locked`, `alreadyFounded`, `humanClub`, `continental`, `lobby`; 400 `notLowest`, `invalidIdentity`; 404 `notFound`.
   */
  "/api/saves/:saveId/found-club": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method === "GET") {
      const meta = await saveService.getSeatMeta(saveId, auth.seatId);
      if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
      return Response.json(await foundClubOptions(saveService, saveId, meta));
    }
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return Response.json({ error: "tooLarge" }, { status: 413 });
    const text = await req.text();
    if (new TextEncoder().encode(text).length > MAX_BODY) return Response.json({ error: "tooLarge" }, { status: 413 });
    let body: unknown = null;
    try { body = JSON.parse(text); } catch { body = null; }
    const squadId = (body as { squadId?: unknown } | null)?.squadId;
    if (typeof squadId !== "string" || squadId.length === 0 || squadId.length > 80) {
      return Response.json({ error: "squadId required" }, { status: 400 });
    }
    return withSaveLock(saveId, async () => {
      const meta = await saveService.getSeatMeta(saveId, auth.seatId);
      if (!meta?.currentDate) return Response.json({ error: "save not found" }, { status: 404 });
      const check = await checkFounding(saveService, saveId, meta, squadId);
      if (!check.ok) return Response.json({ error: check.error }, { status: check.status });
      const parsed = parseIdentity(body);
      if (!parsed.ok) return Response.json({ error: "invalidIdentity" }, { status: 400 });
      const buffer = new BufferingSaveDAL(new FileSystemDAL());
      const service = new SaveService(buffer);
      const nudges: SeatNudges = new Set();
      let next;
      try {
        next = await foundClub(service, saveId, auth.seatId, squadId, parsed.identity, nudges);
        await buffer.flush();
      } catch (err) {
        logError("ownClub", `save ${saveId}: failed to found ${squadId}`, err);
        return Response.json({ error: "failed to found the club" }, { status: 500 });
      }
      nudgeSeats(saveId, nudges);
      saveService.dropSquadIndex(saveId);
      return Response.json({ ok: true, clubId: next.clubId, leagueSlug: next.leagueSlug });
    });
  },
};
