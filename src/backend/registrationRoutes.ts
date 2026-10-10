/**
 * Registration routes (`.claude/rules/game/registration.md` → Rotas): the human club's lists per competition, a
 * hand-edited list and back to automatic. Writes only with the deadline open.
 */
import { saveService } from "@/backend/SaveService";
import { requireSaveOwner } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { registrationDayCtx, type RegistrationDayCtx } from "@/backend/registrationWorld";
import { automaticList, ensureList, manualList, withList, type CompInfo } from "@/Domain/registration/lists";
import { canAdd, countsOf, validateList } from "@/Domain/registration/rules";
import { clubTrained, domesticNations, isForeign, isFree, isGreenCardHolder, nationTrained } from "@/Domain/registration/formed";
import { preferredRole } from "@/Domain/positions/positionAptitude";
import { overallAvg } from "@/Domain/playerRating";
import type { Squad } from "@/types/playerTypes";
import type { RegistrationCompView, RegistrationRowView } from "@/types/registrationTypes";

type Req = Request & { params: Record<string, string> };

/** One competition as the screen shows it (the list as it would be today, nothing stored). */
export function compView(squad: Squad, info: CompInfo, date: string): RegistrationCompView {
  const withFirst = ensureList(squad, info, date).squad;
  const list = withFirst.registrations![info.slug]!;
  const listed = new Set(list.ids);
  const holder = { squadId: info.ctx.squadId, ctx: info.ctx };
  const rows: RegistrationRowView[] = squad.players.map((p) => {
    const free = isFree(p, info.rule, info.ctx.country, info.ctx.squadId, info.ctx);
    const registered = free || listed.has(p.id);
    const add = registered ? null : canAdd(list.ids, p, squad.players, info.rule, info.ctx);
    return {
      id: p.id, name: p.name, age: p.age, nationality: p.nationality ?? null, role: preferredRole(p), overall: overallAvg(p),
      registered,
      foreign: isForeign(p, info.rule, info.ctx.country, holder),
      greenCard: isGreenCardHolder(p, info.rule, info.ctx.country, holder),
      clubTrained: clubTrained(p, info.ctx.squadId, info.ctx),
      nationTrained: nationTrained(p, info.ctx.country, info.ctx, domesticNations(info.rule, info.ctx.country)),
      free,
      canAdd: !!add?.ok,
      ...(add && !add.ok ? { reason: add.reason } : {}),
    };
  });
  rows.sort((a, b) => Number(b.registered) - Number(a.registered) || b.overall - a.overall || a.id.localeCompare(b.id));
  return {
    slug: info.slug, kind: info.kind, season: info.season, rule: info.rule, status: info.status,
    manual: !!list.manual, exception: !!list.exception,
    counts: countsOf(list.ids, squad.players, info.rule, info.ctx),
    rows,
  };
}

async function humanCtx(saveId: string): Promise<
  Response | { squad: Squad; leagueSlug: string; dctx: RegistrationDayCtx; date: string }
> {
  const meta = await saveService.getMeta(saveId);
  if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
  if (!meta.clubId || meta.unemployed) return Response.json({ error: "noClub" }, { status: 409 });
  const index = await saveService.getSquadIndex(saveId);
  const entry = index.byId(meta.clubId);
  const squad = await saveService.getSquadById(saveId, meta.clubId);
  if (!entry || !squad) return Response.json({ error: "noClub" }, { status: 409 });
  const date = meta.currentDate ?? "";
  return { squad, leagueSlug: entry.leagueSlug, dctx: await registrationDayCtx(saveService, saveId, meta, index, date), date };
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function closedResponse(info: CompInfo): Response {
  return Response.json(
    { error: "registrationClosed", ...(info.status.opensOn ? { opensOn: info.status.opensOn } : {}), ...(info.status.stageStarted ? { stageStarted: true } : {}) },
    { status: 409 },
  );
}

export const registrationRoutes = {
  /** Every competition of the human club with its rule, deadline, counters and players. */
  "/api/saves/:saveId/registration": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const h = await humanCtx(saveId);
    if (h instanceof Response) return h;
    const infos = await h.dctx.infosFor(h.squad, h.leagueSlug);
    return Response.json({ date: h.date, competitions: infos.map((i) => compView(h.squad, i, h.date)) });
  },

  /** `PUT { ids }`: a hand-edited list (manual mode). */
  "/api/saves/:saveId/registration/:competition": async (req: Req) => {
    const { saveId, competition } = req.params;
    const auth = requireSaveOwner(req, saveId!);
    if (auth instanceof Response) return auth;
    if (req.method !== "PUT") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = await readJson(req);
    const ids = body?.ids;
    if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string") || ids.length > 100) {
      return Response.json({ error: "missing or invalid fields" }, { status: 400 });
    }
    return withSaveLock(saveId!, async () => {
      const h = await humanCtx(saveId!);
      if (h instanceof Response) return h;
      const info = await h.dctx.infoFor(h.squad, h.leagueSlug, competition!);
      if (!info) return Response.json({ error: "notInCompetition" }, { status: 404 });
      if (!info.status.open) return closedResponse(info);
      const roster = new Set(h.squad.players.map((p) => p.id));
      if (!(ids as string[]).every((id) => roster.has(id))) return Response.json({ error: "notYourPlayer" }, { status: 400 });
      // Against the list the screen showed (the first list when none is stored yet), so `out` is right.
      const list = manualList(ensureList(h.squad, info, h.date).squad, info, ids as string[], h.date);
      const violations = validateList(list.ids, h.squad.players, info.rule, info.ctx);
      if (violations.length > 0) return Response.json({ error: "ruleViolation", kind: violations[0]!.kind }, { status: 400 });
      const next = withList(h.squad, info.slug, list);
      await saveService.saveSquadById(saveId!, next);
      return Response.json(compView(next, info, h.date));
    });
  },

  /** `POST`: back to the automatic list. */
  "/api/saves/:saveId/registration/:competition/auto": async (req: Req) => {
    const { saveId, competition } = req.params;
    const auth = requireSaveOwner(req, saveId!);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    return withSaveLock(saveId!, async () => {
      const h = await humanCtx(saveId!);
      if (h instanceof Response) return h;
      const info = await h.dctx.infoFor(h.squad, h.leagueSlug, competition!);
      if (!info) return Response.json({ error: "notInCompetition" }, { status: 404 });
      if (!info.status.open) return closedResponse(info);
      const next = withList(h.squad, info.slug, automaticList(h.squad, info, h.date));
      await saveService.saveSquadById(saveId!, next);
      return Response.json(compView(next, info, h.date));
    });
  },
};
