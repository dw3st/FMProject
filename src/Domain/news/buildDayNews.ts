import type { DayNewsInput, NewsItem, NewsKind, NewsScope } from "@/types/newsTypes";

export const NEWS = {
  THRASHING_MARGIN: 4,
  UPSET_LEVEL_GAP: 0.6,
  BIG_FEE: 20_000_000,
  HUGE_FEE: 60_000_000,
  PER_LEAGUE: 3,
  PER_DAY: 30,
  MOVES_MAX_TIER: 2,
  MONTHS_KEPT: 12,
  VARIANTS: 3,
} as const;

export function emptyDayNewsInput(date: string): DayNewsInput {
  return { date, followed: [], results: [], champions: [], moves: [], newLeaders: [], transfers: [], managers: [],
    awards: [], stars: [], national: [], clubRecords: [], press: [] };
}

const PRESS_KINDS: NewsKind[] = ["press_quote", "press_absent", "press_promise_kept", "press_promise_broken"];

export function buildDayNews(input: DayNewsInput): NewsItem[] {
  const near = (s: NewsScope) => !!s.league && (s.league === input.humanLeague || input.followed.includes(s.league));
  const out: NewsItem[] = [];
  const add = (kind: NewsKind, key: string, scope: NewsScope, base: 1 | 2 | 3,
    clubIds: string[], playerIds: string[], params: Record<string, string | number>) => {
    const importance = (base === 3 ? 3 : near(scope) || !!scope.competition ? Math.max(base, 2) : base) as 1 | 2 | 3;
    out.push({
      id: `${input.date}:${kind}:${key}`, date: input.date, kind, importance,
      ...(scope.country ? { country: scope.country } : {}), ...(scope.league ? { league: scope.league } : {}),
      ...(scope.competition ? { competition: scope.competition } : {}),
      clubIds, playerIds, params,
    });
  };
  const score = (h: number, a: number) => `${h}–${a}`;

  for (const r of input.results) {
    const topFlight = r.tier === 1 || !!r.competition;
    const diff = r.score.home - r.score.away;
    if (topFlight && Math.abs(diff) >= NEWS.THRASHING_MARGIN && (r.tier === 1 || r.competition)) {
      const [w, l] = diff > 0 ? [r.home, r.away] : [r.away, r.home];
      add("thrashing", r.fixtureId, r, 1, [w.id, l.id], [], { winner: w.name, loser: l.name, score: score(Math.max(r.score.home, r.score.away), Math.min(r.score.home, r.score.away)) });
      continue;
    }
    if (topFlight && diff !== 0 && r.levels) {
      const winnerLevel = diff > 0 ? r.levels.home : r.levels.away;
      const loserLevel = diff > 0 ? r.levels.away : r.levels.home;
      if (loserLevel - winnerLevel >= NEWS.UPSET_LEVEL_GAP) {
        const [w, l] = diff > 0 ? [r.home, r.away] : [r.away, r.home];
        add("upset", r.fixtureId, r, 1, [w.id, l.id], [], { winner: w.name, loser: l.name, score: `${r.score.home}–${r.score.away}` });
      }
    }
  }
  for (const c of input.champions) add("champion", `${c.league ?? c.competition}:${c.club.id}`, c, 3, [c.club.id], [], { club: c.club.name, competition: c.league ?? c.competition ?? "" });
  for (const m of input.moves) {
    if (m.tier != null && m.tier > NEWS.MOVES_MAX_TIER) continue;
    add(m.kind, `${m.league}:${m.club.id}`, m, 1, [m.club.id], [], { club: m.club.name, league: m.league ?? "" });
  }
  for (const l of input.newLeaders) add("new_leader", `${l.league}:${l.club.id}`, l, 2, [l.club.id], [], { club: l.club.name, league: l.league ?? "" });
  for (const t of input.transfers) {
    if (t.fee < NEWS.BIG_FEE && !t.star && !t.clubRecord) continue;
    add("big_transfer", t.playerId, t, t.fee >= NEWS.HUGE_FEE ? 3 : 1, [t.to.id, ...(t.from ? [t.from.id] : [])], [t.playerId],
      { player: t.player, from: t.from?.name ?? "", to: t.to.name, fee: t.fee });
  }
  for (const m of input.managers) add(m.kind === "sacked" ? "manager_sacked" : "manager_hired", `${m.club.id}:${m.manager}`, m, 1, [m.club.id], [], { club: m.club.name, manager: m.manager });
  for (const a of input.awards) add("award", `${a.kind}:${a.personId}`, a, a.kind === "league_best" ? 1 : 3, a.club ? [a.club.id] : [], [a.personId], { kind: a.kind, name: a.name, club: a.club?.name ?? "", league: a.league ?? "" });
  for (const s of input.stars) add(s.kind === "injury" ? "star_injury" : "star_retired", s.playerId, s, 1, s.club ? [s.club.id] : [], [s.playerId], { player: s.player, club: s.club?.name ?? "" });
  for (const n of input.national) add("national", `${n.kind}:${n.competition}:${n.teamId}`, { competition: n.competition }, n.kind === "champion" ? 3 : 2, [], [], { kind: n.kind, team: n.team, competition: n.competition });
  for (const r of input.clubRecords) add("club_record", `${r.club.id}:${r.record}`, r, 1, [r.club.id], [], { club: r.club.name, record: r.record });
  for (const p of input.press) add(p.kind, `${p.club.id}:${p.key}`, p.scope, 3, [p.club.id], p.playerId ? [p.playerId] : [], { club: p.club.name, manager: p.manager, key: p.key, player: p.player ?? "" });

  // Tetos: imprensa sempre entra; o resto por importância (desempate id), no máximo PER_LEAGUE por liga e PER_DAY no total.
  const pressItems = out.filter((n) => PRESS_KINDS.includes(n.kind));
  const rest = out.filter((n) => !PRESS_KINDS.includes(n.kind)).sort((a, b) => b.importance - a.importance || (a.id < b.id ? -1 : 1));
  const perLeague = new Map<string, number>();
  const kept: NewsItem[] = [...pressItems];
  for (const n of rest) {
    if (kept.length >= NEWS.PER_DAY) break;
    const k = n.league ?? n.competition ?? "_";
    const used = perLeague.get(k) ?? 0;
    if (k !== "_" && used >= NEWS.PER_LEAGUE) continue;
    perLeague.set(k, used + 1);
    kept.push(n);
  }
  return kept;
}

/** Variante do texto (`news.<kind>.<n>`), estável pelo id. */
export function newsVariant(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % NEWS.VARIANTS;
}
