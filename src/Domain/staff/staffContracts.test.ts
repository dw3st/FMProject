import { describe, expect, test } from "bun:test";
import { makeProfessional, signContract } from "@/Domain/staff/staff";
import { renewedContract, severanceOf, staffContractDay } from "@/Domain/staff/staffContracts";

const signed = (key: string, stars: number, until: string, age?: number) => {
  const m = signContract(makeProfessional(key, "medic", stars), { date: "2027-02-05", seasonEnd: until, years: 1, clubFactor: 1 });
  return age === undefined ? m : { ...m, age };
};

describe("staff contracts", () => {
  test("severance = half of the remaining weeks (rounded up)", () => {
    const m = signed("a", 3, "2027-12-06");
    expect(severanceOf(m, "2027-11-29")).toBe(Math.round(0.5 * m.contract!.wage * 1));
    expect(severanceOf(m, "2027-11-28")).toBe(Math.round(0.5 * m.contract!.wage * 2));
    expect(severanceOf(m, "2027-12-07")).toBe(0);
  });
  test("director renews a good one on Monday 60 days out, 2 years, never lower wage", () => {
    const m = signed("b", 3.5, "2027-12-06", 50);
    const r = staffContractDay({ staff: { members: [m] }, date: "2027-10-11", monday: true, seasonEnd: "2027-12-06",
      directorHandles: true, impliedStars: 3, clubFactor: 1.2 });
    const got = r.staff.members[0]!;
    expect(got.contract!.until).toBe("2029-12-06");
    expect(got.contract!.wage).toBeGreaterThanOrEqual(m.contract!.wage);
    expect(r.news[0]!.kind).toBe("staff_renewed");
  });
  test("outside the window or not Monday: nothing", () => {
    const m = signed("b2", 3.5, "2027-12-06", 50);
    const base = { staff: { members: [m] }, seasonEnd: "2027-12-06", directorHandles: true, impliedStars: 3, clubFactor: 1 };
    expect(staffContractDay({ ...base, date: "2027-09-27", monday: true }).news).toEqual([]);
    expect(staffContractDay({ ...base, date: "2027-10-12", monday: false }).news).toEqual([]);
  });
  test("director lets a weak or old one go; he leaves the day after", () => {
    const weak = signed("c", 1.5, "2027-12-06");
    const d1 = staffContractDay({ staff: { members: [weak] }, date: "2027-10-11", monday: true, seasonEnd: "2027-12-06",
      directorHandles: true, impliedStars: 3, clubFactor: 1 });
    expect(d1.staff.members[0]!.contract!.decision).toBe("leave");
    expect(d1.news[0]!.kind).toBe("staff_leaving");
    const old = signed("c2", 4, "2027-12-06", 66);
    const d0 = staffContractDay({ staff: { members: [old] }, date: "2027-10-11", monday: true, seasonEnd: "2027-12-06",
      directorHandles: true, impliedStars: 3, clubFactor: 1 });
    expect(d0.news[0]!.kind).toBe("staff_leaving");
    const d2 = staffContractDay({ staff: d1.staff, date: "2027-12-07", monday: false, seasonEnd: "2027-12-06",
      directorHandles: true, impliedStars: 3, clubFactor: 1 });
    expect(d2.staff.members.length).toBe(0);
    expect(d2.left.map((x) => x.id)).toEqual([weak.id]);
    expect(d2.news[0]!.kind).toBe("staff_left");
  });
  test("manager in charge: one warning, no renewal", () => {
    const m = signed("d", 4, "2027-12-06");
    const a = staffContractDay({ staff: { members: [m] }, date: "2027-10-11", monday: true, seasonEnd: "2027-12-06",
      directorHandles: false, impliedStars: 3, clubFactor: 1 });
    expect(a.news[0]!.kind).toBe("staff_expiring");
    const b = staffContractDay({ staff: a.staff, date: "2027-10-18", monday: true, seasonEnd: "2027-12-06",
      directorHandles: false, impliedStars: 3, clubFactor: 1 });
    expect(b.news.length).toBe(0);
  });
  test("a departing coach frees his manual area assignment", () => {
    const c = signContract(makeProfessional("coachx", "coach", 3), { date: "2027-02-05", seasonEnd: "2027-12-06", years: 1, clubFactor: 1 });
    const r = staffContractDay({ staff: { members: [c], areaAssignments: { setPieces: c.id } }, date: "2027-12-07", monday: false,
      seasonEnd: "2027-12-06", directorHandles: true, impliedStars: 3, clubFactor: 1 });
    expect(r.staff.areaAssignments).toEqual({});
  });
  test("renewal by hand: years from the current end, at most 3 seasons left", () => {
    const m = signed("e", 3, "2027-12-06");
    expect(renewedContract(m, { date: "2027-06-01", seasonEnd: "2027-12-06", years: 2, clubFactor: 1 })!.until).toBe("2029-12-06");
    expect(renewedContract(m, { date: "2027-06-01", seasonEnd: "2027-12-06", years: 3, clubFactor: 1 })).toBeNull();
    expect(renewedContract(m, { date: "2027-06-01", seasonEnd: "2027-12-06", years: 0, clubFactor: 1 })).toBeNull();
  });
});
