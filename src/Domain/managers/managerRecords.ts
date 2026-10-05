import type { ManagerLeftReason, ManagerPassage, ManagerRecord } from "@/types/managerTypes";

/** Small helpers on manager records (`.claude/rules/game/managers.md`), shared by AI managers and jobs. */

/** Closes the open passage of a manager (the last one without `to`). */
export function closePassage(clubs: ManagerPassage[] | undefined, date: string, left: ManagerLeftReason): ManagerPassage[] {
  const out = [...(clubs ?? [])];
  for (let i = out.length - 1; i >= 0; i--) {
    if (!out[i]!.to) { out[i] = { ...out[i]!, to: date, left }; break; }
  }
  return out;
}

export const interimName = (clubName: string) => `Técnico interino do ${clubName}`;
export const interimId = (squadId: string, date: string) => `coach_${squadId}_${date}`;

/** A fresh interim record for a club. */
export function makeInterim(squadId: string, clubName: string, date: string, taken?: Set<string>): ManagerRecord {
  let id = interimId(squadId, date);
  for (let n = 2; taken?.has(id); n++) id = `${interimId(squadId, date)}_${n}`;
  return {
    id, name: interimName(clubName), squadId, isPlayer: false,
    points: 0, seasons: 0, titles: [], interim: true, clubs: [{ squadId, from: date }], hiredOn: date,
  };
}

export function cleanRecord(m: ManagerRecord): ManagerRecord {
  const o = { ...m } as Record<string, unknown>;
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o as unknown as ManagerRecord;
}

/** The free-pool version of a record: no club since `date`, passage closed with `left`. */
export function toFree(m: ManagerRecord, date: string, left: ManagerLeftReason): ManagerRecord {
  return cleanRecord({
    ...m, squadId: "", freeSince: date, interim: undefined, hiredOn: undefined,
    clubs: closePassage(m.clubs, date, left),
  });
}

