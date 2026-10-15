/**
 * Group advance (multiplayer part 3): real time to the next stop with 3 seats in 3 leagues, and a flow with a live
 * match, simulated matches and an expired deadline. `bun scripts/group-advance-measure.ts [days=30]`.
 * The save (and its member / code rows) is always deleted at the end. Runs against the local `src/Data`.
 */
import { fileURLToPath } from "node:url";

// Windows-safe default for the runtime dir; must be set before backend modules load.
process.env.RUNTIME_DATA_DIR ||= fileURLToPath(new URL("../src/Data", import.meta.url));

const { saveService } = await import("@/backend/SaveService");
const { devAutoLogin } = await import("@/backend/auth/AuthService");
const { ownSolo } = await import("@/backend/testing/seatFixtures");
const { runningWorld } = await import("@/backend/testing/worldFixtures");
const { addSeat } = await import("@/backend/seats");
const { applyBroadcasting } = await import("@/backend/FinancialService");
const { applyRandomStartKit } = await import("@/backend/startKits");
const { kickWorld, seatMatchOn, setKickScheduler } = await import("@/backend/groupAdvance");
const { seatNextMatchDate } = await import("@/backend/advanceUntil");
const { deleteSaveMembers } = await import("@/backend/auth/saveOwnership");
const { deleteWorldCode } = await import("@/backend/worlds/worldStore");
const { addDays } = await import("@/Domain/dates");

const DAYS = Number(process.argv[2] ?? 30);
setKickScheduler(() => {});

const owner = devAutoLogin("ga-measure-a@test.local");
const meta = await saveService.createSave({
  leagueSlug: "premier_league", leagueName: "Premier League",
  clubId: "33", clubName: "Man Utd", clubColors: ["#da291c", "#ffffff"],
  manager: { name: "A", nationalityIso: "gb", backgroundId: "former-player" },
});
const saveId = meta.id;
try {
  await applyBroadcasting(saveId, meta, meta.leagueSlug, meta.clubId, meta.seatId);
  const kit = await applyRandomStartKit(saveId);
  console.log(`save ${saveId}, kit: ${kit.applied ? kit.kit : kit.reason}`);
  const a = await ownSolo(saveId, owner.user.id);
  const index = await saveService.getSquadIndex(saveId);
  const b = (await addSeat(saveId, {
    userId: devAutoLogin("ga-measure-b@test.local").user.id, clubId: index.inLeague("la_liga")[0]!.squadId,
    manager: { name: "B", nationalityIso: "es", backgroundId: "former-player" },
  })).seatId;
  const c = (await addSeat(saveId, {
    userId: devAutoLogin("ga-measure-c@test.local").user.id, clubId: index.inLeague("brazil_serie_a")[0]!.squadId,
    manager: { name: "C", nationalityIso: "br", backgroundId: "former-player" },
  })).seatId;
  const seats = [a, b, c];
  await saveService.updateMeta(saveId, { world: runningWorld(owner.user.id, { deadlineHours: 12 }) });
  const start = (await saveService.getMeta(saveId))!.currentDate!;
  console.log(`start ${start}, seats ${seats.join(", ")}`);
  const stops: { days: number; ms: number; waiting: number }[] = [];
  let liveUsed = false;
  let deadlineUsed = false;

  while ((await saveService.getMeta(saveId))!.currentDate! < addDays(start, DAYS)) {
    const today = (await saveService.getMeta(saveId))!.currentDate!;
    for (const seatId of seats) {
      const game = await seatMatchOn(saveService, saveId, seatId, today);
      if (game && !(await saveService.getSeat(saveId, seatId))!.matchDecision) {
        if (!liveUsed && seatId === a) {
          await saveService.writeLiveRecording(saveId, a, {
            date: today, fixtureId: game.id,
            recording: {
              fixtureId: game.id, score: { home: 1, away: 0 }, teamStats: { home: {} as never, away: {} as never },
              playerStats: {}, playerRatings: {}, playerEnergy: {}, substitutions: [], durationMs: 1,
            } as never,
          });
          await saveService.updateSeat(saveId, a, { matchDecision: { date: today, fixtureId: game.id, mode: "live" } });
          liveUsed = true;
          console.log(`live recording injected for A on ${today}`);
        } else {
          await saveService.updateSeat(saveId, seatId, { matchDecision: { date: today, fixtureId: game.id, mode: "simulate" } });
        }
      }
      const next = await seatNextMatchDate(saveService, saveId, seatId, addDays(today, 1));
      const late = !deadlineUsed && seatId === c && stops.length === 2;
      await saveService.updateSeat(saveId, seatId, { readyUntil: late ? null : (next ?? addDays(today, 7)) });
    }
    if (!deadlineUsed && stops.length === 2) {
      const w = (await saveService.getMeta(saveId))!.world!;
      await saveService.updateMeta(saveId, {
        world: { ...w, advance: { running: false, target: today, waitingSince: new Date(Date.now() - 13 * 3_600_000).toISOString() } },
      });
      deadlineUsed = true;
      console.log(`C is late on ${today}; waitingSince set 13 h back (deadline 12 h)`);
    }
    const t0 = performance.now();
    const r = await kickWorld(saveId);
    const ms = performance.now() - t0;
    if (r.error) throw new Error(`stop ${stops.length + 1}: ${r.error}`);
    stops.push({ days: r.days, ms, waiting: r.waitingFor.length });
    console.log(`stop ${stops.length}: ${r.days} days to ${r.date} in ${(ms / 1000).toFixed(1)} s (${r.days ? (ms / r.days / 1000).toFixed(2) : "-"} s/day), waiting ${r.waitingFor.length}`);
    if (r.days === 0 && stops.length > 40) throw new Error("the world does not move");
  }

  const days = stops.reduce((s, x) => s + x.days, 0);
  const ms = stops.reduce((s, x) => s + x.ms, 0);
  const auto = (await saveService.getInbox(saveId, c)).filter((m) => m.category === "world").length;
  console.log(`\n${days} days, ${stops.length} stops, ${(ms / 1000).toFixed(1)} s, ${(ms / days / 1000).toFixed(2)} s/day, ` +
    `${(ms / stops.length / 1000).toFixed(1)} s per stop; live used ${liveUsed}; deadline messages for C: ${auto}`);
} finally {
  await saveService.deleteSave(saveId);
  deleteSaveMembers(saveId);
  deleteWorldCode(saveId);
  console.log(`deleted save ${saveId}`);
}
process.exit(0);
