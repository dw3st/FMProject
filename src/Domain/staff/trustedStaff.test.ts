import { describe, expect, test } from "bun:test";
import { areaMultsOf, effectiveStars, makeProfessional, memberStars, signContract, starsIn } from "@/Domain/staff/staff";
import { STAFF } from "@/Domain/staff/staffConfig";
import { directorRenews } from "@/Domain/staff/staffContracts";
import { returnToPool } from "@/Domain/staff/staffPool";
import type { StaffMember, StaffRecord } from "@/Domain/staff/staffTypes";
import {
  TRUSTED, coursePriceOf, courseRefusal, courseSpecialty, finishCourse, joinNewClub, leavingTrusted, setTrusted,
  settleCourses, startStaffCourse,
} from "@/Domain/staff/trustedStaff";
import type { Squad } from "@/types/playerTypes";

const AT = { date: "2030-08-01", seasonEnd: "2031-05-31" };
const pro = (key: string, role: StaffMember["role"], stars: number, extra: Partial<StaffMember> = {}): StaffMember =>
  ({ ...signContract(makeProfessional(key, role, stars), { ...AT, years: 2, clubFactor: 1 }), ...extra });
const squadOf = (members: StaffMember[]): Squad => ({ id: "c", name: "C", players: [], staff: { members } }) as unknown as Squad;

