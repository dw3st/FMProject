import { fileURLToPath } from "node:url";
import { nationalMatchSetup } from "@/backend/nationalCoachWorld";
import { publicSeatSquad } from "@/Domain/seats/publicSquad";
import { clubCountryResolver, matchCrowd, matchManagers } from "@/backend/matchCrowd";
import { matchIsBig } from "@/backend/matchImportance";
import { matchSetupReferee } from "@/backend/refereeRoutes";
import { matchRegistration, registrationDayCtx } from "@/backend/registrationWorld";
import { seatWindowRef } from "@/backend/marketWindowWorld";
import { saveService } from "@/backend/SaveService";
import type { SeatMeta } from "@/backend/SaveService";
import type { Squad } from "@/types/playerTypes";
import { DEFAULT_TACTICAL_STYLE } from "@/types/tacticsTypes";
import type { TacticsSave } from "@/types/tacticsTypes";
import type { Fixture } from "@/types/calendarTypes";
import type { Formation } from "@/GameEngine/types";
import {
  aiMatchFormation,
  autoLineupForFormationWithFitness,
  registeredPool,
  resolveUserLineup,
  type MatchRegistration,
} from "@/Domain/advanceDay/matchSimulationLineups";
import { sanitizeSlotInstructions } from "@/Domain/tactics/slotInstructions";
import { formationForTactics } from "@/Domain/matchFormations";
import { CUSTOM_FORMATION_ID } from "@/Domain/formation/zones";
import { playerCupSlug } from "@/backend/cupWorld";
import { playerContinentalSlug } from "@/backend/continentalWorld";
import { matchPitch, type MatchPitch } from "@/Domain/facilities/pitch";
import { matchConditions, type MatchWeather } from "@/Domain/matchday/matchConditions";
import type { StadiumSun } from "@/Domain/matchday/stadiumSun";
import { matchSun, matchWeatherOf } from "@/backend/stadiumData";
import type { WeatherOfMatch } from "@/Domain/matchday/matchWeatherEffect";

// fileURLToPath (not `.pathname`): a bare `.pathname` breaks Bun.file() on Windows ("/C:/...").
const FORMATIONS_DIR = fileURLToPath(new URL("../Data/formations", import.meta.url));

export type MatchSetupResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * The match-setup of one seat for today's game (`POST /api/match-setup`).
 * - `live`: the live match (vs another seat: refused with 409 `seatOpponent`, unless `h2h`).
 * - `h2h`: the live match between two managers (multiplayer part 7): against another seat `live` answers 200 with
 *   `h2h: true`. Each seat's own side (lineup, tactics, instructions, marking, registration) comes from its own call;
 *   the opponent stays shown like an AI club (`publicSeatSquad`), never with the other seat's private data.
 * - `legacy`: the route was called without `saveId` (latest world, first opponent of the league, no fixture, crowd,
 *   registration or referee).
 */
