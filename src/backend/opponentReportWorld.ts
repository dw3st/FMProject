import type { SaveService } from "@/backend/SaveService";
import { CONTINENTAL_SLUGS } from "@/Domain/continental/competitions";
import { cupSlugOf } from "@/Domain/cups/cupIds";
import { OPPONENT_REPORT, buildOpponentReport, playedGamesOf, type OpponentReport } from "@/Domain/scouting/opponentReport";
import type { Squad } from "@/types/playerTypes";
import type { ClubPlan } from "@/Domain/study/tacticalKnowledge";

interface Entry { report: OpponentReport; plans: ClubPlan[] }
const cache = new Map<string, Entry>();

/**
 * The pre-match analyst's report on a club (tester report 955c069c): its league, the country's cup and the
 * continental competitions, played games only; formations from the day logs of the latest games. Cached per save,
 * club and game date.
 */
export async function opponentReport(service: SaveService, saveId: string, squad: Squad, currentDate: string): Promise<OpponentReport> {
  return (await reportEntry(service, saveId, squad, currentDate)).report;
}

/** The club's own plans (formation and style) in its latest games with a day log, newest first. */
export async function opponentRecentPlans(service: SaveService, saveId: string, squad: Squad, currentDate: string): Promise<ClubPlan[]> {
  return (await reportEntry(service, saveId, squad, currentDate)).plans;
}

async function reportEntry(service: SaveService, saveId: string, squad: Squad, currentDate: string): Promise<Entry> {
  const key = `${saveId}:${squad.id}:${currentDate}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const index = await service.getSquadIndex(saveId);
  const league = index.byId(squad.id)?.leagueSlug ?? null;
  const { getLeagueData } = await import("@/backend/advanceDay");
  const country = league ? (await getLeagueData()).find((l) => l.slug === league)?.country ?? null : null;
  const slugs = [...(league ? [league] : []), ...(country ? [cupSlugOf(country)] : []), ...CONTINENTAL_SLUGS];
  const fixtures = (await Promise.all(slugs.map((s) => service.getAllFixturesForLeague(saveId, s).catch(() => [])))).flat();
  const games = playedGamesOf(squad.id, fixtures);
  const recent = games.slice(0, OPPONENT_REPORT.TACTIC_GAMES);
  const formations = new Map<string, [string, string]>();
  const styles = new Map<string, string>();
  const dates = [...new Set(recent.map((f) => f.date))];
  const logs = await Promise.all(dates.map((d) => service.getDayLog(saveId, d).catch(() => null)));
  for (const log of logs) {
    for (const e of log?.events ?? []) {
      if (e.kind !== "match" || !e.formations) continue;
      if (e.home !== squad.id && e.away !== squad.id) continue;
      const mine = e.home === squad.id;
      formations.set(`${e.competition}:${e.fixtureId}`, mine ? [e.formations.home, e.formations.away] : [e.formations.away, e.formations.home]);
      const style = mine ? e.formations.homeStyle : e.formations.awayStyle;
      if (style) styles.set(`${e.competition}:${e.fixtureId}`, style);
    }
  }
  const built = buildOpponentReport(squad, games, formations);
  const report = { ...built, form: built.form.map((g) => ({ ...g, opponentName: index.byId(g.opponentId)?.name ?? g.opponentId })) };
  const plans: ClubPlan[] = recent.flatMap((f) => {
    const k = `${f.competition}:${f.id}`;
    const fm = formations.get(k);
    const style = styles.get(k);
    return fm && style ? [{ formation: fm[0], style: style as ClubPlan["style"] }] : [];
  });
  const entry = { report, plans };
  if (cache.size > 200) cache.clear();
  cache.set(key, entry);
  return entry;
}
