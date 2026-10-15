import { shownProfile } from "@/Domain/achievements/items";
import { saveService } from "@/backend/SaveService";
import { requireSeat } from "@/backend/auth/middleware";
import { getLeagueData } from "@/backend/advanceDay";
import { rankManagers, rankingPage } from "@/Domain/managers/managers";
import { managerFaceCountry } from "@/Domain/faces/managerFace";
import { clubCountryResolver } from "@/backend/matchCrowd";

type Req = Request & { params: Record<string, string> };

const PAGE_DEFAULT = 50;
const PAGE_MAX = 100;

/** Manager ranking (`.claude/rules/game/managers.md`). */
export const managerRoutes = {
  /**
   * `GET` - `?scope=world|country|free` (country = the player's league country; free = managers
   * without a club), `?offset=&limit=`
   * (limit 1..100, default 50). Response `{ total, playerRank, items }`; each item carries its rank
   * within the scope, the club's name and the full title list (the human manager also his club passages).
   */
  "/api/saves/:saveId/managers": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const q = new URL(req.url).searchParams;
    const int = (v: string | null, def: number) => {
      const n = v === null || v === "" ? def : Number(v);
      return Number.isInteger(n) ? n : NaN;
    };
    const offset = int(q.get("offset"), 0);
    const limit = int(q.get("limit"), PAGE_DEFAULT);
    const scope = q.get("scope") ?? "world";
    if (!(offset >= 0) || !(limit >= 1 && limit <= PAGE_MAX) || (scope !== "world" && scope !== "country" && scope !== "free")) {
      return Response.json({ error: "invalid offset/limit/scope" }, { status: 400 });
    }
    const meta = await saveService.getSeatMeta(saveId, auth.seatId);
    if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
    // A manager who left the world keeps his seat id but no seat (part 2): he counts as free.
    const liveSeats = new Set((await saveService.getMeta(saveId))?.seats ?? []);
    const index = await saveService.getSquadIndex(saveId);
    const clubCountry = await clubCountryResolver(saveService, saveId);
    // National-team coaches (`nat_…`, `.claude/rules/game/national-teams.md`): the nation is the "club" and the country.
    const national = await saveService.getNationalState(saveId);
    const nationOf = (id: string | undefined) => (id && id.startsWith("nat_") ? national?.teams[id]?.nation ?? null : null);
    const countryOfClub = (id: string) => nationOf(id) ?? clubCountry(id);
    const clubNameOf = (id: string) => nationOf(id) ?? index.byId(id)?.name ?? null;
    const myCountry = countryOfClub(meta.clubId)
      ?? (await getLeagueData()).find((l) => l.slug === meta.leagueSlug)?.country ?? null;
    // Retired managers (free for too long) leave the ranking tab (`.claude/rules/game/managers.md`).
    const page = rankingPage(
      rankManagers((await saveService.getManagers(saveId)).filter((m) => !m.retired)),
      scope === "world" ? () => true
        : scope === "free" ? (m) => !m.squadId && (!m.seatId || !liveSeats.has(m.seatId))
        : (m) => myCountry !== null && countryOfClub(m.squadId) === myCountry,
      offset, limit, auth.seatId,
    );
    const mine = (m: { seatId?: string }) => m.seatId === auth.seatId;
    // The asking seat's manager's profile items (`.claude/rules/game/achievements.md`): frame, title, badges.
    const profile = page.items.some(mine) ? shownProfile(await saveService.getAchievements(saveId, auth.seatId)) : null;
    return Response.json({
      ...page,
      items: page.items.map((m) => ({
        ...m,
        isPlayer: mine(m),
        clubName: m.squadId ? clubNameOf(m.squadId) : null,
        ...(m.squadId.startsWith("nat_") ? { national: true } : {}),
        free: !m.squadId,
        interim: !!m.interim,
        // Season awards (Etapa 32): best manager of a league, world manager of the year.
        awards: m.awards ?? [],
        // Every manager's passages (Etapa 25), with the clubs' names.
        clubs: (m.clubs ?? []).map((c) => ({ ...c, clubName: clubNameOf(c.squadId) })),
        ...(mine(m) ? { earnings: meta.managerEarnings ?? 0, ...(profile ? { profile } : {}) } : {}),
        // Face (Etapa 31b): shirt in the current club's colours; the human manager's saved avatar and
        // nationality, an AI manager's appearance from the country of his first club (stable).
        clubColors: m.squadId ? index.byId(m.squadId)?.colors ?? null : null,
        ...(mine(m)
          ? { face: meta.manager?.face ?? null, nationality: managerFaceCountry(meta.manager?.nationalityIso) }
          : { nationality: countryOfClub(m.clubs?.[0]?.squadId ?? m.squadId) }),
      })),
    });
  },
};
