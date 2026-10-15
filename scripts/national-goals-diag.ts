/**
 * Goal volume of the AI national-team games (quickSim), day by day on a fresh career (clubs frozen, like
 * `national-sim.ts`): goals and xG per game, the xG inputs (level, pace edge, forward finishing, strength ratio),
 * fitness, share of generated players, and the Elo favourite's win / upset / draw rates — by year, competition kind
 * and confederation (`X` = cross-confederation). `NATIONAL_MATCH_OVERRIDES='{...}'` overrides
 * `NATIONAL_MATCH` (e.g. `{"AT_REF":1.4,"SLOPE":0}` = a flat × 1,4).
 *   bun scripts/national-goals-diag.ts [until=2027-06-30]
 */
import { saveService } from "@/backend/SaveService";
import { playNationalDay, callUpSquad, nationalPseudoSquad } from "@/backend/nationalWorld";
import { addDays } from "@/Domain/dates";
import { quickSimMatch, teamLevel, xiLevel, type TeamStrength } from "@/Domain/advanceDay/quickSim";
import { nationalLineup, NATIONAL_SQUAD } from "@/Domain/national/nationalSquad";
import { formationForSimId } from "@/Domain/matchFormations";
import { slotRoles } from "@/Domain/advanceDay/matchSimulationLineups";
import { mulberry32 } from "@/Domain/rng";
import { NATIONAL_MATCH, nationalGoalScale } from "@/Domain/national/nationalMatch";

// NATIONAL_MATCH_OVERRIDES='{"AT_REF":1.4,"SLOPE":0}' tries other constants (a flat factor: SLOPE 0).
if (process.env.NATIONAL_MATCH_OVERRIDES) Object.assign(NATIONAL_MATCH, JSON.parse(process.env.NATIONAL_MATCH_OVERRIDES));

