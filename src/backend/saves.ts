import { saveService } from "@/backend/SaveService";
import type { SaveMeta } from "@/backend/SaveService";
import { applyBroadcasting } from "@/backend/FinancialService";
import { DEFAULT_TACTICAL_STYLE } from "@/types/tacticsTypes";
import type { TacticalStyle, TacticsSave } from "@/types/tacticsTypes";
import type { TrainingIntensity } from "@/types/developmentTypes";
import { requireAuth, requireSaveOwner } from "@/backend/auth/middleware";
import { getLeagueData } from "@/backend/advanceDay";
import { sanitizeFollowedLeagues } from "@/Domain/advanceDay/simMode";
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
          season = {
            year: playerLeagueState.year,
            start: playerLeagueState.start,
            end: playerLeagueState.end,
            calendar,
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

      const updated: TacticsSave = {
        formation:      body.formation      ?? existing.formation,
        tactical_style: body.tactical_style ?? existing.tactical_style,
        lineup:         body.lineup         ?? existing.lineup,
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
};
