import { saveService } from "@/backend/SaveService";
import type { SaveMeta } from "@/backend/SaveService";
import { applyBroadcasting } from "@/backend/FinancialService";
import { DEFAULT_TACTICAL_STYLE } from "@/types/tacticsTypes";
import type { TacticalStyle, TacticsSave } from "@/types/tacticsTypes";
import type { TrainingIntensity } from "@/types/developmentTypes";
import { resolveUserLineup } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForTactics } from "@/Domain/matchFormations";
import { CUSTOM_FORMATION_ID, parseAxesOverride, parseCustomFormation } from "@/Domain/formation/zones";
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

// Re-export SaveMeta as SaveFile so existing imports keep working
export type SaveFile = SaveMeta;
export type { SaveMeta };
export type { SeasonData } from "@/types/calendarTypes";

export const MAX_SAVES_PER_USER = 5;

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

      // Try legacy season.json first (old saves)
      let season = await saveService.getSeason(id);

      // New multi-league format: build season from per-round files
      if (!season && meta.activeLeagues?.length) {
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

      return Response.json({ ...meta, season: season ?? undefined });
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
      const meta = await saveService.getMeta(id);
      if (!meta) return Response.json({ error: "save not found" }, { status: 404 });

      let body: Partial<TacticsSave>;
      try { body = await req.json(); } catch {
        return Response.json({ error: "invalid body" }, { status: 400 });
      }

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
      const formationId = body.formation ?? existing.formation;
      if (formationId === CUSTOM_FORMATION_ID && !customFormation) {
        return Response.json({ error: "custom formation missing" }, { status: 400 });
      }

      const updated: TacticsSave = {
        formation:      formationId,
        tactical_style: body.tactical_style ?? existing.tactical_style,
        lineup:         body.lineup         ?? existing.lineup,
        assistantRotation: body.assistantRotation ?? existing.assistantRotation ?? false,
        ...(customFormation ? { customFormation } : {}),
        ...(axesOverride ? { axesOverride } : {}),
      };

      await saveService.saveTactics(id, updated);
      await saveService.updateMeta(id, {
        formation:      updated.formation,
        tactical_style: updated.tactical_style,
      });
      return Response.json(updated);
    }

    return Response.json({ error: "method not allowed" }, { status: 405 });
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
