// Dev only: a two-seat world on the local server where dev@localhost (Man Utd, home) meets dev-2@localhost today,
// for the live match between two managers (`.claude/rules/game/multiplayer.md`, part 7). Log in with
// /api/auth/dev-login (localhost) and /api/auth/dev-login?as=2 (127.0.0.1). Prints the save id.
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { runningWorld } from "@/backend/testing/worldFixtures";
import { addSeat } from "@/backend/seats";
import { presimulateWorld } from "@/backend/advanceDay";

const a = devAutoLogin("dev@localhost");
const b = devAutoLogin("dev-2@localhost");
const meta = await saveService.createSave({
  leagueSlug: "premier_league", leagueName: "Premier League",
  clubId: "33", clubName: "Manchester United", clubColors: ["#da291c", "#ffffff"],
});
await saveService.updateMeta(meta.id, { mode: "multi" });
await ownSolo(meta.id, a.user.id);
await presimulateWorld(meta.id, null);
const start = (await saveService.getMeta(meta.id))!.currentDate!;
const match = (await saveService.getAllFixturesForLeague(meta.id, "premier_league"))
  .filter((f) => !f.played && f.home === "33" && f.date >= start)
  .sort((x, y) => x.date.localeCompare(y.date))[0]!;
await addSeat(meta.id, {
  userId: b.user.id, clubId: match.away,
  manager: { name: "Amigo", nationalityIso: "br", backgroundId: "former-player" },
});
await saveService.updateMeta(meta.id, { currentDate: match.date, world: runningWorld(a.user.id) });
console.log(JSON.stringify({ saveId: meta.id, date: match.date, home: match.home, away: match.away, fixtureId: match.id }));
process.exit(0);