describe("trusted staff", () => {
  test("at most three, and the mark comes off", () => {
    let staff: StaffRecord = { members: ["a", "b", "c", "d"].map((k) => pro(k, "coach", 3)) };
    for (const m of staff.members.slice(0, 3)) staff = setTrusted(staff, m.id, true) as StaffRecord;
    expect(staff.members.filter((m) => m.trusted).length).toBe(3);
    expect(setTrusted(staff, staff.members[3]!.id, true)).toBe("trustedFull");
    const off = setTrusted(staff, staff.members[0]!.id, false) as StaffRecord;
    expect("trusted" in off.members[0]!).toBe(false);
    expect(setTrusted(staff, "nobody", true)).toBeNull();
  });

  test("the course: price by stars, refusals, and the half star at the end", () => {
    const fit = pro("fit", "fitness", 3, { trusted: true });
    expect(coursePriceOf(fit)).toBe(150_000);
    expect(coursePriceOf(pro("top", "fitness", 5))).toBeNull();
    const staff = { members: [fit] };
    expect(courseRefusal({ staff, member: { ...fit, trusted: undefined }, date: AT.date, wallet: 1e9 })).toBe("notTrusted");
    expect(courseRefusal({ staff, member: fit, date: AT.date, wallet: 100 })).toBe("noMoney");
    expect(courseRefusal({ staff, member: fit, date: AT.date, wallet: 1e9, leading: true })).toBe("onMission");
    expect(courseRefusal({ staff, member: { ...fit, lastCourse: "2030-01-01" }, date: AT.date, wallet: 1e9 })).toBe("tooSoon");
    expect(courseRefusal({ staff, member: { ...fit, contract: { ...fit.contract!, until: "2030-08-20" } }, date: AT.date, wallet: 1e9 })).toBe("contractEnds");
    expect(courseRefusal({ staff, member: fit, date: AT.date, wallet: 1e9 })).toBeNull();

    const away = startStaffCourse(fit, AT.date);
    expect(away.course).toEqual({ started: AT.date, until: "2030-09-30", specialty: "physical" });
    const other = pro("gk", "goalkeeping", 3, { trusted: true });
    expect(courseRefusal({ staff: { members: [away, other] }, member: other, date: AT.date, wallet: 1e9 })).toBe("courseBusy");
    expect(courseRefusal({ staff: { members: [away] }, member: away, date: AT.date, wallet: 1e9 })).toBe("onCourse");

    expect(settleCourses([away], "2030-09-29").done).toEqual([]);
    const { members, done } = settleCourses([away], "2030-09-30");
    expect(done.length).toBe(1);
    expect(members[0]!.course).toBeUndefined();
    expect(members[0]!.lastCourse).toBe(AT.date);
    expect(memberStars(members[0]!)).toBe(memberStars(fit) + TRUSTED.STAR_GAIN);
  });

  test("the gain stops at five stars; a coach's course raises his best area", () => {
    const near = { ...pro("near", "medic", 4.5, { trusted: true }) };
    expect(memberStars(finishCourse(startStaffCourse(near, AT.date)))).toBe(5);
    const coach = pro("coach", "coach", 3.5, { trusted: true });
    const area = courseSpecialty(coach);
    expect(starsIn(coach, area)).toBe(memberStars(coach));
    const back = finishCourse(startStaffCourse(coach, AT.date));
    expect(starsIn(back, area)).toBe(starsIn(coach, area) + 0.5);
  });

  test("away on a course his role is vacant and his areas go without him", () => {
    const fit = startStaffCourse(pro("fit", "fitness", 4, { trusted: true }), AT.date);
    const coach = startStaffCourse(pro("coach", "coach", 4, { trusted: true }), AT.date);
    const squad = squadOf([fit, coach]);
    expect(effectiveStars(squad, "fitness")).toBe(STAFF.VACANT_STARS);
    const mults = areaMultsOf(squad);
    expect(mults.physical).toBe(STAFF.AREA_VACANT_MULT);
    expect(mults.defending).toBe(STAFF.AREA_VACANT_MULT);
    const home = squadOf([finishCourse(fit), finishCourse(coach)]);
    expect(areaMultsOf(home).physical).toBeGreaterThan(1);
  });

  test("the director keeps a trusted professional; the pool forgets the mark", () => {
    const weak = pro("weak", "analyst", 1.5);
    expect(directorRenews(weak, 3.5)).toBe(false);
    expect(directorRenews({ ...weak, trusted: true }, 3.5)).toBe(true);
    const pool = returnToPool({ season: "2030", refreshedOn: AT.date, members: [] }, startStaffCourse({ ...weak, trusted: true }, AT.date), AT.date);
    expect(pool.members[0]!.trusted).toBeUndefined();
    expect(pool.members[0]!.course).toBeUndefined();
  });

  test("he follows the manager: leaves without a contract, takes the weakest place of his role", () => {
    const mine = pro("mine", "fitness", 4.5, { trusted: true });
    const scout = pro("fs", "fieldScout", 3, { trusted: true });
    const waiting = leavingTrusted({ members: [mine, scout, pro("x", "medic", 3)] });
    expect(waiting.map((m) => m.id)).toEqual([mine.id, scout.id]);
    expect(waiting.every((m) => !m.contract)).toBe(true);

    const theirs = pro("theirs", "fitness", 2.5);
    const club = squadOf([theirs, pro("med", "medic", 3)]);
    const at = { date: "2031-07-01", seasonEnd: "2032-05-31" };
    const next = joinNewClub(club, club.staff!, waiting, at);
    expect(next.members.some((m) => m.id === theirs.id)).toBe(false);
    const joined = next.members.find((m) => m.id === mine.id)!;
    expect(joined.trusted).toBe(true);
    expect(joined.contract?.until).toBe("2033-05-31");
    // No field scout at the new club: he takes an empty place.
    expect(next.members.some((m) => m.id === scout.id)).toBe(true);
    expect(next.members.length).toBe(3);
  });

  test("a course that ended while he waited is finished when he joins", () => {
    const away = leavingTrusted({ members: [startStaffCourse(pro("fit", "fitness", 3, { trusted: true }), AT.date)] });
    const club = squadOf([]);
    const next = joinNewClub(club, club.staff!, away, { date: "2031-07-01", seasonEnd: "2032-05-31" });
    expect(next.members[0]!.course).toBeUndefined();
    expect(memberStars(next.members[0]!)).toBe(3.5);
  });
});
