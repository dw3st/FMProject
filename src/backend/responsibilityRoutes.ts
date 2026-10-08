import { saveService } from "@/backend/SaveService";
import { requireSaveOwner } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { inboxTopicStates, sanitizeInboxPrefs, type InboxPrefs } from "@/Domain/inbox/inboxTopics";
import { isResponsibilities, type Responsibilities } from "@/Domain/responsibilities/director";

type Req = Request & { params: Record<string, string> };

function prefsView(prefs: InboxPrefs | undefined) {
  return { prefs: prefs ?? {}, topics: inboxTopicStates(prefs) };
}

function responsibilitiesView(r: Responsibilities | undefined): Responsibilities {
  return { contracts: r?.contracts ?? "director" };
}

/**
 * Responsibilities (who handles the human club's contracts) and inbox preferences (spec `docs/superpowers/specs/2026-10-07-responsibilities-inbox-design.md`):
 * which news topics reach the inbox. The filter itself lives in `SaveService.appendInbox`.
 */
export const responsibilityRoutes = {
  /** `GET` → `{ contracts }`; `PUT` `{ contracts: "director" | "manager" }`. */
  "/api/saves/:saveId/responsibilities": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;

    if (req.method === "GET") {
      const meta = await saveService.getMeta(saveId);
      if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
      return Response.json(responsibilitiesView(meta.responsibilities));
    }

    if (req.method === "PUT") {
      let body: unknown;
      try { body = await req.json(); } catch { return Response.json({ error: "invalid body" }, { status: 400 }); }
      if (!isResponsibilities(body)) return Response.json({ error: "invalid responsibilities" }, { status: 400 });
      const next: Responsibilities = { contracts: body.contracts };
      return withSaveLock(saveId, async () => {
        const meta = await saveService.getMeta(saveId);
        if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
        const updated = await saveService.updateMeta(saveId, { responsibilities: next });
        return Response.json(responsibilitiesView(updated.responsibilities));
      });
    }

    return Response.json({ error: "method not allowed" }, { status: 405 });
  },

  /** `GET` → `{ prefs, topics: [{ topic, enabled, locked }] }`; `PUT` `{ [topic]: boolean }` replaces the prefs. */
  "/api/saves/:saveId/inbox-prefs": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;

    if (req.method === "GET") {
      const meta = await saveService.getMeta(saveId);
      if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
      return Response.json(prefsView(meta.inboxPrefs));
    }

    if (req.method === "PUT") {
      let body: unknown;
      try { body = await req.json(); } catch { return Response.json({ error: "invalid body" }, { status: 400 }); }
      let prefs: InboxPrefs;
      try { prefs = sanitizeInboxPrefs(body); } catch (e) {
        return Response.json({ error: e instanceof Error ? e.message : "invalid prefs" }, { status: 400 });
      }
      return withSaveLock(saveId, async () => {
        const meta = await saveService.getMeta(saveId);
        if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
        const updated = await saveService.updateMeta(saveId, { inboxPrefs: prefs });
        return Response.json(prefsView(updated.inboxPrefs));
      });
    }

    return Response.json({ error: "method not allowed" }, { status: 405 });
  },
};
