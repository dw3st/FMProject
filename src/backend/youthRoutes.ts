import { autoReleased, parseAutoRelease } from "@/Domain/youth/autoRelease";
import { recordPromotion } from "@/Domain/achievements/progress";
import { saveService } from "@/backend/SaveService";
import { requireSeat } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { HUMAN_MAX_SQUAD, toFreeAgent } from "@/Domain/contracts/freeAgents";
import { humanRosterSize } from "@/backend/negotiationWorld";
import { overallAvg } from "@/Domain/playerRating";
import { firstProWage } from "@/Domain/contracts/firstContract";
import { potentialBand } from "@/Domain/youth/youth";
import { DEFAULT_YOUTH_PLAN, parsePlayerTraining, parseYouthPlan, TRAINING_POSITIONS, youthTrendDelta } from "@/Domain/youth/youthTraining";
import { managerSavesPlan, youthCoachOnDuty } from "@/Domain/youth/youthCoach";
import { youthByCoach } from "@/Domain/responsibilities/director";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { SeatMeta } from "@/backend/SaveService";
import { goalStatus, parseGoal, promotionPicks } from "@/Domain/youth/youthGoals";
import { memberStars } from "@/Domain/staff/staff";
import { coursePriceOf } from "@/Domain/staff/trustedStaff";

type Req = Request & { params: Record<string, string> };

/** At most this many ids in one `release-many` / `promote-many` call. */
const MAX_BATCH = 50;

function parseIds(body: unknown): string[] | null {
  const ids = (body as { ids?: unknown } | null)?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_BATCH || !ids.every((i) => typeof i === "string")) return null;
  return [...new Set(ids as string[])];
}

/** An academy player in the first team: first professional wage (`firstProWage`), the base contract's end, arrival from the academy. */
function promotedPlayer(squad: Squad, player: RosterPlayer & { contract: NonNullable<RosterPlayer["contract"]> }, date: string): RosterPlayer {
  return {
    ...player,
    contract: { until: player.contract.until, wage: firstProWage(squad, player) },
    arrival: { squadId: squad.id, kind: "academy", on: date },
  };
}

export type PromoteSkipReason = "squadFull" | "notFound" | "noContract";

async function loadHumanSquad(saveId: string, seatId: string) {
  const meta = await saveService.getSeatMeta(saveId, seatId);
  if (!meta) return null;
  const ref = await saveService.resolveSquadId(saveId, meta.clubId);
  if (!ref) return null;
  const squad = await saveService.getSquad(saveId, ref.leagueSlug, ref.clubSlug);
  if (!squad) return null;
  return { meta, ref, squad };
}

/**
 * The youth coach card of the academy tab (report 2026-11-16): who he is, whether he runs the academy, what he did
 * this week (call-ups, training) and his promotion picks. Null without a youth coach.
 */
function coachCard(squad: Squad, meta: Pick<SeatMeta, "responsibilities" | "youthCallUps"> | undefined) {
  const m = (squad.staff?.members ?? []).find((x) => x.role === "youthCoach");
  if (!m) return null;
  const inCharge = youthByCoach(meta?.responsibilities) && youthCoachOnDuty(squad);
  const calls = meta?.youthCallUps ?? {};
  const plan = squad.youthTraining;
  return {
    id: m.id, name: m.name, age: m.age, ...(m.nationality ? { nationality: m.nationality } : {}),
    stars: memberStars(m), ...(m.contract ? { until: m.contract.until } : {}),
    ...(m.course ? { courseUntil: m.course.until } : {}),
    coursePrice: coursePriceOf(m),
    responsibility: youthByCoach(meta?.responsibilities),
    inCharge,
    week: {
      u21: (calls.u21 ?? []).filter((c) => c.byCoach).length,
      u19: (calls.u19 ?? []).filter((c) => c.byCoach).length,
      intensity: plan?.intensityByCoach ? plan.intensity : null,
      focused: Object.values(plan?.players ?? {}).filter((e) => e.byCoach).length,
    },
    picks: inCharge ? promotionPicks(squad) : [],
  };
}

