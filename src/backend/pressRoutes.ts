import { saveService, SaveService } from "@/backend/SaveService";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import { requireSaveOwner } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { buildDayNews, emptyDayNewsInput } from "@/Domain/news/buildDayNews";
import { answerConference, emptyPressState, validateAnswers } from "@/Domain/press/effects";
import { conferenceView } from "@/Domain/press/questions";
import { logError } from "@/Logger";

type Req = Request & { params: Record<string, string> };

const bad = (error: string, status = 400) => Response.json({ error }, { status });

/** One buffered unit per request (squad, meta and news written together), flushed only when the answer is ok. */
async function inUnit(saveId: string, fn: (service: SaveService) => Promise<Response>): Promise<Response> {
  const buffer = new BufferingSaveDAL(new FileSystemDAL());
  const service = new SaveService(buffer);
  try {
    const res = await fn(service);
    if (res.ok) await buffer.flush();
    return res;
  } catch (err) {
    logError("press", `save ${saveId}: failed to answer the conference`, err);
    return Response.json({ error: "failed to answer the conference" }, { status: 500 });
  }
}

/** `{ answers: [{ questionId, answerId }] }` becomes a map; null when malformed or a question repeats. */
function parseAnswers(body: unknown): Record<string, string> | null {
  const list = (body as { answers?: unknown } | null)?.answers;
  if (!Array.isArray(list)) return null;
  const out: Record<string, string> = {};
  for (const a of list) {
    const q = (a as { questionId?: unknown } | null)?.questionId;
    const id = (a as { answerId?: unknown } | null)?.answerId;
    if (typeof q !== "string" || typeof id !== "string" || q in out) return null;
    out[q] = id;
  }
  return out;
}

export const pressRoutes = {
  "/api/saves/:saveId/press": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return bad("method not allowed", 405);
    const meta = await saveService.getMeta(saveId);
    if (!meta) return bad("save not found", 404);
    const press = meta.press;
    // The history goes out without the tones (only whether it was answered).
    const history = (press?.history ?? []).map((r) => ({ id: r.id, date: r.date, trigger: r.trigger, answered: r.answers !== "ignored" }));
    return Response.json({ pending: press?.pending ? conferenceView(press.pending) : null, history });
  },

  "/api/saves/:saveId/press/:pressId": async (req: Req) => {
    const saveId = req.params.saveId!;
    const pressId = req.params.pressId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return bad("method not allowed", 405);
    const answers = parseAnswers(await req.json().catch(() => null));
    if (!answers) return bad("invalidAnswers");
    return withSaveLock(saveId, () => inUnit(saveId, async (service) => {
      const meta = await service.getMeta(saveId);
      if (!meta) return bad("save not found", 404);
      if (!meta.clubId) return bad("noClub", 409);
      const pending = meta.press?.pending;
      const today = meta.currentDate ?? "";
      // Answerable through the deadline day itself; the day advance ignores it when it moves on from `expires`.
      if (!pending || pending.id !== pressId || today > pending.expires) return bad("pressClosed", 409);
      if (!validateAnswers(pending, answers)) return bad("invalidAnswers");
      const squad = await service.getSquadById(saveId, meta.clubId);
      if (!squad || !meta.board) return bad("save not found", 404);

      const out = answerConference({
        conference: pending, answers, squad, board: meta.board, state: meta.press ?? emptyPressState(),
      });
      await service.saveSquadById(saveId, out.squad);
      await service.updateMeta(saveId, { press: out.state, board: out.board });

      if (out.quotes.length > 0) {
        const club = { id: meta.clubId, name: meta.clubName ?? squad.name };
        const manager = meta.manager?.name ?? "";
        const items = buildDayNews({
          ...emptyDayNewsInput(today),
          press: out.quotes.map((q) => ({
            kind: "press_quote" as const, club, manager, key: q.tone,
            ...(q.player ? { player: q.player } : {}), ...(q.playerId ? { playerId: q.playerId } : {}),
            scope: { league: meta.leagueSlug },
          })),
        });
        await service.appendNews(saveId, items);
      }
      return Response.json({ ok: true });
    }));
  },
};
