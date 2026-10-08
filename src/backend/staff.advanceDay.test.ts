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

    // A Monday with the director in charge (the default).
    const monday = await advanceTo(isMonday);
    let club = (await saveService.getSquadById(saveId, "33"))!;
    const medic = club.staff!.members.find((m) => m.role === "medic")!;
    const analyst = club.staff!.members.find((m) => m.role === "analyst")!;
    const members = club.staff!.members.map((m) =>
      m.id === medic.id ? strong(m, addDays(monday, 30)) : m.id === analyst.id ? { ...m, contract: { ...m.contract!, until: addDays(monday, -1) } } : m);
    club = { ...club, staff: { ...club.staff!, members } };
    await saveService.saveSquadById(saveId, club);
    const mondayBill = squadStaffWages(club.staff);

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

    // The human country's rollover refreshes the pool for the new season.
    const fresh = (await saveService.getMeta(saveId))!;
    const today = fresh.currentDate!;
    await saveService.updateMeta(saveId, {
      activeLeagues: (fresh.activeLeagues ?? []).map((l) =>
        l.leagueSlug === "premier_league" || l.leagueSlug === "of_championship" ? { ...l, end: today } : l),
    });
    const before = await saveService.getStaffPool(saveId, today);
    expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);
    const after = await saveService.getStaffPool(saveId, today);
    const year = (await saveService.getMeta(saveId))!.activeLeagues!.find((l) => l.leagueSlug === "premier_league")!.year;
    expect(after.season).toBe(String(year));
    expect(after.season).not.toBe(before.season);
    for (const [role, n] of Object.entries(STAFF.POOL.BY_ROLE)) {
      expect(after.members.filter((m) => m.role === role).length).toBeGreaterThanOrEqual(n);
    }
  }, 300_000);
});
