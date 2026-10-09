/**
 * M3 of the referees (`docs/superpowers/specs/2026-10-09-referees-design.md` §7): one season of appointments for the
 * whole world on a throwaway save, calendar only (no match is played). Called by `referee-measure.ts schedule [days]`.
 */
import { saveService } from "@/backend/SaveService";
import { ensureAssignments } from "@/backend/refereeWorld";
import { addOneDay, daysBetween } from "@/Domain/dates";
import { fixtureKey } from "@/Domain/referees/assign";
import { REFEREE } from "@/Domain/referees/refereeConfig";
import { isYouthCompSlug } from "@/Domain/youthComps/youthCompIds";
import { emptyRefereeState } from "@/Domain/referees/stats";

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))]! : 0;
};

export async function schedule(): Promise<void> {
  const days = Number(process.argv.slice(2).filter((a) => !a.startsWith("--"))[1] ?? 365);
  const meta = await saveService.createSave({
    leagueSlug: "premier_league", leagueName: "Premier League", clubId: "33", clubName: "Measure", clubColors: ["#000000", "#ffffff"],
  });
  const saveId = meta.id;
  try {
    const pool = (await saveService.getRefereePool(saveId))!;
    const byId = new Map(pool.referees.map((r) => [r.id, r]));
    const { getLeagueData, getPyramids } = await import("@/backend/advanceDay");
    const catalog = await getLeagueData();
    const pyramids = await getPyramids();
    const topLeague = new Set(Object.values(pyramids).map((p) => p.levels[0]?.groups.map((g) => g.leagueSlug) ?? []).flat());
    for (const l of catalog) if (l.country && !pyramids[l.country]) topLeague.add(l.slug);
    // Best quarter of each country's referees by quality.
    const best = new Set<string>();
    for (const country of new Set(pool.referees.map((r) => r.country))) {
      const refs = pool.referees.filter((r) => r.country === country && r.role === "referee").sort((a, b) => b.quality - a.quality);
      for (const r of refs.slice(0, Math.ceil(refs.length / 4))) best.add(r.id);
    }
    const matchesOf = new Map<string, number>();
    const seqByClub = new Map<string, string[]>();
    let date = meta.currentDate!;
    let appointments = 0, unassigned = 0, sameDay = 0, restRelax = 0, rotationRelax = 0, topMatches = 0, topByBest = 0, continental = 0, continentalSameCountry = 0;
    for (let d = 0; d < days; d++, date = addOneDay(date)) {
      await saveService.updateMeta(saveId, { currentDate: date });
      const fixtures = (await saveService.getFixturesForDate(saveId, date)).filter((f) => !isYouthCompSlug(f.competition));
      if (fixtures.length === 0) continue;
      const before = (await saveService.getRefereeState(saveId)) ?? emptyRefereeState();
      const a = await ensureAssignments(saveService, saveId, date);
      const used = new Set<string>();
      const state = (await saveService.getRefereeState(saveId))!;
      for (const f of fixtures) {
        const x = a[fixtureKey(f.competition, f.id)];
        if (!x) { unassigned++; continue; }
        appointments++;
        for (const id of [x.refereeId, ...x.assistantIds]) {
          if (used.has(id)) sameDay++;
          used.add(id);
          const last = before.lastWorked[id];
          if (last && daysBetween(last, date) < REFEREE.REST_DAYS) restRelax++;
        }
        const recent = new Set([...(before.recentByClub[f.home] ?? []), ...(before.recentByClub[f.away] ?? [])]);
        if (recent.has(x.refereeId)) rotationRelax++;
        matchesOf.set(x.refereeId, (matchesOf.get(x.refereeId) ?? 0) + 1);
        for (const club of [f.home, f.away]) seqByClub.set(club, [...(seqByClub.get(club) ?? []), x.refereeId]);
        if (topLeague.has(f.competition)) { topMatches++; if (best.has(x.refereeId)) topByBest++; }
        if (["ucl", "uel", "lib", "sud"].includes(f.competition)) {
          continental++;
          const lm = await saveService.getLeagueMeta(saveId, f.competition);
          const c = byId.get(x.refereeId)!.country;
          if (c === lm?.continental?.countryOf[f.home] || c === lm?.continental?.countryOf[f.away]) continentalSameCountry++;
        }
        // The match "was played": rest and rotation as the day advance records them.
        state.lastWorked[x.refereeId] = date;
        for (const id of x.assistantIds) state.lastWorked[id] = date;
        for (const club of [f.home, f.away]) state.recentByClub[club] = [x.refereeId, ...(state.recentByClub[club] ?? []).filter((r) => r !== x.refereeId)].slice(0, REFEREE.RECENT_PER_CLUB);
      }
      await saveService.writeRefereeState(saveId, state);
    }
    const counts = pool.referees.filter((r) => r.role === "referee").map((r) => matchesOf.get(r.id) ?? 0);
    let longest = 0;
    for (const seq of seqByClub.values()) {
      let run = 1;
      for (let i = 1; i < seq.length; i++) { run = seq[i] === seq[i - 1] ? run + 1 : 1; longest = Math.max(longest, run); }
    }
    console.log(`dias ${days}, partidas com árbitro ${appointments}, sem escala ${unassigned}`);
    console.log(`jogos por árbitro: p10 ${pct(counts, 0.1)} · p50 ${pct(counts, 0.5)} · p90 ${pct(counts, 0.9)} · máx ${Math.max(...counts)} (árbitros ${counts.length})`);
    const refs = pool.referees.filter((r) => r.role === "referee");
    const idle = refs.filter((r) => !matchesOf.has(r.id));
    const meanQ = (xs: { quality: number }[]) => (xs.length ? xs.reduce((s, r) => s + r.quality, 0) / xs.length : 0).toFixed(1);
    console.log(`sem jogos: ${idle.length} (${((idle.length / refs.length) * 100).toFixed(1)}%), qualidade média ${meanQ(idle)} × ${meanQ(refs.filter((r) => matchesOf.has(r.id)))} dos que apitaram; países com alguém parado: ${new Set(idle.map((r) => r.country)).size}`);
    console.log(`mesmo dia duas vezes: ${sameDay}; descanso < ${REFEREE.REST_DAYS} dias (relaxado): ${restRelax}; rodízio relaxado: ${rotationRelax}`);
    console.log(`maior sequência do mesmo árbitro com um clube: ${longest}`);
    console.log(`1ª divisão: ${topMatches} jogos, ${((topByBest / Math.max(1, topMatches)) * 100).toFixed(1)}% com os 25% melhores do país`);
    console.log(`continental: ${continental} jogos, ${continentalSameCountry} com árbitro do país de um dos clubes`);
  } finally {
    await saveService.deleteSave(saveId);
  }
}
