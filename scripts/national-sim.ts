/**
 * M2 of the national-teams spec: the national day alone, day by day, over several years (clubs frozen: no club
 * games, training or market), on a fresh Premier League career. Prints the competitions, the goals per game, the
 * Elo top and bottom, the tournament champions and awards, the coach sackings and the time per national day.
 *
 *   bun scripts/national-sim.ts [until=2030-07-20]
 */
import { saveService } from "@/backend/SaveService";
import { playNationalDay } from "@/backend/nationalWorld";
import { addDays } from "@/Domain/dates";
import { rankTeams } from "@/Domain/national/elo";

const until = process.argv[2] ?? "2030-07-20";
const meta = await saveService.createSave({
  leagueSlug: "premier_league", leagueName: "Premier League", clubId: "33", clubName: "Sim", clubColors: ["#000000", "#ffffff"],
});
const saveId = meta.id;
let date = meta.currentDate!;
let played = 0;
let busyDays = 0;
let busyMs = 0;
const startState = (await saveService.getNationalState(saveId))!;
console.log(`seleções: ${Object.keys(startState.teams).length}`);
try {
  while (date <= until) {
    const index = await saveService.getSquadIndex(saveId);
    const t0 = performance.now();
    const day = await playNationalDay({
      service: saveService, saveId, date, index, humanClubId: "33",
      squadOf: (id) => saveService.getSquadById(saveId, id),
    });
    for (const s of day.squads.values()) await saveService.saveSquadById(saveId, s);
    const ms = performance.now() - t0;
    if (day.played > 0 || day.squads.size > 0) { busyDays++; busyMs += ms; }
    played += day.played;
    date = addDays(date, 1);
  }
  const state = (await saveService.getNationalState(saveId))!;
  let goals = 0;
  let games = 0;
  const rows: string[] = [];
  for (const slug of state.competitions) {
    const c = (await saveService.getNationalComp(saveId, slug))!;
    const done = c.fixtures.filter((f) => f.played && f.result);
    const g = done.reduce((s, f) => s + f.result!.home + f.result!.away, 0);
    goals += g;
    games += done.length;
    const champ = c.championId ? state.teams[c.championId]?.nation : "";
    const aw = c.awards;
    rows.push(`| ${slug} | ${c.status} | ${c.teams.length} | ${done.length}/${c.fixtures.length} | ${done.length ? (g / done.length).toFixed(2) : "-"} | ${champ ?? ""} | ${aw?.bestPlayer?.name ?? ""} | ${aw?.topScorer ? `${aw.topScorer.name} (${aw.topScorer.value})` : ""} |`);
  }
  console.log("| competição | status | seleções | jogos | gols/jogo | campeão | melhor jogador | artilheiro |\n|---|---|---|---|---|---|---|---|");
  console.log(rows.join("\n"));
  console.log(`jogos ${played}, gols/jogo ${(goals / Math.max(1, games)).toFixed(2)}, dias com seleções ${busyDays}, média ${(busyMs / Math.max(1, busyDays)).toFixed(0)} ms`);
  const ranked = rankTeams(Object.values(state.teams));
  console.log("top 10:", ranked.slice(0, 10).map((t) => `${t.nation} ${Math.round(t.elo)}`).join(", "));
  console.log("fundo 5:", ranked.slice(-5).map((t) => `${t.nation} ${Math.round(t.elo)}`).join(", "));
  const managers = await saveService.getManagers(saveId);
  const sacked = managers.filter((m) => (m.clubs ?? []).some((c) => c.squadId.startsWith("nat_") && c.left === "sacked")).length;
  console.log(`técnicos de seleção demitidos: ${sacked}; vagas abertas: ${Object.keys(state.vacancies).length}`);
  const titles = managers.flatMap((m) => m.titles.filter((t) => t.kind === "national").map((t) => `${m.name} ${t.competition}`));
  console.log("títulos de técnico:", titles.join("; "));
} finally {
  await saveService.deleteSave(saveId);
}
