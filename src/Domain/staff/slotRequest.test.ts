import { describe, expect, test } from "bun:test";
import { decideSlotRequest, slotRequestState } from "@/Domain/staff/slotRequest";
import { roleLimit } from "@/Domain/staff/staff";
import type { StaffMember, StaffRecord } from "@/Domain/staff/staffTypes";
import type { Squad } from "@/types/playerTypes";

const medic = (id: string) => ({ id, role: "medic" }) as unknown as StaffMember;
const squadWith = (staff: StaffRecord, budget = 1e6): Squad =>
  ({ id: "c", players: [], finances: { broadcasting: 1e6, commercial: 0, total: 1e6, followers: 0, budget }, staff }) as unknown as Squad;
const DATE = "2027-03-01";

describe("board slot request", () => {
  test("approved: one more place, counted by roleLimit", () => {
    const squad = squadWith({ members: [medic("m1")] });
    expect(roleLimit(squad, "medic")).toBe(1);
    const r = decideSlotRequest({ squad, role: "medic", date: DATE, board: 60 });
    expect(r.approved).toBe(true);
    if (!r.approved) return;
    expect(r.extra).toBe(1);
    expect(roleLimit({ ...squad, staff: r.staff }, "medic")).toBe(2);
  });
  test("refused with the board below 60 or a negative balance, then a 30-day wait", () => {
    const squad = squadWith({ members: [medic("m1")] });
    const low = decideSlotRequest({ squad, role: "medic", date: DATE, board: 59 });
    expect(low).toMatchObject({ approved: false, reason: "board_low" });
    const after = { ...squad, staff: low.staff! };
    expect(slotRequestState(after, "medic", "2027-03-30")).toMatchObject({ canAsk: false, blocked: "cooldown", cooldownUntil: "2027-03-31" });
    expect(slotRequestState(after, "medic", "2027-03-31").canAsk).toBe(true);
    expect(decideSlotRequest({ squad: after, role: "medic", date: "2027-03-10", board: 90 })).toMatchObject({ approved: false, reason: "cooldown" });
    expect(decideSlotRequest({ squad: squadWith({ members: [medic("m1")] }, -1), role: "medic", date: DATE, board: 90 }))
      .toMatchObject({ approved: false, reason: "negative_balance" });
    expect(decideSlotRequest({ squad, role: "medic", date: DATE, board: undefined })).toMatchObject({ reason: "board_low" });
  });
  test("at most two extra places; a role with room cannot ask", () => {
    const full = squadWith({ members: [medic("a"), medic("b"), medic("c")], extraSlots: { medic: 2 } });
    expect(decideSlotRequest({ squad: full, role: "medic", date: DATE, board: 90 })).toMatchObject({ approved: false, reason: "max_reached" });
    const room = squadWith({ members: [] });
    expect(slotRequestState(room, "medic", DATE)).toMatchObject({ canAsk: false, blocked: "notFull" });
    expect(decideSlotRequest({ squad: room, role: "medic", date: DATE, board: 90 })).toEqual({ approved: false, reason: "notFull" });
  });
  test("the club's president needs no board and no balance", () => {
    const squad = squadWith({ members: [medic("m1")] }, -5);
    expect(decideSlotRequest({ squad, role: "medic", date: DATE, board: 10, president: true })).toMatchObject({ approved: true, extra: 1 });
    const full = squadWith({ members: [medic("a"), medic("b"), medic("c")], extraSlots: { medic: 2 } }, -5);
    expect(decideSlotRequest({ squad: full, role: "medic", date: DATE, board: 10, president: true })).toMatchObject({ approved: false, reason: "max_reached" });
  });
});
