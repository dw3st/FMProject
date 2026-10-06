/**
 * Scouting (`.claude/rules/game/scouting.md`): cost of blurring every player of the world for the
 * scout search, per-player knowledge (now) vs the old uniform chief-scout noise. Creates a career,
 * measures, deletes it.
 *
 *   bun scripts/scouting-index-bench.ts [repeats=5]
 */
import { saveService } from "@/backend/SaveService";
import { loadViewer, obscurePlayerForViewer, obscureSquadForViewer } from "@/backend/scoutingWorld";
import { obscurePlayer, obscureSquad } from "@/Domain/staff/staff";
import { mapFreeAgentsToScoutPlayers, mapSquadsToScoutPlayers } from "@/Domain/scout/scoutQuery";

const repeats = Number(process.argv[2] ?? 5);
const meta = await saveService.createSave({
  leagueSlug: "premier_league", leagueName: "Premier League",
  clubId: "33", clubName: "Bench", clubColors: ["#000000", "#ffffff"],
});
try {
  const squads = await saveService.getAllSquads(meta.id);
  const free = await saveService.getFreeAgents(meta.id);
  const players = squads.reduce((n, s) => n + s.players.length, 0);
  const time = (f: () => unknown) => {
    const t0 = performance.now();
    for (let i = 0; i < repeats; i++) f();
    return (performance.now() - t0) / repeats;
  };
  const oldMs = time(() => {
    const seen = squads.map((s) => (s.id === meta.clubId ? s : obscureSquad(s, 0.6, meta.id)));
    mapSquadsToScoutPlayers(seen);
    mapFreeAgentsToScoutPlayers(free.map((f) => ({ ...f, player: obscurePlayer(f.player, 0.6, meta.id) })));
  });
  const viewer = (await loadViewer(saveService, meta.id, { squads }))!;
  const newMs = time(() => {
    const seen = squads.map((s) => obscureSquadForViewer(viewer, s));
    mapSquadsToScoutPlayers(seen);
    mapFreeAgentsToScoutPlayers(free.map((f) => ({ ...f, player: obscurePlayerForViewer(viewer, f.player, "") })));
  });
  const t0 = performance.now();
  await loadViewer(saveService, meta.id, { squads });
  const viewerMs = performance.now() - t0;
  console.log(`players ${players}, free ${free.length}`);
  console.log(`old uniform blur + rows: ${oldMs.toFixed(0)} ms`);
  console.log(`per-player blur + rows:  ${newMs.toFixed(0)} ms (viewer load ${viewerMs.toFixed(0)} ms, cached fame) → ×${(newMs / oldMs).toFixed(2)}`);
} finally {
  await saveService.deleteSave(meta.id);
}
