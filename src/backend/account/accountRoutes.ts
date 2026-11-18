// Routes of the account profile (`docs/superpowers/specs/2026-11-18-account-profile-design.md`).
import { requireAuth } from "@/backend/auth/middleware";
import { areFriends, findUserByNickname, getSocialUser } from "@/backend/social/socialStore";
import { addTactic, countTactics, deleteTactic, getProfileRow, listCareers, listTactics, setBadges, userCreatedAt } from "@/backend/account/accountStore";
import { cleanPresetName, importPreset, PRESET_CODE_MAX } from "@/Domain/tactics/lineupPresets";
import { backfillAccount } from "@/backend/account/accountWorld";
import { accountAchievements, accountSummary, parseBadges, shownBadges } from "@/Domain/account/accountProfile";
import type { AccountProfileView, StoredCareer } from "@/types/accountTypes";

const MAX_BODY_BYTES = 4 * 1024;
/** Tactics kept in one account. */
export const MAX_ACCOUNT_TACTICS = 30;
const MAX_TACTIC_BODY = 8 * 1024;

export function accountProfileView(userId: string, nickname: string, mine: boolean): AccountProfileView {
  const careers: StoredCareer[] = listCareers(userId);
  const summary = accountSummary(careers);
  const achievements = accountAchievements(careers, summary);
  const latest = careers.find((c) => !c.deleted) ?? careers[0];
  const created = userCreatedAt(userId);
  return {
    nickname,
    since: created ? new Date(created).toISOString().slice(0, 10) : "",
    face: latest ? {
      managerId: `seat:${latest.seatId}`, saveId: latest.saveId,
      ...(latest.face ? { face: latest.face } : {}),
      ...(latest.nationalityIso ? { nationalityIso: latest.nationalityIso } : {}),
      ...(latest.clubColors ? { clubColors: latest.clubColors } : {}),
    } : null,
    summary,
    achievements,
    badges: shownBadges(getProfileRow(userId).badges, achievements),
    careers: careers.map((c) => ({
      saveId: c.saveId, managerName: c.managerName, mode: c.mode, date: c.date, clubName: c.clubName,
      clubs: [...new Map(c.passages.filter((p) => !p.national).map((p) => [p.squadId, { squadId: p.squadId, clubName: p.clubName }])).values()],
      seasons: c.seasons,
      titles: c.titles.filter((t) => t.kind !== "promotion").length,
      deleted: c.deleted,
    })),
    mine,
  };
}

async function readJson(req: Request, max = MAX_BODY_BYTES): Promise<Record<string, unknown> | null | "tooLarge"> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return "tooLarge";
  const text = await req.text();
  if (new TextEncoder().encode(text).length > max) return "tooLarge";
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const accountRoutes = {
  "/api/account/profile": {
    async GET(req: Request) {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      const me = getSocialUser(auth.userId);
      if (!me?.nickname) return Response.json({ error: "noNickname" }, { status: 409 });
      const asked = new URL(req.url).searchParams.get("nickname");
      if (asked && asked.toLowerCase() !== me.nickname.toLowerCase()) {
        const other = findUserByNickname(asked);
        if (!other?.nickname || !areFriends(auth.userId, other.id)) return Response.json({ error: "notFound" }, { status: 404 });
        await backfillAccount(other.id);
        return Response.json(accountProfileView(other.id, other.nickname, false));
      }
      await backfillAccount(auth.userId);
      return Response.json(accountProfileView(auth.userId, me.nickname, true));
    },
  },
  "/api/account/badges": {
    async PUT(req: Request) {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      const body = await readJson(req);
      if (body === "tooLarge") return Response.json({ error: "tooLarge" }, { status: 413 });
      const view = accountAchievements(listCareers(auth.userId));
      const badges = parseBadges(body?.badges, view);
      if (!badges) return Response.json({ error: "invalidBadges" }, { status: 400 });
      setBadges(auth.userId, badges);
      return Response.json({ badges });
    },
  },
  /** The account's tactics library: saved line-up codes (`exportPreset`), usable in any save. */
  "/api/account/tactics": {
    GET(req: Request) {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      return Response.json({ tactics: listTactics(auth.userId), max: MAX_ACCOUNT_TACTICS });
    },
    async POST(req: Request) {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      const body = await readJson(req, MAX_TACTIC_BODY);
      if (body === "tooLarge") return Response.json({ error: "tooLarge" }, { status: 413 });
      const code = typeof body?.code === "string" ? body.code.trim() : "";
      const name = typeof body?.name === "string" ? cleanPresetName(body.name) : "";
      if (!name || !code || code.length > PRESET_CODE_MAX || !importPreset(code, "2000-01-01")) {
        return Response.json({ error: "invalidTactic" }, { status: 400 });
      }
      if (countTactics(auth.userId) >= MAX_ACCOUNT_TACTICS) return Response.json({ error: "full" }, { status: 409 });
      return Response.json({ tactic: addTactic(auth.userId, name, code) }, { status: 201 });
    },
  },
  "/api/account/tactics/:id": {
    DELETE(req: Request & { params?: Record<string, string> }) {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      const id = req.params?.id ?? "";
      if (!deleteTactic(auth.userId, id)) return Response.json({ error: "notFound" }, { status: 404 });
      return Response.json({ ok: true });
    },
  },
};
