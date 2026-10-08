import { randomUUID } from "crypto";
import type { FacilityInboxMessage } from "@/types/inboxTypes";
import type { BoardRefusal, FacilityItemId, FacilityKind, StandId } from "@/types/facilityTypes";
import { formatEurosText } from "@/Domain/money";

/** English fallbacks; the inbox screen translates (`facilities.inbox.*`). */
const NAME: Record<FacilityKind, string> = {
  stand: "stand expansion",
  comfort: "stadium comfort",
  training: "training ground",
  academy: "academy",
  repair: "repair",
  rebuild: "rebuild",
  upgrade: "upgrade",
};

const ITEM_NAME: Record<FacilityItemId, string> = {
  stadiumPitch: "stadium pitch",
  seats: "stands and seats",
  stadiumStructure: "stadium structure",
  trainingPitches: "training pitches",
  gym: "gym",
  pool: "pool",
  physio: "physio room",
  canteen: "canteen",
  academyPitches: "academy pitches",
  academyLodging: "academy lodging",
};

const REASON: Record<BoardRefusal, string> = {
  board_low: "improve the results first",
  negative_balance: "the balance is negative",
  too_big: "the project is too big for the board's confidence",
  no_money: "the club cannot pay for it",
};

export function buildFacilityMessage(args: {
  date: string;
  kind: FacilityInboxMessage["kind"];
  facility?: FacilityKind;
  stand?: StandId;
  seats?: number;
  level?: number;
  cost?: number;
  boardShare?: number;
  end?: string;
  reason?: BoardRefusal;
  attendance?: number;
  previous?: number;
  competition?: string;
  item?: FacilityItemId;
  condition?: number;
}): FacilityInboxMessage {
  const what = args.item ? ITEM_NAME[args.item] : args.facility ? NAME[args.facility] : "";
  const pct = `${Math.round(args.condition ?? 0)}%`;
  const subject = args.kind === "approved" ? `Board approves the ${what}`
    : args.kind === "refused" ? `Board refuses the ${what}`
    : args.kind === "completed" ? `Works finished: ${what}`
    : args.kind === "worn" ? `Worn: ${what}`
    : args.kind === "condemned" ? `Out of use: ${what}`
    : args.kind === "repaired" ? `Works finished: ${what}`
    : "New home attendance record";
  const preview = args.kind === "approved" ? `${formatEurosText(args.cost ?? 0)}, ready on ${args.end ?? ""}`
    : args.kind === "refused" ? REASON[args.reason ?? "board_low"]
    : args.kind === "completed" ? (args.seats ? `+${args.seats} seats` : `Level ${args.level ?? ""}`)
    : args.kind === "worn" ? `Condition ${pct}: it starts to cost the club`
    : args.kind === "condemned" ? `Condition ${pct}: closed until rebuilt`
    : args.kind === "repaired" ? `Condition ${pct}${args.level !== undefined ? `, level ${args.level} of 10` : ""}`
    : `${args.attendance ?? 0} fans`;
  const { date, ...rest } = args;
  return {
    id: `facilities-${date}-${args.kind}-${randomUUID()}`,
    date,
    createdAt: date,
    read: false,
    category: "facilities",
    subject,
    preview,
    ...rest,
  };
}
