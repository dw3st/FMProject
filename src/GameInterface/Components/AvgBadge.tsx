import { ratingBadgeClasses10 } from "@/GameInterface/scoreColors";

/** With `range` (scouting uncertainty) shows `low-high` instead of one number.
 *  Overall (OVR) in a bordered pill — takes the 0–10 average, shows it on the 0–100 scale used across the game. */
export function AvgBadge({ value, range }: { value: number; range?: [number, number] }) {
  return (
    <span
      className={`inline-flex items-center justify-center px-2 py-1 rounded-md text-sm font-black tabular-nums border ${ratingBadgeClasses10(value)}`}
    >
      {range ? `${Math.round(range[0] * 10)}-${Math.round(range[1] * 10)}` : Math.round(value * 10)}
    </span>
  );
}
