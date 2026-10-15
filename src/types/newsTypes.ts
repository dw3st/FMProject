/** Etapa 42 — notícias do mundo. Regra: `.claude/rules/game/press.md` → "Notícias". */

export type NewsKind =
  | "thrashing" | "upset" | "champion" | "promoted" | "relegated" | "new_leader"
  | "big_transfer" | "manager_sacked" | "manager_hired" | "award"
  | "star_injury" | "star_retired" | "national" | "club_record"
  | "press_quote" | "press_absent" | "press_promise_kept" | "press_promise_broken"
  | "world_member";

export interface NewsItem {
  id: string;               // `${date}:${kind}:${chave}` — estável num dia refeito
  date: string;
  kind: NewsKind;
  importance: 1 | 2 | 3;
  country?: string;
  league?: string;          // slug da liga (filtro "minha liga" / "seguidas")
  competition?: string;     // slug de copa/continental/torneio de seleção
  clubIds: string[];
  playerIds: string[];
  /** Nomes e números do dia; o texto sai de `news.<kind>.<variante>`. */
  params: Record<string, string | number>;
}

export interface NewsClub { id: string; name: string }
export interface NewsScope { country?: string; league?: string; competition?: string; tier?: number | null }

export interface DayNewsInput {
  date: string;
  /** Every seat's club (`.claude/rules/game/multiplayer.md`). */
  humanClubIds?: string[];
  /** Every seat's league: news there count as near. */
  humanLeagues?: string[];
  followed: string[];
  results: (NewsScope & {
    fixtureId: string; home: NewsClub; away: NewsClub; score: { home: number; away: number };
    /** Nível de cada lado (`clubLevel`); ausente = sem checagem de zebra. */
    levels?: { home: number; away: number };
  })[];
  champions: (NewsScope & { club: NewsClub })[];
  moves: (NewsScope & { club: NewsClub; kind: "promoted" | "relegated" })[];
  newLeaders: (NewsScope & { club: NewsClub })[];
  transfers: (NewsScope & { playerId: string; player: string; from: NewsClub | null; to: NewsClub; fee: number; star: boolean; clubRecord: boolean })[];
  managers: (NewsScope & { kind: "sacked" | "hired"; club: NewsClub; manager: string })[];
  awards: (NewsScope & { kind: "league_best" | "world_player" | "world_manager"; name: string; personId: string; club?: NewsClub })[];
  stars: (NewsScope & { kind: "injury" | "retired"; playerId: string; player: string; club?: NewsClub })[];
  national: { kind: "champion" | "favourite_out"; competition: string; team: string; teamId: string }[];
  clubRecords: (NewsScope & { club: NewsClub; record: string })[];
  press: { kind: "press_quote" | "press_absent" | "press_promise_kept" | "press_promise_broken"; club: NewsClub; manager: string; key: string; player?: string; playerId?: string; scope: NewsScope }[];
}
