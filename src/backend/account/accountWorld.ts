// I/O of the account profile: snapshot each career of a save into the account
// (`docs/superpowers/specs/2026-11-18-account-profile-design.md`).
import { saveService, type SaveService } from "@/backend/SaveService";
import { listSaveMembers, listUserSaveIds } from "@/backend/auth/saveOwnership";
import { getProfileRow, markBackfilled, markCareersDeleted, upsertCareer } from "@/backend/account/accountStore";
import { logError } from "@/Logger";
import type { AccountCareer, CareerMode, CareerPassage } from "@/types/accountTypes";
import type { ManagerPassage } from "@/types/managerTypes";

type WorldReads = Awaited<ReturnType<typeof readWorld>>;

/** What every seat of one save shares: read once per sync. */
async function readWorld(service: SaveService, saveId: string) {
  const [meta, managers, index, leagues, national] = await Promise.all([
    service.getMeta(saveId), service.getManagers(saveId), service.getSquadIndex(saveId),
    import("@/backend/advanceDay").then((m) => m.getLeagueData()),
    service.getNationalState(saveId).catch(() => null),
  ]);
  return { meta, managers, index, leagues, national };
}

/** The snapshot of one seat's career, or null when the world has no record of it. */
export async function buildCareer(
  service: SaveService, saveId: string, seatId: string, world?: WorldReads,
): Promise<AccountCareer | null> {
  const { meta, managers, index, leagues, national } = world ?? await readWorld(service, saveId);
  const seat = await service.getSeat(saveId, seatId);
  if (!meta || !seat) return null;
  const record = managers.find((m) => m.seatId === seatId);
  if (!record) return null;
  const achievements = await service.getAchievements(saveId, seatId);
  const countryOf = new Map(leagues.map((l) => [l.slug, l.country]));
  const nationName = new Map(Object.values(national?.teams ?? {}).map((t) => [t.id, t.nation]));
  const clubName = (squadId: string) => index.byId(squadId)?.name ?? nationName.get(squadId) ?? squadId;
  const passage = (p: ManagerPassage, nat: boolean): CareerPassage => ({
    squadId: p.squadId, clubName: clubName(p.squadId), from: p.from,
    ...(p.to ? { to: p.to } : {}), ...(p.left ? { left: p.left } : {}), ...(nat ? { national: true as const } : {}),
  });
  const mode: CareerMode = meta.mode !== "multi" ? "solo" : meta.world?.kind === "public" ? "public" : "friends";
  return {
    saveId, seatId,
    managerName: seat.manager?.name ?? record.name,
    ...(seat.manager?.nationalityIso ? { nationalityIso: seat.manager.nationalityIso } : {}),
    ...(seat.manager?.face ? { face: seat.manager.face } : {}),
    mode,
    date: meta.currentDate ?? "",
    clubId: seat.clubId,
    clubName: seat.clubId ? seat.clubName : "",
    ...(seat.clubColors ? { clubColors: seat.clubColors } : {}),
    passages: [
      ...(record.clubs ?? []).filter((p) => p.squadId).map((p) => passage(p, false)),
      ...(record.national ?? []).map((p) => passage(p, true)),
    ],
    titles: record.titles.map((t) => ({
      kind: t.kind, competition: t.competition, season: t.season, squadId: t.squadId,
      ...(t.on ? { on: t.on } : {}),
      ...(t.kind === "league" && countryOf.get(t.competition) ? { country: countryOf.get(t.competition)! } : {}),
    })),
    awards: (record.awards ?? []).map((a) => ({ kind: a.kind, season: a.season, competition: a.competition })),
    seasons: record.seasons,
    matches: achievements.counters.matches,
    wins: achievements.counters.wins,
    cards: { yellow: record.cards?.yellow ?? 0, red: record.cards?.red ?? 0 },
  };
}

/** Snapshot every member's career of a save. Never throws: a failure only goes to the log. */
export async function syncSaveCareers(saveId: string, service: SaveService = saveService, onlySeat?: string): Promise<void> {
  try {
    const members = listSaveMembers(saveId).filter((m) => !onlySeat || m.seatId === onlySeat);
    if (members.length === 0) return;
    const world = await readWorld(service, saveId);
    for (const m of members) {
      const career = await buildCareer(service, saveId, m.seatId, world);
      if (career) upsertCareer(m.userId, career);
    }
  } catch (err) {
    logError("account", `failed to snapshot the careers of save ${saveId}`, err);
  }
}

/** Before a save goes: last snapshot, then the rows stay marked as deleted. */
export async function retireSaveCareers(saveId: string, service: SaveService = saveService): Promise<void> {
  await syncSaveCareers(saveId, service);
  try { markCareersDeleted(saveId); } catch (err) { logError("account", `mark deleted ${saveId}`, err); }
}

/** Before a seat leaves a world: last snapshot of that seat, then marked. */
export async function retireSeatCareer(saveId: string, seatId: string, service: SaveService = saveService): Promise<void> {
  await syncSaveCareers(saveId, service, seatId);
  try { markCareersDeleted(saveId, seatId); } catch (err) { logError("account", `mark deleted ${saveId}/${seatId}`, err); }
}

/** First open of the profile: every save of the account today is read once. */
export async function backfillAccount(userId: string, service: SaveService = saveService): Promise<void> {
  if (getProfileRow(userId).backfilled) return;
  for (const saveId of listUserSaveIds(userId)) await syncSaveCareers(saveId, service);
  markBackfilled(userId);
}