export async function matchSetupFor(
  save: SeatMeta,
  opts: { live: boolean; h2h?: boolean; legacy?: boolean },
): Promise<MatchSetupResult> {
  const legacy = !!opts.legacy;
  const mySquad = await saveService.getSquadById(save.id, save.clubId);
  if (!mySquad) return { ok: false, status: 404, body: { error: "squad not found" } };
  const myInternalId = mySquad.id;

  let opponentSquad: Squad | null = null;
  let matchFixture: Fixture | null = null;
  let seatOpponent = false;

  if (!legacy) {
    const currentDate = save.currentDate ?? "";
    if (!currentDate) {
      return { ok: false, status: 400, body: { error: "save has no currentDate" } };
    }
    const cupSlug = await playerCupSlug(save.leagueSlug);
    const continentalSlug = await playerContinentalSlug(saveService, save.id, myInternalId);
    const todayFixtures = await saveService.getFixturesForDate(save.id, currentDate);
    const todayFixture = todayFixtures.find(
      (f) =>
        (f.competition === save.leagueSlug || f.competition === cupSlug || f.competition === continentalSlug) &&
        (f.home === myInternalId || f.away === myInternalId) &&
        !f.played,
    );
    if (!todayFixture) {
      // His national team's game of the day (Etapa 41b): the national squads, his national tactics, no crowd,
      // no registration, no referee.
      const nat = await nationalMatchSetup(saveService, save.id, save.seatId, currentDate);
      if (nat) {
        const myTactics: TacticsSave = { formation: nat.tactics.formation, tactical_style: nat.tactics.tactical_style, lineup: nat.myLineup };
        return { ok: true, body: {
          save: { ...save, clubName: nat.mySquad.name, clubColors: nat.mySquad.colors },
          mySquad: nat.mySquad,
          mySquadId: nat.teamId,
          fixture: nat.fixture,
          opponentSquad: nat.opponentSquad,
          myFormation: nat.myFormation,
          oppFormation: nat.oppFormation,
          myLineup: nat.myLineup,
          myTactics,
          injuredReplaced: [],
          rotationSuggestion: [],
          rotationApplied: [],
          oppLineup: nat.oppLineup,
          registered: null,
          matchMarking: null,
          pitchCondition: null,
          crowd: null,
          managers: null,
          referee: null,
          managerBanned: false,
          national: { teamId: nat.teamId, competition: nat.fixture.competition },
          matchDay: { date: nat.fixture.date, fixtureId: nat.fixture.id },
        } };
      }
      return { ok: false, status: 400, body: { error: "no unplayed match for your club on the current date" } };
    }
    const oppId = todayFixture.home === myInternalId ? todayFixture.away : todayFixture.home;
    // Against another seat (`.claude/rules/game/multiplayer.md`, part 4) the day's advance plays it in the full engine
    // with both seats' tactics. The preview is the normal one, the opponent read like an AI club (its own formation and
    // auto XI, never the other seat's saved tactics); only the live match (`?live=1`) is refused.
    if ((await saveService.humanClubIds(save.id)).has(oppId)) {
      if (opts.live && !opts.h2h) {
        // matchDay: a group world still records the "Simular" decision for this game.
        return { ok: false, status: 409, body: { error: "seatOpponent", matchDay: { date: todayFixture.date, fixtureId: todayFixture.id } } };
      }
      seatOpponent = true;
    }
    opponentSquad = await saveService.getSquadById(save.id, oppId);
    if (!opponentSquad) {
      return { ok: false, status: 404, body: { error: "opponent squad not found" } };
    }
    matchFixture = todayFixture;
  } else {
    const index = await saveService.getSquadIndex(save.id);
    const oppRow = index.inLeague(save.leagueSlug).find((t) => t.squadId !== myInternalId);
    if (oppRow) opponentSquad = await saveService.getSquadById(save.id, oppRow.squadId);
  }

  const tacticsRaw = await saveService.getTactics(save.id, save.seatId);

  // A manager who never saved the formation screen plays the save's formation with the automatic XI (filled below,
  // like a simulated day), instead of being sent to Formation before his first live match.
  let myTactics: TacticsSave = tacticsRaw ?? {
    formation:      save.formation ?? "4-3-3",
    tactical_style: save.tactical_style ?? DEFAULT_TACTICAL_STYLE,
    lineup:         [],
  };

  const myFormationId = myTactics.formation;

  const isCustomForm = myFormationId === CUSTOM_FORMATION_ID && !!myTactics.customFormation;
  const myFormFile  = Bun.file(`${FORMATIONS_DIR}/${myFormationId}.json`);

  if (!legacy && !isCustomForm && !(await myFormFile.exists())) {
    return { ok: false, status: 404, body: { error: `formation "${myFormationId}" not found` } };
  }

  const myFormation  = isCustomForm
    ? formationForTactics(myTactics)
    : (await myFormFile.exists()) ? await myFormFile.json() : null;

  const defaultFormation = {
    id: "4-3-3",
    attacking: [
      { role: "GK",  x: 10, y: 37 },
      { role: "LB",  x: 36, y: 11 },
      { role: "CB",  x: 38, y: 28 },
      { role: "CB",  x: 38, y: 46 },
      { role: "RB",  x: 36, y: 63 },
      { role: "CM",  x: 72, y: 24 },
      { role: "CM",  x: 72, y: 50 },
      { role: "CAM", x: 78, y: 37 },
      { role: "LW",  x: 95, y: 8  },
      { role: "ST",  x: 98, y: 37 },
      { role: "RW",  x: 95, y: 66 },
    ],
    defending: [
      { role: "GK",  x: 5,  y: 37 },
      { role: "LB",  x: 13, y: 11 },
      { role: "CB",  x: 14, y: 28 },
      { role: "CB",  x: 14, y: 46 },
      { role: "RB",  x: 13, y: 63 },
      { role: "CM",  x: 38, y: 24 },
      { role: "CM",  x: 38, y: 50 },
      { role: "CAM", x: 36, y: 37 },
      { role: "LW",  x: 50, y: 8  },
      { role: "ST",  x: 60, y: 37 },
      { role: "RW",  x: 50, y: 66 },
    ],
  };

  const resolvedMyFormation = (myFormation ?? defaultFormation) as Formation;
  const matchDate = matchFixture?.date ?? save.currentDate ?? undefined;
  // The AI opponent plays its own formation — the same choice the headless path makes.
  const oppFormation = opponentSquad && matchDate
    ? aiMatchFormation(opponentSquad, mySquad, matchDate).formation
    : null;

  // An empty (or otherwise invalid) saved lineup — e.g. a career that never touched the
  // formation screen — is filled the same way the headless path resolves it
  // (`resolveUserLineup`/`computeMatchSimulationLineups`), so a live match starts the same XI a
  // skipped/simulated day for this same fixture would have used, instead of match-setup's own
  // plain per-slot `pickForRole` fallback (via `createMatchState`'s unfilled lineup slots).
  //
  // Even a VALID 11-player saved lineup can go stale between the day it was saved and the day
  // the fixture is played — `resolveUserLineup` swaps out any starter injured on `matchDate` for
  // the best eligible bench player, and we surface which slots changed (`injuredReplaced`) so the
  // preview screen can warn the user before kickoff.
  // Registration (`.claude/rules/game/registration.md`): only registered players of both sides; the first list is
  // computed when absent (not stored here — the day advance stores it).
  let myReg: MatchRegistration | undefined;
  let oppReg: MatchRegistration | undefined;
  if (!legacy && matchFixture && opponentSquad && matchDate) {
    const regIndex = await saveService.getSquadIndex(save.id);
    const dctx = await registrationDayCtx(saveService, save.id, save, regIndex, [seatWindowRef(save)], matchDate);
    myReg = (await matchRegistration(dctx, mySquad, regIndex.byId(myInternalId)?.leagueSlug ?? save.leagueSlug, matchFixture.competition))?.reg;
    oppReg = (await matchRegistration(dctx, opponentSquad, regIndex.byId(opponentSquad.id)?.leagueSlug ?? "", matchFixture.competition))?.reg;
  }
  const resolved = resolveUserLineup(mySquad, resolvedMyFormation, myTactics.lineup ?? [], matchDate, {
    assistantRotation: myTactics.assistantRotation,
    override: save.rotationOverride,
  }, myReg);
  myTactics = { ...myTactics, lineup: resolved.lineup };
  // Player instructions: slot instructions fitted to the formation actually played, today's
  // man-marking, and the opponent's probable XI (the marking target picker).
  const slotInstructions = sanitizeSlotInstructions(resolvedMyFormation, myTactics.slotInstructions);
  myTactics = { ...myTactics, slotInstructions: slotInstructions.length > 0 ? slotInstructions : undefined };
  const oppPool = opponentSquad ? registeredPool(opponentSquad, oppReg) : null;
  const oppLineup = oppPool && oppFormation && matchDate
    ? autoLineupForFormationWithFitness(oppPool, oppFormation, matchDate)
    : [];
  const registered = myReg || oppReg
    ? {
        mine: resolved.pool ? [...resolved.pool] : mySquad.players.map((p) => p.id),
        opp: (oppPool ?? opponentSquad)?.players.map((p) => p.id) ?? [],
      }
    : null;
  const matchMarking = save.matchMarking && save.matchMarking.date === matchDate ? save.matchMarking : null;
  // Pitch of the stadium the match is played in (`src/Domain/facilities/pitch.ts`).
  let pitch: MatchPitch | null = null;
  if (matchFixture && opponentSquad && matchDate) {
    const homeSquad = matchFixture.home === myInternalId ? mySquad : opponentSquad;
    const homeLeague = (await saveService.getSquadIndex(save.id)).byId(homeSquad.id)?.leagueSlug;
    const window = (save.activeLeagues ?? []).find((l) => l.leagueSlug === homeLeague);
    pitch = matchPitch(homeSquad, matchFixture, window, matchDate);
  }
  const pitchCondition = pitch?.condition ?? null;
  // Kickoff, weather and sunset (cosmetic, `matchConditions`) and where the sun sets over the home stadium:
  // the live pitch draws the light of that time (spec 2026-10-16-match-lighting).
  let conditions: { kickoff: string; weather: MatchWeather; sunset: string; date?: string } | null = null;
  let sunSide: StadiumSun | null = null;
  // Weather that plays (`.claude/rules/game/weather.md`): the same `matchWeatherOf` the day advance uses.
  let weatherEffect: WeatherOfMatch | null = null;
  if (matchFixture && opponentSquad) {
    const homeSquad = matchFixture.home === myInternalId ? mySquad : opponentSquad;
    const c = matchConditions(matchFixture, matchFixture.neutral ? null : homeSquad.country ?? null);
    // Each stadium has its own shadow (a real one in the main leagues: its sun, sunset and roof), none under a
    // closed roof.
    const ms = matchSun(homeSquad, matchFixture.neutral ? matchFixture.id : undefined, matchDate, c.weather);
    conditions = { kickoff: c.kickoff, weather: c.weather, sunset: ms.sunset ?? c.sunset, ...(matchDate ? { date: matchDate } : {}) };
    sunSide = ms.sun;
    weatherEffect = matchWeatherOf(matchFixture, homeSquad);
  }
  // Stadium crowd and both managers on the touchline (spec 2026-10-08-match-visual §7).
  const baseCrowd = !legacy && matchFixture && opponentSquad
    ? await matchCrowd(saveService, save, matchFixture, mySquad, opponentSquad)
    : null;
  // Big game (flares and fireworks on the pitch, drawing only).
  const crowd = baseCrowd && matchFixture && opponentSquad
    && await matchIsBig(saveService, save.id, matchFixture, mySquad, opponentSquad)
    ? { ...baseCrowd, bigMatch: true as const }
    : baseCrowd;
  const managers = !legacy && opponentSquad
    ? matchManagers(save, await saveService.getManagers(save.id), opponentSquad.id, await clubCountryResolver(saveService, save.id), await saveService.listSeats(save.id))
    : null;

  // Referee of the match (`.claude/rules/game/referees.md`): the appointment the day advance will use.
  const referee = !legacy && matchFixture && matchDate ? await matchSetupReferee(save.id, matchDate, matchFixture) : null;

  return { ok: true, body: {
    save,
    mySquad,
    mySquadId: myInternalId,
    fixture: matchFixture,
    matchDay: matchFixture ? { date: matchFixture.date, fixtureId: matchFixture.id } : null,
    // Another seat's club: shown like an AI club, without that seat's private data (morale, staff, balance…).
    opponentSquad: seatOpponent && opponentSquad ? publicSeatSquad(opponentSquad) : opponentSquad,
    myFormation:  resolvedMyFormation,
    oppFormation: oppFormation ?? defaultFormation,
    myLineup:     myTactics.lineup,
    myTactics,
    injuredReplaced: resolved.injuredReplaced,
    rotationSuggestion: resolved.rotationSuggestion,
    rotationApplied: resolved.rotationApplied,
    oppLineup,
    registered,
    matchMarking,
    pitchCondition,
    pitch,
    conditions,
    weatherEffect,
    sunSide,
    crowd,
    managers,
    referee,
    // The manager serves a touchline ban in this match (`.claude/rules/game/var.md` §4).
    managerBanned: !!save.managerBan && save.managerBan.matches > 0,
    seatOpponent,
    h2h: seatOpponent && opts.live && !!opts.h2h,
  } };
}
