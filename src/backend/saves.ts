import { saveService } from "@/backend/SaveService";
import type { SaveMeta } from "@/backend/SaveService";
import type { SeatState } from "@/types/seatTypes";
import type { Fixture, SeasonData } from "@/types/calendarTypes";
import { playerNationalCalendar } from "@/backend/nationalCoachWorld";
import { youthCompsOfCountry } from "@/backend/youthCompWorld";
import { applyBroadcasting } from "@/backend/FinancialService";
import { rememberWorld } from "@/backend/groupAdvance";
import { DEFAULT_TACTICAL_STYLE } from "@/types/tacticsTypes";
import type { TacticalStyle, TacticsSave } from "@/types/tacticsTypes";
import type { TrainingIntensity } from "@/types/developmentTypes";
import { isFamiliarityKey } from "@/types/familiarityTypes";
import { resolveUserLineup } from "@/Domain/advanceDay/matchSimulationLineups";
import { humanMatchRegistrationToday } from "@/backend/registrationWorld";
import { formationForTactics } from "@/Domain/matchFormations";
import { CUSTOM_FORMATION_ID, parseAxesOverride, parseCustomFormation } from "@/Domain/formation/zones";
import { parseSetPieceTakers } from "@/Domain/tactics/setPieceTakers";
import { parseMatchMarks, parseSlotInstructions, sanitizeSlotInstructions } from "@/Domain/tactics/slotInstructions";
import { parseLineupPresets } from "@/Domain/tactics/lineupPresets";
import { withSaveLock } from "@/backend/saveLock";
import { parseManagerFace } from "@/Domain/faces/managerFace";
import { requireAuth, requireSeat } from "@/backend/auth/middleware";
import { getLeagueData } from "@/backend/advanceDay";
import { sanitizeFollowedLeagues } from "@/Domain/advanceDay/simMode";
import { playerCupSlug } from "@/backend/cupWorld";
import { playerContinentalSlug } from "@/backend/continentalWorld";
import { saveCompatibility } from "@/Domain/saveVersion";
import { publicWorldMeta } from "@/Domain/multiplayer/worldPublic";
import { createWorldState, deleteWorld } from "@/backend/worlds/worldLifecycle";
import {
  addSaveMember,
  countOwnedSaves,
  listSaveMembers,
  listUserSaveIds,
  memberOf,
} from "@/backend/auth/saveOwnership";

export type { SaveMeta };

const MAX_SAVES_PER_USER = 5;