function youthView(squad: Squad, meta: Pick<SeatMeta, "responsibilities" | "youthCallUps" | "currentDate"> | undefined) {
  const date = meta?.currentDate ?? "";
  const youth = (squad.youth ?? []).map((player) => {
    const [lo, hi] = potentialBand(player);
    const overall = overallAvg(player);
    const goal = squad.youthGoals?.[player.id];
    return {
      player, overall, potential: { low: lo, high: hi }, trend: youthTrendDelta(player),
      ...(goal ? { goal: { ...goal, status: goalStatus(goal, overall, date) } } : {}),
    };
  });
  return {
    youth, squadSize: squad.players.length, squadLimit: HUMAN_MAX_SQUAD,
    training: squad.youthTraining ?? DEFAULT_YOUTH_PLAN, positions: TRAINING_POSITIONS,
    // The youth coach looks after the academy's training (`youthCoach.ts`): the screen says so.
    coach: youthByCoach(meta?.responsibilities) && youthCoachOnDuty(squad),
    coachCard: coachCard(squad, meta),
    autoRelease: squad.youthAutoRelease ?? null,
  };
}

/**
 * Youth academy (`.claude/rules/game/youth.md`): the human club's `squad.youth` list, promotion into
 * the squad (limit 30) and release into the free-agent pool. Only the owner of the save may call.
 */
