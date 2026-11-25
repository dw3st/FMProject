import { addDays } from "@/Domain/dates";
import { STAFF } from "@/Domain/staff/staffConfig";
import { tierRoleLimit } from "@/Domain/staff/staff";
import type { StaffRecord, StaffRole } from "@/Domain/staff/staffTypes";
import type { Squad } from "@/types/playerTypes";

/** Why the board says no (or why the request cannot be made). */
export type SlotRefusal = "board_low" | "negative_balance" | "max_reached" | "cooldown" | "notFull";

export interface SlotRequestState {
  /** The request can be made today (the role is at its limit, under the extra cap, out of the cooldown). */
  canAsk: boolean;
  /** Places the board already granted for the role. */
  extra: number;
  /** First day a new request is possible after a refusal (absent = no cooldown). */
  cooldownUntil?: string;
  /** Why not, when `canAsk` is false. */
  blocked?: "max_reached" | "cooldown" | "notFull";
}

/** What the staff screen shows for a role: whether the board can be asked and until when it waits. */
export function slotRequestState(squad: Squad, role: StaffRole, date: string): SlotRequestState {
  const staff: StaffRecord = squad.staff ?? { members: [] };
  const extra = staff.extraSlots?.[role] ?? 0;
  const refused = staff.slotRefusedOn?.[role];
  const cooldownUntil = refused ? addDays(refused, STAFF.SLOT_REQUEST.COOLDOWN_DAYS) : undefined;
  const base = cooldownUntil && date < cooldownUntil ? { extra, cooldownUntil } : { extra };
  const used = staff.members.filter((m) => m.role === role).length;
  if (extra >= STAFF.SLOT_REQUEST.MAX_EXTRA) return { ...base, canAsk: false, blocked: "max_reached" };
  if (used < tierRoleLimit(squad, role) + extra) return { ...base, canAsk: false, blocked: "notFull" };
  if (cooldownUntil && date < cooldownUntil) return { ...base, canAsk: false, blocked: "cooldown" };
  return { ...base, canAsk: true };
}

/**
 * The board's answer to one more place in `role`: approved with the board meter at `SLOT_REQUEST.MIN_BOARD` or more
 * and a balance of zero or more (the role gets one extra place, at most `MAX_EXTRA` over the tier limit); refused
 * otherwise, and the role waits `COOLDOWN_DAYS`. `cooldown` and `notFull` never touch the record.
 */
export function decideSlotRequest(input: { squad: Squad; role: StaffRole; date: string; board: number | undefined; president?: boolean }):
  { approved: true; staff: StaffRecord; extra: number } | { approved: false; reason: SlotRefusal; staff?: StaffRecord } {
  const { squad, role, date } = input;
  const staff: StaffRecord = squad.staff ?? { members: [] };
  const state = slotRequestState(squad, role, date);
  if (state.blocked === "cooldown" || state.blocked === "notFull") return { approved: false, reason: state.blocked };
  const refuse = (reason: SlotRefusal) => ({
    approved: false as const, reason, staff: { ...staff, slotRefusedOn: { ...staff.slotRefusedOn, [role]: date } },
  });
  if (state.blocked === "max_reached") return refuse("max_reached");
  if (!input.president) {
    if (input.board === undefined || input.board < STAFF.SLOT_REQUEST.MIN_BOARD) return refuse("board_low");
    if ((squad.finances?.budget ?? 0) < 0) return refuse("negative_balance");
  }
  const extra = state.extra + 1;
  return { approved: true, extra, staff: { ...staff, extraSlots: { ...staff.extraSlots, [role]: extra } } };
}
