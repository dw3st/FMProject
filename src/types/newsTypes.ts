/** Etapa 42 — notícias do mundo. Regra: `.claude/rules/game/press.md` → "Notícias". */

export type NewsKind =
  | "thrashing" | "upset" | "champion" | "promoted" | "relegated" | "new_leader"
  | "big_transfer" | "manager_sacked" | "manager_hired" | "award"
  | "star_injury" | "star_retired" | "national" | "club_record"
  | "press_quote" | "press_absent" | "press_promise_kept" | "press_promise_broken";

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
