import { ratingBadgeClasses10 } from "@/GameInterface/scoreColors";

/** 0–10 overall average in a bordered pill — same styling on scout, squad, dashboard. */
export function AvgBadge({ value }: { value: number }) {
  return (
    <span
      className={`inline-flex items-center justify-center px-2 py-1 rounded-md text-[11px] font-black border ${ratingBadgeClasses10(value)}`}
    >
      {value.toFixed(1)}
    </span>
  );
}
