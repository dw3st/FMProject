/**
 * The youth coach's part of the day advance (`.claude/rules/game/staff.md` → "Treinador da base (12.1)"): I/O around
 * the pure rules of `@/Domain/youth/youthCoach`. Only seats whose responsibility `youth` is `coach` and whose club
 * has a youth coach at work; for everybody else nothing is read and nothing changes.
 */
import type { SaveService } from "@/backend/SaveService";
import type { DaySeat } from "@/backend/daySeats";
import { firstTeamLineup } from "@/backend/youthCompWorld";
import { youthByCoach } from "@/Domain/responsibilities/director";
import { coachCallUps, coachTrainingPlan, youthCoachOnDuty } from "@/Domain/youth/youthCoach";
import type { YouthCallUps } from "@/Domain/youthComps/callUps";
import { YOUTH_COMP } from "@/Domain/youthComps/youthCompConfig";
import { youthCompAgeOf } from "@/Domain/youthComps/youthCompIds";
import type { Squad } from "@/types/playerTypes";
import type { YouthCompAge } from "@/types/youthCompTypes";

type Seat = Pick<DaySeat, "seatId" | "clubId" | "meta" | "tactics">;

const sameList = (a: YouthCallUps[YouthCompAge], b: YouthCallUps[YouthCompAge]): boolean =>
  JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

/**
 * The call-ups of each seat whose youth coach added (or rebuilt) his own for a youth game of `date`, keyed by seat.
 * Called twice a day: before the day's youth games, for today (a list he already made the day before, marked by
 * `youthCoachPlanned`, is left as the manager has it), and at the end of the day for tomorrow's games
 * (`currentOf` = the call-ups after today's games), so the manager sees the list a day ahead.
 * A club that plays for the first team on the day is skipped (its youth game is postponed and the youngsters are
 * needed). The under-19 game is handled first, and who is called up for it is left out of the under-21 list of the
 * same day (nobody plays twice).
 */
export async function coachCallUpsToday(args: {
  service: SaveService;
  saveId: string;
  date: string;
  seats: readonly Seat[];
  teamsPlayingToday: ReadonlySet<string>;
  squadOf: (id: string) => Promise<Squad | null>;
  /** The call-ups to start from (default: the seat's saved ones). */
  currentOf?: (seat: Seat) => YouthCallUps | undefined;
}): Promise<Map<string, YouthCallUps>> {
  const out = new Map<string, YouthCallUps>();
  const seats = args.seats.filter((s) => s.clubId && youthByCoach(s.meta.responsibilities) && !args.teamsPlayingToday.has(s.clubId)
    && s.meta.youthCoachPlanned !== args.date);
  if (seats.length === 0) return out;
  const fixtures = await args.service.getYouthFixturesForDate(args.saveId, args.date);
  for (const seat of seats) {
    const clubId = seat.clubId!;
    const playing = new Set(fixtures.filter((f) => f.home === clubId || f.away === clubId).map((f) => youthCompAgeOf(f.competition)));
    const ages = YOUTH_COMP.AGES.filter((a) => playing.has(a));
    if (ages.length === 0) continue;
    const squad = await args.squadOf(clubId);
    if (!squad || !youthCoachOnDuty(squad)) continue;
    const saved = (seat.tactics?.lineup ?? []).filter((id) => id);
    const xi = new Set(saved.length > 0 ? saved : firstTeamLineup(squad, seat.tactics?.formation, args.date));
    const next: YouthCallUps = { ...(args.currentOf ? args.currentOf(seat) : seat.meta.youthCallUps) };
    let changed = false;
    const calledToday = new Set<string>();
    for (const age of ages) {
      const list = coachCallUps({ squad, age, current: next[age], firstTeamXI: xi, date: args.date, exclude: calledToday });
      if (!sameList(list, next[age])) changed = true;
      if (list.length > 0) next[age] = list;
      else delete next[age];
      for (const c of list) calledToday.add(c.id);
    }
    if (changed) out.set(seat.seatId, next);
  }
  return out;
}

/** Monday: the squad with the coach's academy training plan, or null when he is not in charge or nothing changes. */
export function coachMondaySquad(seat: Pick<Seat, "meta">, squad: Squad): Squad | null {
  if (!youthByCoach(seat.meta.responsibilities) || !youthCoachOnDuty(squad) || (squad.youth ?? []).length === 0) return null;
  const plan = coachTrainingPlan(squad);
  return plan === squad.youthTraining ? null : { ...squad, youthTraining: plan };
}
