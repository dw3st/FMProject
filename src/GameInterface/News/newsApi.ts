import type { NewsItem } from "@/types/newsTypes";

export type NewsScopeFilter = "all" | "club" | "league" | "followed";

export interface NewsPage { items: NewsItem[]; nextBefore: string | null }

/** `GET /api/saves/:id/news` (newest first; `before` pages back). */
export async function fetchNews(
  saveId: string,
  q: { scope: NewsScopeFilter; competition?: string; before?: string; limit?: number },
): Promise<NewsPage> {
  const p = new URLSearchParams({ scope: q.scope, limit: String(q.limit ?? 40) });
  if (q.competition) p.set("competition", q.competition);
  if (q.before) p.set("before", q.before);
  const res = await fetch(`/api/saves/${saveId}/news?${p}`);
  if (!res.ok) throw new Error(`news ${res.status}`);
  return res.json();
}

/** Dashboard pick: importance ≥ 2 first (newest first inside each group), then the rest. */
export function topNews(items: NewsItem[], count: number): NewsItem[] {
  const big = items.filter((n) => n.importance >= 2);
  const rest = items.filter((n) => n.importance < 2);
  return [...big, ...rest].slice(0, count);
}