export const youthRoutes = {
  "/api/saves/:saveId/youth": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const found = await loadHumanSquad(saveId, auth.seatId);
    if (!found) return Response.json({ error: "squad not found" }, { status: 404 });
    return Response.json(youthView(found.squad, found.meta));
  },

  /**
   * `PUT { intensity, focus, players }` - the academy training plan (`youthTraining.ts`). Free in the lobby, like the
   * tactics. 400 `invalidTraining`.
   */
  "/api/saves/:saveId/youth/training": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "PUT") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = await req.json().catch(() => null);
    return withSaveLock(saveId, async () => {
      const found = await loadHumanSquad(saveId, auth.seatId);
      if (!found) return Response.json({ error: "noClub" }, { status: 409 });
      const plan = parseYouthPlan(body, new Set((found.squad.youth ?? []).map((p) => p.id)));
      if (!plan) return Response.json({ error: "invalidTraining" }, { status: 400 });
      // What the manager left as the youth coach wrote it keeps the coach's mark (`managerSavesPlan`).
      const next: Squad = { ...found.squad, youthTraining: managerSavesPlan(found.squad.youthTraining, plan) };
      await saveService.saveSquad(saveId, found.ref.leagueSlug, found.ref.clubSlug, next);
      return Response.json(youthView(next, found.meta));
    });
  },

  /**
   * `PUT { focus, position }` - a first-team player's individual training (4.39); `{}` (or nulls) clears it. Free in
   * the lobby, like the tactics. 400 `invalidTraining`, 404 `notYourPlayer`.
   */
  "/api/saves/:saveId/players/:playerId/training": async (req: Req) => {
    const saveId = req.params.saveId!;
    const playerId = req.params.playerId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "PUT") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = await req.json().catch(() => null);
    return withSaveLock(saveId, async () => {
      const found = await loadHumanSquad(saveId, auth.seatId);
      if (!found) return Response.json({ error: "noClub" }, { status: 409 });
      if (!found.squad.players.some((p) => p.id === playerId)) return Response.json({ error: "notYourPlayer" }, { status: 404 });
      const entry = parsePlayerTraining(body);
      if (!entry) return Response.json({ error: "invalidTraining" }, { status: 400 });
      const ids = new Set(found.squad.players.map((p) => p.id));
      const playerTraining = Object.fromEntries(Object.entries(found.squad.playerTraining ?? {}).filter(([id]) => ids.has(id) && id !== playerId));
      if (entry.focus || entry.position) playerTraining[playerId] = entry;
      const next: Squad = { ...found.squad, playerTraining };
      await saveService.saveSquad(saveId, found.ref.leagueSlug, found.ref.clubSlug, next);
      return Response.json({ playerTraining });
    });
  },

  /**
   * `PUT { level, months }` - a development goal for an academy player (`youthGoals.ts`): the level to reach (0-10,
   * above today's, at most 2 more) in 3, 6 or 12 months; `null` removes it. 400 `invalidGoal`, 404 `notYourPlayer`.
   */
  "/api/saves/:saveId/youth/:playerId/goal": async (req: Req) => {
    const saveId = req.params.saveId!;
    const playerId = req.params.playerId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "PUT") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = await req.json().catch(() => undefined);
    return withSaveLock(saveId, async () => {
      const found = await loadHumanSquad(saveId, auth.seatId);
      if (!found) return Response.json({ error: "noClub" }, { status: 409 });
      const player = (found.squad.youth ?? []).find((p) => p.id === playerId);
      if (!player) return Response.json({ error: "notYourPlayer" }, { status: 404 });
      const goals = { ...(found.squad.youthGoals ?? {}) };
      if (body === null) delete goals[playerId];
      else {
        const goal = parseGoal(body, player, found.meta.currentDate ?? "");
        if (!goal) return Response.json({ error: "invalidGoal" }, { status: 400 });
        goals[playerId] = goal;
      }
      const { youthGoals: _old, ...rest } = found.squad;
      const next: Squad = Object.keys(goals).length > 0 ? { ...rest, youthGoals: goals } : rest;
      await saveService.saveSquad(saveId, found.ref.leagueSlug, found.ref.clubSlug, next);
      return Response.json(youthView(next, found.meta));
    });
  },

  /** `POST { ids }` - dismiss several academy players at once; they join the free-agent pool. 400 `invalidIds`. */
  /**
   * `PUT { rule: { by, below } | null }` - the academy's release rule (tester report 2026-11-18): saved, and who is
   * below it leaves now; at every rollover the rule runs again. `{ released, ...youthView }`. 400 `invalidRule`.
   */
  "/api/saves/:saveId/youth/auto-release": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "PUT") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = (await req.json().catch(() => undefined)) as { rule?: unknown } | undefined;
    const rule = parseAutoRelease(body?.rule);
    if (rule === "invalid") return Response.json({ error: "invalidRule" }, { status: 400 });
    return withSaveLock(saveId, async () => {
      const found = await loadHumanSquad(saveId, auth.seatId);
      if (!found) return Response.json({ error: "squad not found" }, { status: 404 });
      const { squad, meta } = found;
      const leaving = autoReleased(squad.youth ?? [], rule);
      const ids = new Set(leaving.map((p) => p.id));
      const { youthAutoRelease: _old, ...rest } = squad;
      const next: Squad = { ...rest, ...(rule ? { youthAutoRelease: rule } : {}), youth: (squad.youth ?? []).filter((p) => !ids.has(p.id)) };
      await saveService.saveSquad(saveId, found.ref.leagueSlug, found.ref.clubSlug, next);
      if (leaving.length > 0) {
        const date = meta.currentDate ?? new Date().toISOString().slice(0, 10);
        await saveService.writeFreeAgents(saveId, [...(await saveService.getFreeAgents(saveId)), ...leaving.map((p) => toFreeAgent(p, date))]);
      }
      return Response.json({ released: leaving.map((p) => p.name), ...youthView(next, meta) });
    });
  },

  "/api/saves/:saveId/youth/release-many": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const ids = parseIds(await req.json().catch(() => null));
    if (!ids) return Response.json({ error: "invalidIds" }, { status: 400 });
    return withSaveLock(saveId, async () => {
      const found = await loadHumanSquad(saveId, auth.seatId);
      if (!found) return Response.json({ error: "squad not found" }, { status: 404 });
      const { squad, meta } = found;
      const chosen = new Set(ids);
      const leaving = (squad.youth ?? []).filter((p) => chosen.has(p.id));
      const next: Squad = { ...squad, youth: (squad.youth ?? []).filter((p) => !chosen.has(p.id)) };
      await saveService.saveSquad(saveId, found.ref.leagueSlug, found.ref.clubSlug, next);
      const date = meta.currentDate ?? new Date().toISOString().slice(0, 10);
      await saveService.writeFreeAgents(saveId, [...(await saveService.getFreeAgents(saveId)), ...leaving.map((p) => toFreeAgent(p, date))]);
      return Response.json(youthView(next, found.meta));
    });
  },

  /**
   * `POST { ids }` - promote several academy players at once (report 7da62af2), in the given order, until the squad
   * is full (`HUMAN_MAX_SQUAD`). `{ promoted, skipped: [{ id, reason }], ...youthView }`. 400 `invalidIds`.
   */
  "/api/saves/:saveId/youth/promote-many": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const ids = parseIds(await req.json().catch(() => null));
    if (!ids) return Response.json({ error: "invalidIds" }, { status: 400 });
    return withSaveLock(saveId, async () => {
      const found = await loadHumanSquad(saveId, auth.seatId);
      if (!found) return Response.json({ error: "squad not found" }, { status: 404 });
      const { squad } = found;
      const date = found.meta.currentDate ?? "";
      let size = await humanRosterSize(saveService, saveId, auth.seatId, squad);
      const youth = new Map((squad.youth ?? []).map((p) => [p.id, p]));
      const promoted: RosterPlayer[] = [];
      const skipped: { id: string; reason: PromoteSkipReason }[] = [];
      for (const id of ids) {
        const player = youth.get(id);
        if (!player) skipped.push({ id, reason: "notFound" });
        else if (!player.contract) skipped.push({ id, reason: "noContract" });
        else if (size >= HUMAN_MAX_SQUAD) skipped.push({ id, reason: "squadFull" });
        else {
          promoted.push(promotedPlayer(squad, { ...player, contract: player.contract }, date));
          size++;
        }
      }
      const moved = new Set(promoted.map((p) => p.id));
      const next: Squad = moved.size === 0 ? squad : {
        ...squad,
        players: [...squad.players, ...promoted],
        youth: (squad.youth ?? []).filter((p) => !moved.has(p.id)),
      };
      if (moved.size > 0) {
        await saveService.saveSquad(saveId, found.ref.leagueSlug, found.ref.clubSlug, next);
        let ach = await saveService.getAchievements(saveId, auth.seatId);
        for (const p of promoted) ach = recordPromotion(ach, p.id);
        await saveService.writeAchievements(saveId, ach, auth.seatId);
      }
      return Response.json({ ...youthView(next, found.meta), promoted: promoted.map((p) => p.id), skipped });
    });
  },

  /** `POST` - move an academy player into the squad (400 `squadFull` at `HUMAN_MAX_SQUAD`). New wage from the curve. */
  "/api/saves/:saveId/youth/:playerId/promote": async (req: Req) => {
    const saveId = req.params.saveId!;
    const playerId = req.params.playerId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    return withSaveLock(saveId, async () => {
      const found = await loadHumanSquad(saveId, auth.seatId);
      if (!found) return Response.json({ error: "squad not found" }, { status: 404 });
      const { squad } = found;
      const player = squad.youth?.find((p) => p.id === playerId);
      if (!player) return Response.json({ error: "player not found" }, { status: 404 });
      if ((await humanRosterSize(saveService, saveId, auth.seatId, squad)) >= HUMAN_MAX_SQUAD) return Response.json({ error: "squadFull" }, { status: 400 });
      if (!player.contract) return Response.json({ error: "noContract" }, { status: 409 });
      const promoted = promotedPlayer(squad, { ...player, contract: player.contract }, found.meta.currentDate ?? "");
      const next: Squad = {
        ...squad,
        players: [...squad.players, promoted],
        youth: (squad.youth ?? []).filter((p) => p.id !== playerId),
      };
      await saveService.saveSquad(saveId, found.ref.leagueSlug, found.ref.clubSlug, next);
      // Achievements (`.claude/rules/game/achievements.md`): an academy player in the first team.
      await saveService.writeAchievements(saveId, recordPromotion(await saveService.getAchievements(saveId, auth.seatId), playerId), auth.seatId);
      return Response.json(youthView(next, found.meta));
    });
  },

  /** `POST` - dismiss an academy player; he joins the free-agent pool. */
  "/api/saves/:saveId/youth/:playerId/release": async (req: Req) => {
    const saveId = req.params.saveId!;
    const playerId = req.params.playerId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    return withSaveLock(saveId, async () => {
      const found = await loadHumanSquad(saveId, auth.seatId);
      if (!found) return Response.json({ error: "squad not found" }, { status: 404 });
      const { squad, meta } = found;
      const player = squad.youth?.find((p) => p.id === playerId);
      if (!player) return Response.json({ error: "player not found" }, { status: 404 });
      const next: Squad = { ...squad, youth: (squad.youth ?? []).filter((p) => p.id !== playerId) };
      await saveService.saveSquad(saveId, found.ref.leagueSlug, found.ref.clubSlug, next);
      const date = meta.currentDate ?? new Date().toISOString().slice(0, 10);
      const pool = await saveService.getFreeAgents(saveId);
      await saveService.writeFreeAgents(saveId, [...pool, toFreeAgent(player, date)]);
      return Response.json(youthView(next, found.meta));
    });
  },
};
