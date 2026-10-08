import { saveService } from "@/backend/SaveService";
import type { SaveMeta } from "@/backend/SaveService";
import type { SeasonData } from "@/types/calendarTypes";
import { applyBroadcasting } from "@/backend/FinancialService";
import { DEFAULT_TACTICAL_STYLE } from "@/types/tacticsTypes";
import type { TacticalStyle, TacticsSave } from "@/types/tacticsTypes";
import type { TrainingIntensity } from "@/types/developmentTypes";
import { isFamiliarityKey } from "@/types/familiarityTypes";
import { resolveUserLineup } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForTactics } from "@/Domain/matchFormations";
import { CUSTOM_FORMATION_ID, parseAxesOverride, parseCustomFormation } from "@/Domain/formation/zones";
import { parseSetPieceTakers } from "@/Domain/tactics/setPieceTakers";
import { parseMatchMarks, parseSlotInstructions, sanitizeSlotInstructions } from "@/Domain/tactics/slotInstructions";
import { parseLineupPresets } from "@/Domain/tactics/lineupPresets";
import { withSaveLock } from "@/backend/saveLock";
import { parseManagerFace } from "@/Domain/faces/managerFace";
import { requireAuth, requireSaveOwner } from "@/backend/auth/middleware";
import { getLeagueData } from "@/backend/advanceDay";
import { sanitizeFollowedLeagues } from "@/Domain/advanceDay/simMode";
import { playerCupSlug } from "@/backend/cupWorld";
import { playerContinentalSlug } from "@/backend/continentalWorld";
import {
  recordSaveOwnership,
  deleteSaveOwnership,
  listUserSaveIds,
} from "@/backend/auth/saveOwnership";

export type { SaveMeta };

const MAX_SAVES_PER_USER = 5;

export const saveRoutes = {
  "/api/saves": async (req: Request) => {
    if (req.method === "GET") {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      const ids = listUserSaveIds(auth.userId);
      const metas = (await Promise.all(ids.map((id) => saveService.getMeta(id))))
        .filter((m): m is SaveMeta => !!m);
      return Response.json(metas);
    }

    if (req.method === "POST") {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;

      const existing = listUserSaveIds(auth.userId);
      if (existing.length >= MAX_SAVES_PER_USER) {
        return Response.json(
          {
            error:   `Save limit reached. Delete an existing save to start a new one.`,
            code:    "SAVE_LIMIT_REACHED",
            limit:   MAX_SAVES_PER_USER,
            current: existing.length,
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
      try {
        const meta = await saveService.createSave(body as Parameters<typeof saveService.createSave>[0]);
        recordSaveOwnership(meta.id, auth.userId);
        // Credit season broadcasting revenue to initial balance
        const finalMeta = await applyBroadcasting(meta.id, meta, meta.leagueSlug, meta.clubId);
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
    const auth = requireSaveOwner(req, id);
    if (auth instanceof Response) return auth;

    if (req.method === "GET") {
      const meta = await saveService.getMeta(id);
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
          const fullCalendar = [...calendar, ...cupFixtures, ...continentalFixtures].sort((a, b) =>
            a.date.localeCompare(b.date),
          );
          season = {
            year: playerLeagueState.year,
            start: playerLeagueState.start,
            end: playerLeagueState.end,
            calendar: fullCalendar,
            restDays: playerLeagueState.restDays ?? [],
          };
        }
      }

      return Response.json({ ...meta, season });
    }

    if (req.method === "PUT") {
      const existing = await saveService.getMeta(id);
      if (!existing) return Response.json({ error: "save not found" }, { status: 404 });

      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return Response.json({ error: "invalid body" }, { status: 400 });
      }

      // Build an explicit patch to prevent overwriting protected fields
      const patch: Partial<Omit<SaveMeta, "id" | "createdAt">> = {};
      if (body.formation      !== undefined) patch.formation      = body.formation      as string;
      if (body.tactical_style !== undefined) patch.tactical_style = body.tactical_style as TacticalStyle;
      if (body.currentDate    !== undefined) patch.currentDate    = body.currentDate    as string;
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

      const updated = await saveService.updateMeta(id, patch);
      return Response.json(updated);
    }

    if (req.method === "DELETE") {
      const existing = await saveService.getMeta(id);
      if (!existing) return Response.json({ error: "save not found" }, { status: 404 });
      await saveService.deleteSave(id);
      deleteSaveOwnership(id);
      return Response.json({ ok: true });
    }

    return Response.json({ error: "method not allowed" }, { status: 405 });
  },

  "/api/saves/:id/tactics": async (req: Request & { params: Record<string, string> }) => {
    const id = req.params.id!;
    const auth = requireSaveOwner(req, id);
    if (auth instanceof Response) return auth;

    if (req.method === "GET") {
      const meta = await saveService.getMeta(id);
      if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
      const tactics = await saveService.getTactics(id);
      return Response.json(tactics);
    }

    if (req.method === "PUT") {
      let body: Partial<TacticsSave>;
      try { body = await req.json(); } catch {
        return Response.json({ error: "invalid body" }, { status: 400 });
      }
      // Read-modify-write of tactics.json + meta: serialized with the other writers of the save.
      return withSaveLock(id, async () => {
        const meta = await saveService.getMeta(id);
        if (!meta) return Response.json({ error: "save not found" }, { status: 404 });

        const existing = (await saveService.getTactics(id)) ?? {
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

        await saveService.saveTactics(id, updated);
        await saveService.updateMeta(id, {
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
    const auth = requireSaveOwner(req, id);
    if (auth instanceof Response) return auth;
    let body: { date?: unknown; marks?: unknown };
    try { body = await req.json(); } catch {
      return Response.json({ error: "invalid body" }, { status: 400 });
    }
    return withSaveLock(id, async () => {
      const meta = await saveService.getMeta(id);
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
      const tactics = await saveService.getTactics(id);
      const formation = formationForTactics(tactics ?? { formation: meta.formation ?? "4-3-3" });
      const parsed = parseMatchMarks(
        body.marks,
        formation,
        new Set(opponent.players.map((p) => p.id)),
        new Set(opponent.players.filter((p) => (p.positions?.[0] ?? "") === "GK").map((p) => p.id)),
      );
      if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
      await saveService.updateMeta(id, {
        matchMarking: parsed.value.length > 0 ? { date: meta.currentDate!, marks: parsed.value } : undefined,
      });
      return Response.json({ ok: true, matchMarking: parsed.value.length > 0 ? { date: meta.currentDate, marks: parsed.value } : null });
    });
  },

  "/api/saves/:id/rotation-override": async (req: Request & { params: Record<string, string> }) => {
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const id = req.params.id!;
    const auth = requireSaveOwner(req, id);
    if (auth instanceof Response) return auth;
    const meta = await saveService.getMeta(id);
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
      const tactics = await saveService.getTactics(id);
      const valid = resolveUserLineup(
        squad,
        formationForTactics(tactics ?? { formation: meta.formation ?? "4-3-3" }),
        tactics?.lineup ?? [],
        meta.currentDate,
      ).rotationSuggestion;
      const ok = swaps.every((s) => valid.some((v) => v.out === s.out && v.in === s.in));
      if (!ok) return Response.json({ error: "swap not in today's suggestion" }, { status: 400 });
    }

    await saveService.updateMeta(id, {
      rotationOverride: {
        date: body.date as string,
        swaps: optOut ? [] : swaps,
        ...(optOut ? { optOut: true } : {}),
      },
    });
    return Response.json({ ok: true });
  },
};
