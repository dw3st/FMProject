import { randomUUID } from "node:crypto";
import { saveService } from "@/backend/SaveService";
import { requireSaveOwner } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { emptyMarket } from "@/backend/negotiationWorld";
import { marketAfterRequests } from "@/backend/moraleWorld";
import {
  answerTalk, answersFor, clubMoraleOf, expectedRange, moraleBand, moraleOf, moraleTrend, statusOf,
  suggestedStatuses, windowMatches,
} from "@/Domain/morale/morale";
import { SQUAD_STATUSES, type SquadStatus, type TalkAnswer } from "@/types/moraleTypes";
import type { Squad } from "@/types/playerTypes";

type Req = Request & { params: Record<string, string> };

const ANSWERS: readonly TalkAnswer[] = ["promise_minutes", "promise_sale", "promise_renewal", "praise", "demand", "refuse"];

/** The human club, or a 409 `noClub` when the manager is unemployed (`.claude/rules/game/jobs.md`). */
async function loadHuman(saveId: string): Promise<{ squad: Squad; date: string } | Response> {
  const meta = await saveService.getMeta(saveId);
  if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
  if (meta.unemployed || !meta.clubId) return Response.json({ error: "noClub" }, { status: 409 });
  const squad = await saveService.getSquadById(saveId, meta.clubId);
  if (!squad) return Response.json({ error: "squad not found" }, { status: 404 });
  return { squad, date: meta.currentDate ?? new Date().toISOString().slice(0, 10) };
}

/** Morale overview of the human club: one row per player, open talks and promises. */
function moraleView(squad: Squad) {
  const suggested = suggestedStatuses(squad);
  const state = clubMoraleOf(squad);
  return {
    players: squad.players.map((p) => {
      const status = statusOf(p, suggested);
      const morale = moraleOf(p);
      return {
        id: p.id,
        name: p.name,
        morale,
        band: moraleBand(morale),
        status,
        suggested: suggested[p.id] ?? "backup",
        manualStatus: p.squadStatus !== undefined,
        expected: expectedRange(status),
        played: windowMatches(p.moraleLog?.minutes ?? []),
        trend: moraleTrend(p),
        transferRequest: p.moraleLog?.transferRequest ?? null,
        answers: answersFor(state.talks.find((t) => t.playerId === p.id)?.reason ?? null),
      };
    }),
    talks: state.talks,
    promises: state.promises,
  };
}

/**
 * Morale and talks (`.claude/rules/game/morale.md`). Every route checks the save owner; the writes
 * run under the save lock; without a club they answer 409 `noClub`.
 */
export const moraleRoutes = {
  /** `GET /api/saves/:saveId/morale` — players' morale, status and trend; open talks and promises. */
  "/api/saves/:saveId/morale": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const found = await loadHuman(saveId);
    if (found instanceof Response) return found;
    return Response.json(moraleView(found.squad));
  },

  /**
   * `POST /api/saves/:saveId/talks/:playerId` `{ answer, minutes?, days? }` — answers his open talk
   * (or, without one, a free `praise` / `demand`). 400 with the error code on an invalid answer.
   * `promise_sale` puts him on the sell list as requested; `promise_renewal` answers `openRenewal`.
   */
  "/api/saves/:saveId/talks/:playerId": async (req: Req) => {
    const saveId = req.params.saveId!;
    const playerId = req.params.playerId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    let body: unknown;
    try { body = await req.json(); } catch { return Response.json({ error: "invalid body" }, { status: 400 }); }
    const { answer, minutes, days } = (body ?? {}) as Record<string, unknown>;
    if (typeof answer !== "string" || !ANSWERS.includes(answer as TalkAnswer)) {
      return Response.json({ error: "invalidAnswer" }, { status: 400 });
    }
    if (minutes !== undefined && typeof minutes !== "number") return Response.json({ error: "invalidMinutes" }, { status: 400 });
    if (days !== undefined && typeof days !== "number") return Response.json({ error: "invalidDays" }, { status: 400 });

    return withSaveLock(saveId, async () => {
      const found = await loadHuman(saveId);
      if (found instanceof Response) return found;
      const r = answerTalk({
        squad: found.squad, playerId, answer: answer as TalkAnswer, date: found.date,
        ...(typeof minutes === "number" ? { minutes } : {}),
        ...(typeof days === "number" ? { days } : {}),
        newId: () => randomUUID(),
      });
      if ("error" in r) {
        return Response.json({ error: r.error }, { status: r.error === "notYourPlayer" ? 404 : 400 });
      }
      await saveService.saveSquadById(saveId, r.squad);
      if (r.listRequested) {
        const market = (await saveService.getMarket(saveId)) ?? emptyMarket();
        await saveService.saveMarket(saveId, marketAfterRequests(market, [playerId], []));
      }
      const player = r.squad.players.find((p) => p.id === playerId)!;
      return Response.json({
        change: r.change,
        morale: moraleOf(player),
        ...(r.noEffect ? { noEffect: true } : {}),
        ...(r.promise ? { promise: r.promise } : {}),
        ...(answer === "promise_renewal" ? { openRenewal: true } : {}),
      });
    });
  },

  /** `PUT /api/saves/:saveId/players/:playerId/squad-status` `{ status }` — `null` = back to the suggestion. */
  "/api/saves/:saveId/players/:playerId/squad-status": async (req: Req) => {
    const saveId = req.params.saveId!;
    const playerId = req.params.playerId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "PUT") return Response.json({ error: "method not allowed" }, { status: 405 });
    let body: unknown;
    try { body = await req.json(); } catch { return Response.json({ error: "invalid body" }, { status: 400 }); }
    const { status } = (body ?? {}) as Record<string, unknown>;
    if (status !== null && !(typeof status === "string" && SQUAD_STATUSES.includes(status as SquadStatus))) {
      return Response.json({ error: "invalidStatus" }, { status: 400 });
    }
    return withSaveLock(saveId, async () => {
      const found = await loadHuman(saveId);
      if (found instanceof Response) return found;
      const player = found.squad.players.find((p) => p.id === playerId);
      if (!player) return Response.json({ error: "notYourPlayer" }, { status: 404 });
      const updated = { ...player };
      if (status === null) delete updated.squadStatus;
      else updated.squadStatus = status as SquadStatus;
      const squad = { ...found.squad, players: found.squad.players.map((p) => (p.id === playerId ? updated : p)) };
      await saveService.saveSquadById(saveId, squad);
      return Response.json({ status: statusOf(updated, suggestedStatuses(squad)), manual: status !== null });
    });
  },
};
