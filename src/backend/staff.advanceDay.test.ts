import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import { addDays } from "@/Domain/dates";
import { squadStaffWages } from "@/Domain/staff/staff";
import { STAFF } from "@/Domain/staff/staffConfig";
import type { StaffMember } from "@/Domain/staff/staffTypes";
import type { ContractInboxMessage } from "@/types/inboxTypes";

const isMonday = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay() === 1;

/**
 * Coaching-staff contracts in the day pipeline (`.claude/rules/game/staff.md`): the director renews
 * a good professional 60 days out, a past contract leaves to the free pool, the manager in charge
 * gets one warning, the Monday line is the contracts' sum, and the human country's rollover
 * refreshes the pool.
 */
describe("staff contracts in the day", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("renewal, departure, warning, Monday line, pool refresh", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const startPool = await saveService.getStaffPool(saveId, meta.currentDate!);
    expect(startPool.members.length).toBe(STAFF.POOL.SIZE);

    const advanceTo = async (pred: (d: string) => boolean) => {
      for (let i = 0; i < 10; i++) {
        const d = (await saveService.getMeta(saveId))!.currentDate!;
        if (pred(d)) return d;
        expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);
      }
      throw new Error("no Monday in 10 days");
    };
    const strong = (m: StaffMember, until: string): StaffMember => ({
      ...m, age: 45,
      attributes: { determination: 18, discipline: 18, adaptability: 18, playerReading: 18, knowledge: { ...m.attributes.knowledge, medical: 20, analysis: 20, pitch: 20 } },
      contract: { ...m.contract!, until },
    });

    const mission = (id: string, leader: string, start: string) => ({
      id, scoutId: leader, target: { kind: "country" as const, country: "Spain" }, start, weeks: 4, weeksDone: 0, observed: 0,
    });

    // A Monday with the director in charge (the default).
    const monday = await advanceTo(isMonday);
    let club = (await saveService.getSquadById(saveId, "33"))!;
    const medic = club.staff!.members.find((m) => m.role === "medic")!;
    const analyst = club.staff!.members.find((m) => m.role === "analyst")!;
    // A field scout whose contract ended yesterday, running a mission.
    const pool0 = await saveService.getStaffPool(saveId, monday);
    const scout = pool0.members.find((m) => m.role === "fieldScout")!;
    await saveService.writeStaffPool(saveId, { ...pool0, members: pool0.members.filter((m) => m.id !== scout.id) });
    const endedScout: StaffMember = { ...scout, contract: { until: addDays(monday, -1), wage: 999, signed: addDays(monday, -200) } };
    const members = [...club.staff!.members.map((m) =>
      m.id === medic.id ? strong(m, addDays(monday, 30)) : m.id === analyst.id ? { ...m, contract: { ...m.contract!, until: addDays(monday, -1) } } : m), endedScout];
    club = { ...club, staff: { ...club.staff!, members } };
    await saveService.saveSquadById(saveId, club);
    // Missions: the departing scout's, the chief's, and one led by someone who is not at the club
    // (the Monday safety net drops it).
    const scoutingNow = await saveService.getScouting(saveId);
    await saveService.writeScouting(saveId, { ...scoutingNow, missions: [
      mission("m-scout", scout.id, addDays(monday, -7)), mission("m-chief", "chief", addDays(monday, -7)), mission("m-ghost", "ghost", addDays(monday, -7)),
    ] });
    // Whoever's contract ended before today (the analyst, the scout) is not paid this Monday.
    const mondayBill = squadStaffWages(club.staff, monday);
    expect(mondayBill).toBe(squadStaffWages(club.staff) - endedScout.contract!.wage - members.find((m) => m.id === analyst.id)!.contract!.wage);

    expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);
    club = (await saveService.getSquadById(saveId, "33"))!;
    const renewed = club.staff!.members.find((m) => m.id === medic.id)!;
    expect(renewed.contract!.until > addDays(monday, 30)).toBe(true);
    expect(club.staff!.members.some((m) => m.id === analyst.id)).toBe(false);
    const pool = await saveService.getStaffPool(saveId, monday);
    expect(pool.members.find((m) => m.id === analyst.id)?.contract).toBeUndefined();
    expect(pool.members.find((m) => m.id === analyst.id)?.since).toBe(monday);
    const inbox = (await saveService.getInbox(saveId)).filter((m): m is ContractInboxMessage => m.category === "contract");
    expect(inbox.some((m) => m.kind === "staff_renewed" && m.staff!.some((s) => s.id === medic.id))).toBe(true);
    expect(inbox.some((m) => m.kind === "staff_left" && m.staff!.some((s) => s.id === analyst.id))).toBe(true);
    // The departing field scout's mission ended with him; the chief's goes on.
    expect(club.staff!.members.some((m) => m.id === scout.id)).toBe(false);
    expect((await saveService.getScouting(saveId)).missions.map((m) => m.id)).toEqual(["m-chief"]);
    // The Monday line is the contracts' sum of the squad the day started with.
    const season = (await saveService.getLeagueMeta(saveId, "premier_league"))!.year;
    const line = (await saveService.getLedger(saveId, season)).find((e) => e.kind === "staff" && e.date === monday && !e.ref);
    expect(line!.amount).toBe(-mondayBill);

    // The manager in charge: one warning, no renewal.
    await saveService.updateMeta(saveId, { responsibilities: { contracts: "manager" } });
    const next = await advanceTo(isMonday);
    club = (await saveService.getSquadById(saveId, "33"))!;
    const gk = club.staff!.members.find((m) => m.role === "goalkeeping")!;
    const gkUntil = addDays(next, 20);
    await saveService.saveSquadById(saveId, {
      ...club,
      staff: { ...club.staff!, members: club.staff!.members.map((m) => (m.id === gk.id ? { ...m, contract: { ...m.contract!, until: gkUntil } } : m)) },
    });
    expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);
    club = (await saveService.getSquadById(saveId, "33"))!;
    const warned = club.staff!.members.find((m) => m.id === gk.id)!;
    expect(warned.contract!.until).toBe(gkUntil);
    expect(warned.contract!.decision).toBe("warned");
    const warnings = (await saveService.getInbox(saveId))
      .filter((m): m is ContractInboxMessage => m.category === "contract" && m.kind === "staff_expiring");
    expect(warnings.filter((m) => m.staff!.some((s) => s.id === gk.id))).toHaveLength(1);

    // The human country's rollover ages the staff (the retirement age retires) and refreshes the pool.
    const fresh = (await saveService.getMeta(saveId))!;
    const today = fresh.currentDate!;
    club = (await saveService.getSquadById(saveId, "33"))!;
    const veteran = club.staff!.members.find((m) => m.role === "medic")!;
    const agesBefore = new Map(club.staff!.members.map((m) => [m.id, m.id === veteran.id ? STAFF.POOL.RETIRE_AGE - 1 : m.age]));
    await saveService.saveSquadById(saveId, {
      ...club, staff: { ...club.staff!, members: club.staff!.members.map((m) => (m.id === veteran.id ? { ...m, age: STAFF.POOL.RETIRE_AGE - 1 } : m)) },
    });
    await saveService.updateMeta(saveId, {
      activeLeagues: (fresh.activeLeagues ?? []).map((l) =>
        l.leagueSlug === "premier_league" || l.leagueSlug === "of_championship" ? { ...l, end: today } : l),
    });
    const before = await saveService.getStaffPool(saveId, today);
    expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);
    const after = await saveService.getStaffPool(saveId, today);
    club = (await saveService.getSquadById(saveId, "33"))!;
    expect(club.staff!.members.some((m) => m.id === veteran.id)).toBe(false);
    for (const m of club.staff!.members) expect(m.age).toBe(agesBefore.get(m.id)! + 1);
    expect(after.members.some((m) => m.id === veteran.id)).toBe(false);
    const retiredNews = (await saveService.getInbox(saveId))
      .filter((m): m is ContractInboxMessage => m.category === "contract" && m.kind === "staff_retired");
    expect(retiredNews.some((m) => m.staff!.some((s) => s.id === veteran.id))).toBe(true);
    expect(after.refreshedOn).toBe(today);
    const year = (await saveService.getMeta(saveId))!.activeLeagues!.find((l) => l.leagueSlug === "premier_league")!.year;
    expect(after.season).toBe(String(year));
    expect(after.season).not.toBe(before.season);
    for (const [role, n] of Object.entries(STAFF.POOL.BY_ROLE)) {
      expect(after.members.filter((m) => m.role === role).length).toBeGreaterThanOrEqual(n);
    }
  }, 300_000);
});
