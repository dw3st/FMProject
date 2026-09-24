import { ratingBadgeClasses10 } from "@/GameInterface/scoreColors";

/** Overall (OVR) in a bordered pill — takes the 0–10 average, shows it on the 0–100 scale used across the game. */
export function AvgBadge({ value }: { value: number }) {
  return (
    <span
      className={`inline-flex items-center justify-center px-2 py-1 rounded-md text-[11px] font-black border ${ratingBadgeClasses10(value)}`}
    >
      {Math.round(value * 10)}
    </span>
  );
}
