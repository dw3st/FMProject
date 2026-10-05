import { saveService } from "@/backend/SaveService";
import { requireSaveOwner } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { generateReborn } from "@/Domain/retirement/retirement";
import { YOUTH } from "@/Domain/youth/youthConfig";
import type { RetiredPlayer, RosterPlayer, Squad } from "@/types/playerTypes";

type Req = Request & { params: Record<string, string> };

const RETIRED_PAGE_DEFAULT = 50;
const RETIRED_PAGE_MAX = 100;

/** Reborn offers (`.claude/rules/game/retirement.md`): world-class retirees of the human club. */
export const rebornRoutes = {
  /**
   * `GET` - retired players, newest first, with the last club's name (`.claude/rules/game/history.md`).
   * `?offset=&limit=` (limit 1..100, default 50), `?mine=1` = only retirees of the player's club.
   * Response `{ total, items }`; `statsAtRetirement` is left out (only the reborn offer needs it).
   */
  "/api/saves/:saveId/retired": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const q = new URL(req.url).searchParams;
    const int = (v: string | null, def: number) => {
      const n = v === null || v === "" ? def : Number(v);
      return Number.isInteger(n) ? n : NaN;
    };
    const offset = int(q.get("offset"), 0);
    const limit = int(q.get("limit"), RETIRED_PAGE_DEFAULT);
    if (!(offset >= 0) || !(limit >= 1 && limit <= RETIRED_PAGE_MAX)) {
      return Response.json({ error: "invalid offset/limit" }, { status: 400 });
    }
    let retired = [...(await saveService.getRetired(saveId))].reverse();
    if (q.get("mine") === "1") {
      const meta = await saveService.getMeta(saveId);
      retired = retired.filter((r) => r.squadId === meta?.clubId);
    }
    const index = await saveService.getSquadIndex(saveId);
    const items = retired.slice(offset, offset + limit).map(({ statsAtRetirement: _, ...r }) => ({
      ...r,
      clubName: index.byId(r.squadId)?.name ?? r.history?.at(-1)?.clubName ?? null,
    }));
    return Response.json({ total: retired.length, items });
  },

  /** `GET` - the offers still pending. */
  "/api/saves/:saveId/reborn": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const retired = await saveService.getRetired(saveId);
    return Response.json({
      offers: retired.filter((r) => r.rebornOffer === "pending").map((r) => ({
        id: r.id, name: r.name, positions: r.positions, age: r.age, nationality: r.nationality,
      })),
    });
  },

  /** `POST { accept }` - answer an offer. Accept adds a 17-year-old reborn to `squad.youth`. */
  "/api/saves/:saveId/reborn/:retiredId": async (req: Req) => {
    const saveId = req.params.saveId!;
    const retiredId = req.params.retiredId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = (await req.json().catch(() => null)) as { accept?: unknown } | null;
    if (!body || typeof body.accept !== "boolean") return Response.json({ error: "accept required" }, { status: 400 });
    return withSaveLock(saveId, async () => {
      const retired = await saveService.getRetired(saveId);
      const rec = retired.find((r) => r.id === retiredId);
      if (!rec) return Response.json({ error: "not found" }, { status: 404 });
      if (rec.rebornOffer !== "pending") return Response.json({ error: "offerClosed" }, { status: 409 });
      // Only the club the player retired from can take him back (`.claude/rules/game/jobs.md`).
      const owner = await saveService.getMeta(saveId);
      if (!owner || rec.squadId !== owner.clubId) return Response.json({ error: "offerClosed" }, { status: 409 });
      const mark = (status: NonNullable<RetiredPlayer["rebornOffer"]>) =>
        saveService.writeRetired(saveId, retired.map((r) => (r.id === retiredId ? { ...r, rebornOffer: status } : r)));
      if (!body.accept) {
        await mark("declined");
        return Response.json({ ok: true, status: "declined" });
      }
      const meta = await saveService.getMeta(saveId);
      const ref = meta ? await saveService.resolveSquadId(saveId, meta.clubId) : null;
      const squad = ref ? await saveService.getSquad(saveId, ref.leagueSlug, ref.clubSlug) : null;
      if (!meta || !ref || !squad) return Response.json({ error: "squad not found" }, { status: 404 });
      if ((squad.youth ?? []).length >= YOUTH.MAX_SIZE) return Response.json({ error: "youthFull" }, { status: 400 });
      const state = (meta.activeLeagues ?? []).find((l) => l.leagueSlug === meta.leagueSlug);
      const date = meta.currentDate ?? new Date().toISOString().slice(0, 10);
      const year = state?.year ?? Number(date.slice(0, 4));
      const nextSeasonEnd = state?.end ?? `${year + 1}-05-31`;
      const reborn: RosterPlayer = generateReborn({ retired: rec, squad, year, nextSeasonEnd });
      const next: Squad = { ...squad, youth: [...(squad.youth ?? []), reborn] };
      await saveService.saveSquad(saveId, ref.leagueSlug, ref.clubSlug, next);
      await mark("accepted");
      return Response.json({ ok: true, status: "accepted", player: reborn });
    });
  },
};
