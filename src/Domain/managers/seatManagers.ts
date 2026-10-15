import type { ManagerRecord } from "@/types/managerTypes";
import { seatManagerId } from "@/Domain/seats/seats";
import { toFree } from "@/Domain/managers/managerRecords";

/** The record of a seat's manager. */
export function managerOfSeat(managers: readonly ManagerRecord[], seatId: string): ManagerRecord | null {
  return managers.find((m) => m.seatId === seatId) ?? null;
}

/**
 * A new seat takes `squadId` (`addSeat`): the club's AI manager goes to the free pool (`left: "moved"`), an
 * interim without points or titles just disappears, and the seat's manager starts his first passage. Throws when
 * the seat already has a manager (one record per seat).
 */
export function placeSeatManager(
  managers: ManagerRecord[],
  args: { seatId: string; name: string; squadId: string; date: string },
): ManagerRecord[] {
  if (managerOfSeat(managers, args.seatId)) throw new Error(`placeSeatManager: seat ${args.seatId} already has a manager`);
  const out: ManagerRecord[] = [];
  for (const m of managers) {
    if (!m.seatId && m.squadId === args.squadId) {
      if (!(m.interim && m.points === 0 && m.titles.length === 0)) out.push(toFree(m, args.date, m.interim ? "interim" : "moved"));
      continue;
    }
    out.push(m);
  }
  out.push({
    id: seatManagerId(args.seatId), seatId: args.seatId, name: args.name, squadId: args.squadId,
    points: 0, seasons: 0, titles: [], clubs: [{ squadId: args.squadId, from: args.date }],
  });
  return out;
}
