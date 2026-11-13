import type { FanbaseHeat, FanbaseScope, FanbaseView } from "@/Domain/fanbase/fanbase";

export async function fetchFanbase(saveId: string, scope: FanbaseScope, offset: number, limit: number): Promise<FanbaseView> {
  const res = await fetch(`/api/saves/${saveId}/fanbase?scope=${scope}&offset=${offset}&limit=${limit}`);
  if (!res.ok) throw new Error(`fanbase ${res.status}`);
  return (await res.json()) as FanbaseView;
}

/** "12,4 mi", "850 mil": the followers in the reader's language. */
export function followersLabel(followers: number, lang: string): string {
  return new Intl.NumberFormat(lang, { notation: "compact", maximumFractionDigits: 1 }).format(followers);
}

/** "+3,2%": how the followers would move if the season ended today; null before the table means anything. */
export function trendLabel(trend: number | null, lang: string): string | null {
  if (trend === null) return null;
  return new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(trend);
}

export const HEAT_CLASS: Record<FanbaseHeat, string> = {
  hot: "text-star-green",
  warm: "text-muted-foreground",
  cold: "text-destructive",
};
