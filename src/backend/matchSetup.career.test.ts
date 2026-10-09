import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { advanceDayRoutes, runBufferedDay } from "@/backend/advanceDay";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { autoLineupForFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId } from "@/Domain/matchFormations";
import type { TacticsSave } from "@/types/tacticsTypes";

// Long reproduction (manual): a Brazilian career advanced day by day, opening the match preview
// (/api/match-setup) on every main-team match day — league home/away, cup and Libertadores.
// Opt-in because it takes minutes: MS_DAYS=55 MS_CLUB=126 MS_FORMATION=4-2-3-1 bun test src/backend/matchSetup.career.test.ts --timeout 1200000
const CLUB = process.env.MS_CLUB ?? "127";
const FORMATION = process.env.MS_FORMATION ?? "4-3-3";

describe("/api/match-setup, Brazilian career (brazil_serie_a)", () => {
  let saveId = "";
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test.skipIf(!process.env.MS_DAYS)("every main-team match day of the first weeks answers JSON 200", async () => {
    const created = await saveService.createSave({
      leagueSlug: "brazil_serie_a", leagueName: "Brasileirão Série A",
      clubId: CLUB, clubName: "Club", clubColors: ["#c8102e", "#000000"],
    });
    saveId = created.id;
    const { user, session } = devAutoLogin(`match-setup-fla-${saveId}@test.local`);
    recordSaveOwnership(saveId, user.id);
    const cookie = `fs_session=${session.token}`;
    const pre = await advanceDayRoutes["/api/saves/:saveId/presimulate"](Object.assign(
      new Request(`http://localhost/api/saves/${saveId}/presimulate`, { method: "POST", headers: { cookie } }),
      { params: { saveId } },
    ));
    expect(pre.status).toBe(200);

    const mySquad = (await saveService.getSquadById(saveId, CLUB))!;
    const tactics: TacticsSave = { tactical_style: "balanced", formation: FORMATION, lineup: autoLineupForFormation(mySquad, formationForSimId(FORMATION)) };
    await saveService.saveTactics(saveId, tactics);

    // Advance day by day (as the player does); on every main-team match day open the preview.
    const DAYS = Number(process.env.MS_DAYS);
    const seen: string[] = [];
    for (let i = 0; i < DAYS; i++) {
      const meta = (await saveService.getMeta(saveId))!;
      const today = (await saveService.getFixturesForDate(saveId, meta.currentDate!))
        .filter((f) => (f.home === CLUB || f.away === CLUB) && !f.played);
      if (today.length > 0) {
        const res = await apiRoutes["/api/match-setup"](new Request(`http://localhost/api/match-setup?saveId=${saveId}`, {
          headers: { cookie },
        }));
        const text = await res.text();
        seen.push(`${meta.currentDate} ${today[0]!.competition} ${today[0]!.home === CLUB ? "home" : "away"} ${res.status}`);
        if (res.status !== 200) console.log(seen.at(-1), text.slice(0, 300));
        expect(res.status).toBe(200);
        expect(() => JSON.parse(text)).not.toThrow();
      }
      const out = await runBufferedDay(saveId, null);
      expect(out.ok).toBe(true);
    }
    console.log(seen.join(" | "));
    expect(seen.length).toBeGreaterThan(2);
  }, 600_000);
});