export const saveRoutes = {
  "/api/saves": async (req: Request) => {
    if (req.method === "GET") {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      // Every world the user is a member of, merged with his seat (a world without the seat files is skipped).
      const ids = listUserSaveIds(auth.userId);
      const metas = [];
      for (const id of ids) {
        const member = memberOf(id, auth.userId);
        const meta = member ? await saveService.getSeatMeta(id, member.seatId) : null;
        if (meta && member) {
          metas.push({
            ...publicWorldMeta(meta), role: member.role, compatible: saveCompatibility(meta.gameVersion) === "ok",
            ...(meta.mode === "multi" ? { members: listSaveMembers(id).length } : {}),
          });
        }
      }
      return Response.json(metas);
    }

    if (req.method === "POST") {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;

      // The limit counts only the worlds the user owns (`.claude/rules/game/multiplayer.md`).
      const owned = countOwnedSaves(auth.userId);
      if (owned >= MAX_SAVES_PER_USER) {
        return Response.json(
          {
            error:   `Save limit reached. Delete an existing save to start a new one.`,
            code:    "SAVE_LIMIT_REACHED",
            limit:   MAX_SAVES_PER_USER,
            current: owned,
          },
          { status: 409 },
        );
      }

      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return Response.json({ error: "invalid body" }, { status: 400 });
      }
      // The manager's avatar (Etapa 31b): parameters only, validated before anything is written.
      const rawManager = body.manager as Record<string, unknown> | undefined;
      if (rawManager && typeof rawManager === "object" && "face" in rawManager) {
        const face = parseManagerFace(rawManager.face);
        if (!face) return Response.json({ error: "invalid manager face" }, { status: 400 });
        body = { ...body, manager: { ...rawManager, face } };
      }
      // A world of friends starts in the lobby: no `/presimulate` until the owner starts it (multiplayer part 2).
      const mode = body.mode;
      if (mode !== undefined && mode !== "solo" && mode !== "multi") {
        return Response.json({ error: "invalid mode" }, { status: 400 });
      }
      try {
        const meta = await saveService.createSave(body as Parameters<typeof saveService.createSave>[0]);
        addSaveMember(meta.id, auth.userId, meta.seatId, "owner");
        // The world state right after the save exists: a failure below must not leave a solo save behind.
        let world: Awaited<ReturnType<typeof createWorldState>> | undefined;
        if (mode === "multi") {
          try {
            world = await createWorldState(meta.id, auth.userId);
          } catch (e) {
            await deleteWorld(meta.id, auth.userId).catch(() => {});
            throw e;
          }
        }
        // Credit season broadcasting revenue to initial balance
        const finalMeta = await applyBroadcasting(meta.id, meta, meta.leagueSlug, meta.clubId, meta.seatId);
        if (world) {
          rememberWorld(meta.id);
          return Response.json({ ...publicWorldMeta({ ...finalMeta, mode: "multi", world }) }, { status: 201 });
        }
        return Response.json(finalMeta, { status: 201 });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "failed to create save";
        return Response.json({ error: msg }, { status: 500 });
      }
    }

    return Response.json({ error: "method not allowed" }, { status: 405 });
  },

  "/api/saves/:id": async (req: Request & { params: Record<string, string> }) => {
    const id = req.params.id!;
    const auth = requireSeat(req, id);
    if (auth instanceof Response) return auth;

    if (req.method === "GET") {
      // The world merged with the requester's seat (`metaForSeat`): the meta's shape before seats, plus `seatId`.
      const meta = await saveService.getSeatMeta(id, auth.seatId);
      if (!meta) return Response.json({ error: "save not found" }, { status: 404 });

      // The player's season view: league + cup + continental fixtures of the club.
      let season: SeasonData | undefined;
      if (meta.activeLeagues?.length) {
        const playerLeagueState = meta.activeLeagues.find(
          (l) => l.leagueSlug === meta.leagueSlug,
        );
        if (playerLeagueState) {
          const calendar = await saveService.getAllFixturesForLeague(id, meta.leagueSlug);
          const cupSlug = await playerCupSlug(meta.leagueSlug);
          const myId = meta.clubId;
          const cupFixtures = cupSlug
            ? (await saveService.getAllFixturesForLeague(id, cupSlug)).filter((f) => f.home === myId || f.away === myId)
            : [];
          const continentalSlug = await playerContinentalSlug(saveService, id, myId);
          const continentalFixtures = continentalSlug
            ? (await saveService.getAllFixturesForLeague(id, continentalSlug)).filter(
                (f) => f.home === myId || f.away === myId,
              )
            : [];
          // His national team's games (Etapa 41b), with the club's id on the national side.
          const national = myId ? await playerNationalCalendar(saveService, id, auth.seatId, myId) : { teamId: null, fixtures: [], teamNames: {} };
          const fullCalendar = [...calendar, ...cupFixtures, ...continentalFixtures, ...national.fixtures].sort((a, b) =>
            a.date.localeCompare(b.date),
          );
          const country = (await getLeagueData()).find((l) => l.slug === meta.leagueSlug)?.country;
          const youthCalendar: Fixture[] = [];
          if (country && myId) {
            const comps = await youthCompsOfCountry(saveService, id, country);
            for (const slug of [comps.u21, comps.u19]) {
              if (!slug) continue;
              youthCalendar.push(...(await saveService.getAllFixturesForLeague(id, slug)).filter((f) => f.home === myId || f.away === myId));
            }
            youthCalendar.sort((a, b) => a.date.localeCompare(b.date));
          }
          season = {
            year: playerLeagueState.year,
            start: playerLeagueState.start,
            end: playerLeagueState.end,
            calendar: fullCalendar,
            ...(youthCalendar.length > 0 ? { youthCalendar } : {}),
            restDays: meta.restDays ?? [],
            ...(national.teamId ? { nationalTeamId: national.teamId, teamNames: national.teamNames } : {}),
          };
        }
      }

      return Response.json({ ...publicWorldMeta(meta), role: auth.role, season });
    }

    if (req.method === "PUT") {
      const existing = await saveService.getSeatMeta(id, auth.seatId);
      if (!existing) return Response.json({ error: "save not found" }, { status: 404 });

      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return Response.json({ error: "invalid body" }, { status: 400 });
      }

      // An explicit patch of the requester's seat (the world's date is never written from here).
      const patch: Partial<SeatState> = {};
      if (body.formation      !== undefined) patch.formation      = body.formation      as string;
      if (body.tactical_style !== undefined) patch.tactical_style = body.tactical_style as TacticalStyle;
      if (body.min_energy_to_train !== undefined) {
        const n = Number(body.min_energy_to_train);
        if (!Number.isFinite(n)) return Response.json({ error: "invalid min_energy_to_train" }, { status: 400 });
        patch.min_energy_to_train = Math.min(100, Math.max(0, Math.round(n)));
      }
      if (body.training_intensity !== undefined) {
        const ti = body.training_intensity as string;
        if (ti !== "light" && ti !== "normal" && ti !== "heavy")
          return Response.json({ error: "invalid training_intensity" }, { status: 400 });
        patch.training_intensity = ti as TrainingIntensity;
      }
      if (body.style_focus !== undefined) {
        // null = auto: drill the tactics style (the key is cleared from the meta).
        if (body.style_focus === null) patch.style_focus = undefined;
        else if (!isFamiliarityKey(body.style_focus))
          return Response.json({ error: "invalid style_focus" }, { status: 400 });
        else patch.style_focus = body.style_focus;
      }
      if (body.followedLeagues !== undefined) {
        const leagues = await getLeagueData();
        patch.followedLeagues = sanitizeFollowedLeagues(
          body.followedLeagues,
          new Set(leagues.map((l) => l.slug)),
          existing.leagueSlug,
        );
      }

      // Apply defaults for tactical fields that weren't set yet on the existing meta
      if (!patch.formation      && !existing.formation)      patch.formation      = "4-3-3";
      if (!patch.tactical_style && !existing.tactical_style) patch.tactical_style = DEFAULT_TACTICAL_STYLE;

      await saveService.updateSeat(id, auth.seatId, patch);
      return Response.json(publicWorldMeta((await saveService.getSeatMeta(id, auth.seatId))!));
    }

    if (req.method === "DELETE") {
      if (auth.role !== "owner") return Response.json({ error: "only the owner deletes a world" }, { status: 403 });
      const existing = await saveService.getMeta(id);
      if (!existing) return Response.json({ error: "save not found" }, { status: 404 });
      // Every member loses the world; the others get `world_deleted` (multiplayer part 2).
      const allowed = await withSaveLock(id, async () => {
        if (memberOf(id, auth.userId)?.role !== "owner") return false;
        await deleteWorld(id, auth.userId);
        return true;
      });
      if (!allowed) return Response.json({ error: "only the owner deletes a world" }, { status: 403 });
      return Response.json({ ok: true });
    }

    return Response.json({ error: "method not allowed" }, { status: 405 });
  },

  "/api/saves/:id/tactics": async (req: Request & { params: Record<string, string> }) => {
    const id = req.params.id!;
    const auth = requireSeat(req, id);
    if (auth instanceof Response) return auth;

    if (req.method === "GET") {
      const meta = await saveService.getSeatMeta(id, auth.seatId);
      if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
      const tactics = await saveService.getTactics(id, auth.seatId);
      return Response.json(tactics);
    }

    if (req.method === "PUT") {
      let body: Partial<TacticsSave>;
      try { body = await req.json(); } catch {
        return Response.json({ error: "invalid body" }, { status: 400 });
      }
      // Read-modify-write of tactics.json + meta: serialized with the other writers of the save.
      return withSaveLock(id, async () => {
        const meta = await saveService.getSeatMeta(id, auth.seatId);
        if (!meta) return Response.json({ error: "save not found" }, { status: 404 });

        const existing = (await saveService.getTactics(id, auth.seatId)) ?? {
          formation:      meta.formation      ?? "4-3-3",
          tactical_style: meta.tactical_style ?? DEFAULT_TACTICAL_STYLE,
          lineup:         [],
        } satisfies TacticsSave;

        let customFormation = existing.customFormation;
        if (body.customFormation !== undefined) {
          const parsed = parseCustomFormation(body.customFormation);
          if (!parsed) return Response.json({ error: "invalid custom formation" }, { status: 400 });
          customFormation = parsed;
        }
        let axesOverride = existing.axesOverride;
        if (body.axesOverride !== undefined) {
          const parsed = parseAxesOverride(body.axesOverride);
          if (!parsed) return Response.json({ error: "invalid axes override" }, { status: 400 });
          axesOverride = Object.keys(parsed).length ? parsed : undefined;
        }
        let setPieceTakers = existing.setPieceTakers;
        if (body.setPieceTakers !== undefined) {
          const parsed = parseSetPieceTakers(body.setPieceTakers);
          if (!parsed) return Response.json({ error: "invalid set-piece takers" }, { status: 400 });
          setPieceTakers = Object.keys(parsed).length ? parsed : undefined;
        }
        const formationId = body.formation ?? existing.formation;
        if (formationId === CUSTOM_FORMATION_ID && !customFormation) {
          return Response.json({ error: "custom formation missing" }, { status: 400 });
        }
        // Player instructions are per slot of the formation being saved: a body list is validated
        // against it (400 on an unknown / misfit variant), a kept list is sanitized (formation change).
        const playFormation = formationForTactics({ formation: formationId, customFormation });
        let slotInstructions = sanitizeSlotInstructions(playFormation, existing.slotInstructions);
        if (body.slotInstructions !== undefined) {
          const parsed = parseSlotInstructions(body.slotInstructions, playFormation);
          if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
          slotInstructions = parsed.value;
        }
        // Saved lineups (#84): validated whole (each preset against its own formation); never played.
        let lineupPresets = existing.lineupPresets;
        if (body.lineupPresets !== undefined) {
          const parsed = parseLineupPresets(body.lineupPresets);
          if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
          lineupPresets = Object.keys(parsed.value).length ? parsed.value : undefined;
        }

        const updated: TacticsSave = {
          formation:      formationId,
          tactical_style: body.tactical_style ?? existing.tactical_style,
          lineup:         body.lineup         ?? existing.lineup,
          assistantRotation: body.assistantRotation ?? existing.assistantRotation ?? false,
          ...(customFormation ? { customFormation } : {}),
          ...(axesOverride ? { axesOverride } : {}),
          ...(setPieceTakers ? { setPieceTakers } : {}),
          ...(slotInstructions.length > 0 ? { slotInstructions } : {}),
          ...(lineupPresets ? { lineupPresets } : {}),
        };

        // Today's man-marking follows the formation: a pair whose marker slot changed role (or became
        // the goalkeeper) is dropped (player instructions).
        let matchMarking = meta.matchMarking;
        if (matchMarking) {
          const before = formationForTactics(existing);
          const marks = matchMarking.marks.filter((m) => {
            const role = playFormation.attacking[m.slot]?.role;
            return role !== undefined && role !== "GK" && role === before.attacking[m.slot]?.role;
          });
          if (marks.length !== matchMarking.marks.length) matchMarking = marks.length > 0 ? { ...matchMarking, marks } : undefined;
        }

        await saveService.saveTactics(id, updated, auth.seatId);
        await saveService.updateSeat(id, auth.seatId, {
          formation:      updated.formation,
          tactical_style: updated.tactical_style,
          ...(matchMarking !== meta.matchMarking ? { matchMarking } : {}),
        });
        return Response.json(updated);
      });
    }

    return Response.json({ error: "method not allowed" }, { status: 405 });
  },

  /**
   * Man-marking for today's match (player instructions): up to 2 pairs of an outfield slot of the
   * user's formation and an outfield player of today's opponent. Cleared by the next advance.
   */
  "/api/saves/:id/match-marking": async (req: Request & { params: Record<string, string> }) => {
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const id = req.params.id!;
    const auth = requireSeat(req, id);
    if (auth instanceof Response) return auth;
    let body: { date?: unknown; marks?: unknown };
    try { body = await req.json(); } catch {
      return Response.json({ error: "invalid body" }, { status: 400 });
    }
    return withSaveLock(id, async () => {
      const meta = await saveService.getSeatMeta(id, auth.seatId);
      if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
      if (!meta.clubId) return Response.json({ error: "noClub" }, { status: 409 });
      if (body.date !== meta.currentDate) {
        return Response.json({ error: "date must be the current date" }, { status: 400 });
      }
      const fixtures = await saveService.getFixturesForDate(id, meta.currentDate!);
      const fixture = fixtures.find((f) => (f.home === meta.clubId || f.away === meta.clubId) && !f.played);
      if (!fixture) return Response.json({ error: "no match today" }, { status: 400 });
      const opponent = await saveService.getSquadById(id, fixture.home === meta.clubId ? fixture.away : fixture.home);
      if (!opponent) return Response.json({ error: "opponent squad not found" }, { status: 404 });
      const tactics = await saveService.getTactics(id, auth.seatId);
      const formation = formationForTactics(tactics ?? { formation: meta.formation ?? "4-3-3" });
      const parsed = parseMatchMarks(
        body.marks,
        formation,
        new Set(opponent.players.map((p) => p.id)),
        new Set(opponent.players.filter((p) => (p.positions?.[0] ?? "") === "GK").map((p) => p.id)),
      );
      if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
      await saveService.updateSeat(id, auth.seatId, {
        matchMarking: parsed.value.length > 0 ? { date: meta.currentDate!, marks: parsed.value } : undefined,
      });
      return Response.json({ ok: true, matchMarking: parsed.value.length > 0 ? { date: meta.currentDate, marks: parsed.value } : null });
    });
  },

  "/api/saves/:id/rotation-override": async (req: Request & { params: Record<string, string> }) => {
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const id = req.params.id!;
    const auth = requireSeat(req, id);
    if (auth instanceof Response) return auth;
    const meta = await saveService.getSeatMeta(id, auth.seatId);
    if (!meta) return Response.json({ error: "save not found" }, { status: 404 });

    let body: { date?: unknown; swaps?: unknown; optOut?: unknown };
    try { body = await req.json(); } catch {
      return Response.json({ error: "invalid body" }, { status: 400 });
    }
    if (body.date !== meta.currentDate) {
      return Response.json({ error: "date must be the current date" }, { status: 400 });
    }
    const optOut = body.optOut === true;
    const swaps = (Array.isArray(body.swaps) ? body.swaps : []) as { out: string; in: string }[];
    if (!swaps.every((s) => s && typeof s.out === "string" && typeof s.in === "string")) {
      return Response.json({ error: "invalid swaps" }, { status: 400 });
    }

    if (!optOut && swaps.length > 0) {
      const squad = await saveService.getSquadById(id, meta.clubId);
      if (!squad) return Response.json({ error: "squad not found" }, { status: 404 });
      const tactics = await saveService.getTactics(id, auth.seatId);
      // Same registered pool as the preview (`match-setup`), so its suggestions validate here.
      const reg = await humanMatchRegistrationToday(saveService, id, auth.seatId, squad);
      const valid = resolveUserLineup(
        squad,
        formationForTactics(tactics ?? { formation: meta.formation ?? "4-3-3" }),
        tactics?.lineup ?? [],
        meta.currentDate,
        undefined,
        reg ?? undefined,
      ).rotationSuggestion;
      const ok = swaps.every((s) => valid.some((v) => v.out === s.out && v.in === s.in));
      if (!ok) return Response.json({ error: "swap not in today's suggestion" }, { status: 400 });
    }

    await saveService.updateSeat(id, auth.seatId, {
      rotationOverride: {
        date: body.date as string,
        swaps: optOut ? [] : swaps,
        ...(optOut ? { optOut: true } : {}),
      },
    });
    return Response.json({ ok: true });
  },
};
