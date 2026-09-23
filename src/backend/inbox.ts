import { saveService } from "@/backend/SaveService";
import { requireSaveOwner } from "@/backend/auth/middleware";

export const inboxRoutes = {
  "/api/saves/:saveId/inbox": async (
    req: Request & { params: Record<string, string> },
  ) => {
    if (req.method !== "GET") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    const messages = await saveService.getInbox(saveId);
    const sorted = [...messages].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return Response.json(sorted);
  },

  "/api/saves/:saveId/inbox/unread-count": async (
    req: Request & { params: Record<string, string> },
  ) => {
    if (req.method !== "GET") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    const messages = await saveService.getInbox(saveId);
    const count = messages.reduce((acc, m) => (m.read ? acc : acc + 1), 0);
    return Response.json({ count });
  },

  "/api/saves/:saveId/inbox/mark-read": async (
    req: Request & { params: Record<string, string> },
  ) => {
    if (req.method !== "POST") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body || typeof body !== "object") {
      return Response.json({ error: "missing ids" }, { status: 400 });
    }
    const { ids } = body as Record<string, unknown>;
    if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string")) {
      return Response.json({ error: "ids must be string[]" }, { status: 400 });
    }
    const updated = await saveService.markInboxRead(saveId, ids as string[]);
    return Response.json(updated);
  },

  "/api/saves/:saveId/inbox/mark-all-read": async (
    req: Request & { params: Record<string, string> },
  ) => {
    if (req.method !== "POST") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    const updated = await saveService.markAllInboxRead(saveId);
    return Response.json(updated);
  },
};
