import { openTotal } from "@/Domain/bets/bets";
import { requireSeat } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { saveService } from "@/backend/SaveService";
import { DECOR_ITEMS, decorRefusal, isDecorItem } from "@/Domain/achievements/decorShop";
import { coursePrice, courseRefusal, isCourseLanguage, LICENCE_KINDS, spokenLanguages, startCourse, type CourseKind } from "@/Domain/managers/courses";
import { assetRefusal, isAssetKind, managerWallet, nextAssetPrice } from "@/Domain/managers/assets";

type Req = Request & { params: Record<string, string> };

export const managerAssetRoutes = {
  /** The manager buys the next level of a personal asset with his own money (never the club's). */
  "/api/saves/:saveId/manager-assets": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = await req.json().catch(() => null) as { kind?: unknown } | null;
    const kind = body?.kind;
    if (!isAssetKind(kind)) return Response.json({ error: "invalidAsset" }, { status: 400 });
    return withSaveLock(saveId, async () => {
      const seat = await saveService.getSeat(saveId, auth.seatId);
      if (!seat) return Response.json({ error: "save not found" }, { status: 404 });
      const bets = await saveService.getBets(saveId, auth.seatId);
      const refusal = assetRefusal(seat.managerAssets, kind, managerWallet(seat.managerEarnings, seat.managerSpent, seat.betNet, openTotal(bets)));
      if (refusal) return Response.json({ error: refusal }, { status: 409 });
      const managerAssets = { ...seat.managerAssets, [kind]: (seat.managerAssets?.[kind] ?? 0) + 1 };
      const managerSpent = (seat.managerSpent ?? 0) + nextAssetPrice(seat.managerAssets, kind)!;
      await saveService.updateSeat(saveId, auth.seatId, { managerAssets, managerSpent });
      return Response.json({ managerAssets, managerSpent });
    });
  },
  /** A language course or a coaching licence bought with his own money (9.3, `courses.ts`). One at a time. */
  "/api/saves/:saveId/manager-course": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = await req.json().catch(() => null) as { kind?: unknown; language?: unknown } | null;
    const kind = body?.kind;
    const language = typeof body?.language === "string" ? body.language : undefined;
    if (kind !== "language" && !(LICENCE_KINDS as unknown[]).includes(kind)) return Response.json({ error: "invalidCourse" }, { status: 400 });
    if (kind === "language" && (!language || language.length > 60 || !isCourseLanguage(language))) {
      return Response.json({ error: "invalidCourse" }, { status: 400 });
    }
    return withSaveLock(saveId, async () => {
      const seat = await saveService.getSeat(saveId, auth.seatId);
      const meta = await saveService.getMeta(saveId);
      if (!seat || !meta) return Response.json({ error: "save not found" }, { status: 404 });
      const date = meta.currentDate ?? "";
      const bets = await saveService.getBets(saveId, auth.seatId);
      const wallet = managerWallet(seat.managerEarnings, seat.managerSpent, seat.betNet, openTotal(bets));
      const courseKind = kind as CourseKind;
      const refusal = courseRefusal({
        kind: courseKind, ...(language ? { language } : {}), studies: seat.managerStudies,
        spoken: spokenLanguages(seat.manager?.nationalityIso, seat.managerStudies, date), date, wallet,
      });
      if (refusal) return Response.json({ error: refusal }, { status: refusal === "invalidCourse" ? 400 : 409 });
      const managerStudies = startCourse(seat.managerStudies, courseKind, date, language);
      const managerSpent = (seat.managerSpent ?? 0) + coursePrice(courseKind);
      await saveService.updateSeat(saveId, auth.seatId, { managerStudies, managerSpent });
      return Response.json({ managerStudies, managerSpent });
    });
  },
  /** A stadium decoration bought with his own money (9.1): it stays with him from club to club and counts for his fame. */
  "/api/saves/:saveId/manager-decor": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = await req.json().catch(() => null) as { item?: unknown } | null;
    const item = body?.item;
    if (!isDecorItem(item)) return Response.json({ error: "invalidDecor" }, { status: 400 });
    return withSaveLock(saveId, async () => {
      const seat = await saveService.getSeat(saveId, auth.seatId);
      if (!seat) return Response.json({ error: "save not found" }, { status: 404 });
      const bets = await saveService.getBets(saveId, auth.seatId);
      const refusal = decorRefusal(seat.managerDecor, item, managerWallet(seat.managerEarnings, seat.managerSpent, seat.betNet, openTotal(bets)));
      if (refusal) return Response.json({ error: refusal }, { status: 409 });
      const managerDecor = [...(seat.managerDecor ?? []), item];
      const managerSpent = (seat.managerSpent ?? 0) + DECOR_ITEMS[item].price;
      await saveService.updateSeat(saveId, auth.seatId, { managerDecor, managerSpent });
      return Response.json({ managerDecor, managerSpent });
    });
  },
};
