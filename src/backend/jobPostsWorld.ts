import type { SaveService, SeatMeta } from "@/backend/SaveService";
import { getLeagueData } from "@/backend/advanceDay";
import { objectiveFromSquads } from "@/backend/boardWorld";
import { buildOffer, loadJobWorld, reputationOf } from "@/backend/jobWorld";
import { answerDelay, applicationChance, liveRefusals, securityLevel, type SecurityLevel } from "@/Domain/jobs/application";
import { formPpg } from "@/Domain/managers/aiManagers";
import { compensationFee } from "@/Domain/managers/managerContract";
import { seasonLabel } from "@/Domain/history/history";
import { addDays, daysBetween } from "@/Domain/dates";
import { mulberry32, seedFrom } from "@/Domain/rng";
import { competitionName } from "@/Domain/world/labels";
import type { JobApplication } from "@/types/jobTypes";
import type { LeagueData, Squad } from "@/types/playerTypes";

/** Job security of every club of a league and the human's applications (8.9.29). */

export interface JobPostRow {
  squadId: string;
  clubName: string;
  managerId: string | null;
  managerName: string | null;
  /** 1..5, "vacant" (an interim waiting for the hire), null for a club with a human manager. */
  level: SecurityLevel | "vacant" | null;
  position: number | null;
  /** The board's target position (AI clubs only). */
  target: number | null;
  /** The human holding the club (another seat or this one). */
  human: boolean;
  /** This seat cannot apply: its own club, a human club, an open application or a recent refusal. */
  blocked: "own" | "human" | "refused" | null;
}

export interface JobPostsView {
  league: string;
  rows: JobPostRow[];
  application: Omit<JobApplication, "accepted" | "offer"> | null;
  employed: boolean;
}

export async function jobPosts(service: SaveService, saveId: string, meta: SeatMeta, league: string): Promise<JobPostsView | null> {
  const index = await service.getSquadIndex(saveId);
  const teams = index.inLeague(league);
  if (teams.length === 0) return null;
  const date = meta.currentDate ?? "";
  const state = (meta.activeLeagues ?? []).find((l) => l.leagueSlug === league);
  const table = (await service.getLeagueStandings(saveId, league)) ?? [];
  const played = table.length > 0 ? Math.max(...table.map((r) => r.mp)) : 0;
  const progress = state && state.totalRounds > 0 ? played / state.totalRounds : 0;
  const season = state ? seasonLabel(state.year, state.start, state.end) : "";
  const managers = await service.getManagers(saveId);
  const humanClubs = await service.humanClubIds(saveId);
  const vacancies = meta.managerVacancies ?? {};
  const refused = liveRefusals(meta.jobRefused, date, daysBetween);

  // The board target: cached on the AI managers by the Monday review, else computed from the squads.
  let squads: Squad[] | null = null;
  const zones = (await getLeagueData()).find((l) => l.slug === league)?.zones ?? [];
  const targetOf = async (squadId: string): Promise<number> => {
    const m = managers.find((x) => x.squadId === squadId && !x.seatId);
    if (m?.target?.season === season) return m.target.target;
    squads ??= (await Promise.all(teams.map((t) => service.getSquadById(saveId, t.squadId)))).filter((s): s is Squad => !!s);
    return objectiveFromSquads({ squads, playerSquadId: squadId, leagueSlug: league, zones, season })?.target ?? Math.ceil(teams.length / 2);
  };

  const rows: JobPostRow[] = [];
  for (const t of teams) {
    const i = table.findIndex((r) => r.squadId === t.squadId);
    const row = i >= 0 ? table[i]! : null;
    const m = managers.find((x) => x.squadId === t.squadId);
    const human = humanClubs.has(t.squadId);
    let level: JobPostRow["level"] = null;
    const target = human ? null : await targetOf(t.squadId);
    if (!human) {
      if (vacancies[t.squadId] || m?.interim) level = "vacant";
      else {
        level = securityLevel({
          ...(row && row.mp > 0 ? { position: i + 1 } : {}),
          target: target!, size: teams.length,
          form: formPpg(row?.form), progress,
          ...(m?.hiredOn ? { daysInCharge: daysBetween(m.hiredOn, date) } : {}),
        });
      }
    }
    rows.push({
      squadId: t.squadId, clubName: t.name, managerId: m?.id ?? null, managerName: m?.name ?? null, level,
      position: row && row.mp > 0 ? i + 1 : null, target, human,
      blocked: t.squadId === meta.clubId ? "own" : human ? "human" : refused[t.squadId] ? "refused" : null,
    });
  }
  rows.sort((a, b) => (a.position ?? 99) - (b.position ?? 99) || a.clubName.localeCompare(b.clubName));
  const app = meta.jobApplication;
  return {
    league, rows, employed: !!meta.clubId && !meta.unemployed,
    application: app ? { squadId: app.squadId, clubName: app.clubName, leagueSlug: app.leagueSlug, leagueName: app.leagueName, on: app.on, answerOn: app.answerOn } : null,
  };
}

export type ApplyResult = { ok: true; application: JobApplication } | { ok: false; status: number; error: string };

/** Sends an application: the board's answer is drawn now (level × fit) and delivered on `answerOn` by the day advance. */
export async function applyForJob(service: SaveService, saveId: string, seatId: string, meta: SeatMeta, squadId: string): Promise<ApplyResult> {
  const date = meta.currentDate ?? "";
  if (meta.jobApplication) return { ok: false, status: 409, error: "alreadyApplied" };
  const index = await service.getSquadIndex(saveId);
  const league = index.byId(squadId)?.leagueSlug;
  if (!league) return { ok: false, status: 404, error: "notFound" };
  const view = await jobPosts(service, saveId, meta, league);
  const row = view?.rows.find((r) => r.squadId === squadId);
  if (!row || row.level === null) return { ok: false, status: 409, error: "human" };
  if (row.blocked) return { ok: false, status: 409, error: row.blocked };
  const world = await loadJobWorld(service, saveId, index, meta.activeLeagues ?? []);
  const reputation = await reputationOf(service, saveId, meta);
  const prestige = world.prestige.get(squadId) ?? 0.5;
  const rng = mulberry32(seedFrom(`application:${saveId}:${seatId}:${squadId}:${date}`));
  const accepted = rng() < applicationChance({ level: row.level, prestige, reputation });
  const answerOn = addDays(date, answerDelay(rng));
  const offer = accepted
    ? await buildOffer({
      service, saveId, world, squadId, window: "application", date: answerOn, expires: answerOn,
      activeLeagues: meta.activeLeagues ?? [], index, reputation,
      compensation: meta.clubId && !meta.unemployed ? compensationFee(meta.managerContract, answerOn) : 0,
    })
    : null;
  const catalog = (await getLeagueData()) as unknown as LeagueData[];
  const application: JobApplication = {
    squadId, clubName: row.clubName, leagueSlug: league, leagueName: competitionName(league, catalog, "en"),
    on: date, answerOn, accepted: !!offer, ...(offer ? { offer } : {}),
  };
  await service.updateSeat(saveId, seatId, { jobApplication: application });
  return { ok: true, application };
}
