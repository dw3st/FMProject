import { requireSeat } from "@/backend/auth/middleware";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import { answerAsk } from "@/backend/naturalizationWorld";
import { withSaveLock } from "@/backend/saveLock";
import { SaveService } from "@/backend/SaveService";

type Req = Request & { params: Record<string, string> };

const MAX_BODY = 8 * 1024;

/** Naturalization requests (`.claude/rules/game/naturalization.md`): the manager supports one or not. */
export const naturalizationRoutes = {
  /** `POST { support: boolean }`. 404 `noRequest`, 409 `noClub`, 400 `invalidBody`. */
  "/api/saves/:saveId/naturalization/:playerId": async (req: Req) => {
    const saveId = req.params.saveId!;
    const playerId = req.params.playerId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return Response.json({ error: "tooLarge" }, { status: 413 });
    const text = await req.text();
    if (new TextEncoder().encode(text).length > MAX_BODY) return Response.json({ error: "tooLarge" }, { status: 413 });
    let support: unknown;
    try { support = (JSON.parse(text) as { support?: unknown })?.support; } catch { support = undefined; }
    if (typeof support !== "boolean") return Response.json({ error: "invalidBody" }, { status: 400 });
    return withSaveLock(saveId, async () => {
      const buffer = new BufferingSaveDAL(new FileSystemDAL());
      const service = new SaveService(buffer);
      const meta = await service.getSeatMeta(saveId, auth.seatId);
      if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
      if (!meta.clubId || meta.unemployed) return Response.json({ error: "noClub" }, { status: 409 });
      const asks = meta.naturalizationAsks ?? [];
      const ask = asks.find((a) => a.playerId === playerId && a.expires >= (meta.currentDate ?? ""));
      if (!ask) return Response.json({ error: "noRequest" }, { status: 404 });
      const squad = await service.getSquadById(saveId, meta.clubId);
      const next = squad ? answerAsk(squad, ask, support as boolean, meta.currentDate ?? ask.expires) : null;
      if (next) await service.saveSquadById(saveId, next);
      await service.updateSeat(saveId, auth.seatId, { naturalizationAsks: asks.filter((a) => a.playerId !== playerId) });
      await buffer.flush();
      if (!next) return Response.json({ error: "noRequest" }, { status: 404 });
      return Response.json({ ok: true, support });
    });
  },
};