const until = process.argv[2] ?? "2027-06-30";
const meta = await saveService.createSave({
  leagueSlug: "premier_league", leagueName: "Premier League", clubId: "33", clubName: "Sim", clubColors: ["#000000", "#ffffff"],
});
const saveId = meta.id;
let date = meta.currentDate!;
const roles = slotRoles(formationForSimId(NATIONAL_SQUAD.FORMATION));
interface Row { year: string; fit: number; gen: number; kind: string; confed: string; neutral: boolean; xg: number; goals: number; h: TeamStrength; a: TeamStrength; eloDiff: number; favWin: number; draw: number }
const rows: Row[] = [];
try {
  while (date <= until) {
    const state0 = (await saveService.getNationalState(saveId))!;
    const pending = new Map<string, { year: string; fit: number; gen: number; kind: string; confed: string; neutral: boolean; xg: number; h: TeamStrength; a: TeamStrength; eloDiff: number }>();
    for (const slug of state0.competitions) {
      const c = (await saveService.getNationalComp(saveId, slug))!;
      for (const fx of c.fixtures.filter((f) => f.date === date && !f.played)) {
        const hs = await callUpSquad(saveId, state0, fx.home, (id) => saveService.getSquadById(saveId, id));
        const as = await callUpSquad(saveId, state0, fx.away, (id) => saveService.getSquadById(saveId, id));
        if (!hs || !as) continue;
        const hq = nationalPseudoSquad(state0, fx.home, hs.players), aq = nationalPseudoSquad(state0, fx.away, as.players);
        const hl = nationalLineup(hs.players, date), al = nationalLineup(as.players, date);
        const r = quickSimMatch({
          fixtureId: fx.id, home: hq, away: aq, homeLineup: hl, awayLineup: al, homeRoles: roles, awayRoles: roles,
          ...(fx.neutral ? { neutral: true } : {}),
          goalScale: nationalGoalScale((xiLevel(hq, hl, roles) + xiLevel(aq, al, roles)) / 2),
        }, mulberry32(1));
        const th = state0.teams[fx.home]!, ta = state0.teams[fx.away]!;
        const xiIds = [...nationalLineup(hs.players, date), ...nationalLineup(as.players, date)];
        const all = new Map([...hs.players, ...as.players].map((p) => [p.id, p]));
        const fits = xiIds.map((id) => all.get(id)?.seasonLog?.fitness ?? 75);
        const gen = xiIds.filter((id) => id.startsWith("ngen_")).length / xiIds.length;
        pending.set(`${slug}:${fx.id}`, { year: date.slice(0, 4), fit: fits.reduce((s, v) => s + v, 0) / fits.length, gen, kind: c.kind, confed: th.confed === ta.confed ? th.confed : "X", neutral: !!fx.neutral,
          xg: r.breakdown.xgHome + r.breakdown.xgAway, h: r.breakdown.home, a: r.breakdown.away, eloDiff: th.elo - ta.elo });
      }
    }
    const index = await saveService.getSquadIndex(saveId);
    const day = await playNationalDay({ service: saveService, saveId, date, index, humanClubs: new Map([[meta.clubId, meta.seatId]]), squadOf: (id) => saveService.getSquadById(saveId, id) });
    for (const s of day.squads.values()) await saveService.saveSquadById(saveId, s);
    if (pending.size) {
      const st = (await saveService.getNationalState(saveId))!;
      for (const slug of st.competitions) {
        const c = (await saveService.getNationalComp(saveId, slug))!;
        for (const fx of c.fixtures) {
          const p = pending.get(`${slug}:${fx.id}`);
          if (!p || !fx.result) continue;
          const g = fx.result.home + fx.result.away;
          const favHome = p.eloDiff >= 0;
          const fw = fx.result.home === fx.result.away ? 0 : ((fx.result.home > fx.result.away) === favHome ? 1 : 0);
          rows.push({ ...p, goals: g, favWin: fw, draw: fx.result.home === fx.result.away ? 1 : 0 });
        }
      }
    }
    date = addDays(date, 1);
  }
} finally {
  await saveService.deleteSave(saveId);
}
const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / Math.max(1, xs.length);
function report(label: string, rs: Row[]) {
  if (!rs.length) return;
  const lv = mean(rs.map((r) => (teamLevel(r.h) + teamLevel(r.a)) / 2));
  const pace = mean(rs.flatMap((r) => [r.h.forwardPace - r.a.defensePace, r.a.forwardPace - r.h.defensePace]));
  const fin = mean(rs.flatMap((r) => [r.h.forwardFinishing, r.a.forwardFinishing]));
  const lratio = mean(rs.flatMap((r) => [Math.log((r.h.attack * r.h.midfield) / (r.a.defense * r.a.goalkeeper)), Math.log((r.a.attack * r.a.midfield) / (r.h.defense * r.h.goalkeeper))]));
  const fp = mean(rs.flatMap((r) => [r.h.forwardPace, r.a.forwardPace])); const dp = mean(rs.flatMap((r) => [r.h.defensePace, r.a.defensePace]));
  console.log(`${label}: fwdPace ${fp.toFixed(2)} defPace ${dp.toFixed(2)}, fôlego ${mean(rs.map((r) => r.fit)).toFixed(1)}, gerados ${(100 * mean(rs.map((r) => r.gen))).toFixed(0)}%, n ${rs.length}, gols ${mean(rs.map((r) => r.goals)).toFixed(2)}, xG ${mean(rs.map((r) => r.xg)).toFixed(2)}, nível ${lv.toFixed(2)}, paceEdge ${pace.toFixed(2)}, final. FWD ${fin.toFixed(2)}, log ratio ${lratio.toFixed(3)}, neutro ${mean(rs.map((r) => (r.neutral ? 1 : 0))).toFixed(2)}, fav vence ${(100 * mean(rs.filter((r) => Math.abs(r.eloDiff) > 0).map((r) => r.favWin))).toFixed(0)}%, fav vence |Δ|>200 ${(100 * mean(rs.filter((r) => Math.abs(r.eloDiff) > 200).map((r) => r.favWin))).toFixed(0)}% (n ${rs.filter((r) => Math.abs(r.eloDiff) > 200).length}), zebra ${(100 * mean(rs.filter((r) => Math.abs(r.eloDiff) > 0).map((r) => 1 - r.favWin - r.draw))).toFixed(0)}%, empate ${(100 * mean(rs.map((r) => r.draw))).toFixed(0)}%, |Δelo| ${mean(rs.map((r) => Math.abs(r.eloDiff))).toFixed(0)}`);
}
report("total", rows);
for (const y of [...new Set(rows.map((r) => r.year))]) report(y, rows.filter((r) => r.year === y));
for (const k of ["friendlies", "qualifier", "tournament"]) report(k, rows.filter((r) => r.kind === k));
for (const cf of ["UEFA", "CONMEBOL", "CAF", "AFC", "CONCACAF", "OFC", "X"]) report(cf, rows.filter((r) => r.confed === cf));
