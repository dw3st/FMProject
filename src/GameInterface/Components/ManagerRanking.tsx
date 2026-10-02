import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { competitionName } from "@/Domain/world/labels";
import type { ManagerRecord } from "@/types/managerTypes";
import type { LeagueData } from "@/types/playerTypes";

type Row = ManagerRecord & { rank: number; clubName: string | null };
type Page = { total: number; playerRank: number | null; items: Row[] };
type Scope = "world" | "country";

const PAGE = 50;
const TH = "px-2 py-2 font-display font-bold uppercase tracking-[0.08em] text-xs text-muted-foreground";
const TD = "px-2 py-1.5";
const ROW = "h-11 border-b border-border last:border-0";

/** "Técnicos" tab of the Stats screen (`.claude/rules/game/managers.md`). */
export function ManagerRanking({ saveId, leagues, refreshKey }: { saveId: string; leagues: LeagueData[]; refreshKey?: string }) {
  const { t, i18n } = useTranslation();
  const [scope, setScope] = useState<Scope>("world");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [playerRank, setPlayerRank] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  // Bumped on every scope change, so a "load more" answer for the old scope is dropped.
  const generation = useRef(0);

  const fetchPage = (offset: number) =>
    fetch(`/api/saves/${saveId}/managers?scope=${scope}&offset=${offset}&limit=${PAGE}`)
      .then((r) => (r.ok ? (r.json() as Promise<Page>) : Promise.reject(new Error(String(r.status)))));

  useEffect(() => {
    let cancelled = false;
    generation.current++;
    setRows(null);
    setError(false);
    setOpen(null);
    setLoadingMore(false);
    fetchPage(0)
      .then((d) => { if (!cancelled) { setRows(d.items); setTotal(d.total); setPlayerRank(d.playerRank); } })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveId, scope, refreshKey]);

  const loadMore = () => {
    if (!rows || loadingMore) return;
    const gen = generation.current;
    setLoadingMore(true);
    fetchPage(rows.length)
      .then((d) => { if (gen === generation.current) { setRows([...rows, ...d.items]); setTotal(d.total); } })
      .catch(() => { if (gen === generation.current) setError(true); })
      .finally(() => { if (gen === generation.current) setLoadingMore(false); });
  };

  const chip = (value: Scope, label: string) => (
    <button
      type="button"
      aria-pressed={scope === value}
      onClick={() => setScope(value)}
      className={`rounded border px-3 py-1.5 text-sm bg-transparent cursor-pointer min-h-8 ${
        scope === value ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
  const header = (
    <div className="flex flex-wrap items-center gap-3 mb-3">
      <div className="flex gap-2">
        {chip("world", t("statsScreen.managers.world"))}
        {chip("country", t("statsScreen.managers.country"))}
      </div>
      {playerRank !== null && (
        <span className="text-sm text-muted-foreground">{t("statsScreen.managers.yourRank", { rank: playerRank, total })}</span>
      )}
    </div>
  );

  if (error) return <>{header}<p className="text-sm text-muted-foreground">{t("statsScreen.loadFailed")}</p></>;
  if (!rows) return <>{header}<p className="text-sm text-muted-foreground">{t("statsScreen.loading")}</p></>;
  if (rows.length === 0) return <>{header}<p className="text-sm text-muted-foreground">{t("statsScreen.managers.empty")}</p></>;

  const titleLabel = (kind: ManagerRecord["titles"][number]["kind"], competition: string) => {
    const name = competitionName(competition, leagues, i18n.language);
    return kind === "promotion" ? t("statsScreen.managers.promotion", { league: name }) : name;
  };

  return (
    <div className="max-w-4xl">
      {header}
      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr>
              <th className={`${TH} text-center w-10`}>#</th>
              <th className={`${TH} text-left`}>{t("statsScreen.managers.name")}</th>
              <th className={`${TH} text-left`}>{t("statsScreen.managers.club")}</th>
              <th className={`${TH} text-right`}>{t("statsScreen.managers.points")}</th>
              <th className={`${TH} text-right`}>{t("statsScreen.managers.titles")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const isOpen = open === m.id;
              const canOpen = m.titles.length > 0;
              return [
                <tr
                  key={m.id}
                  className={`${ROW} ${m.isPlayer ? "bg-primary/10" : ""} ${canOpen ? "cursor-pointer hover:bg-white/5" : ""}`}
                  onClick={canOpen ? () => setOpen(isOpen ? null : m.id) : undefined}
                  onKeyDown={canOpen ? (e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(isOpen ? null : m.id); }
                  } : undefined}
                  tabIndex={canOpen ? 0 : undefined}
                  aria-expanded={canOpen ? isOpen : undefined}
                >
                  <td className={`${TD} text-center text-muted-foreground tabular-nums`}>{m.rank}</td>
                  <td className={`${TD} ${m.isPlayer ? "text-primary font-semibold" : ""}`}>{m.name}</td>
                  <td className={`${TD} max-w-[14rem]`}>
                    <span className="inline-flex items-center gap-2 max-w-full">
                      <ClubLogo logoUrl={squadLogoUrl(m.squadId)} className="w-8 h-8 rounded-full shrink-0" />
                      <span className="truncate text-muted-foreground">{m.clubName ?? "-"}</span>
                    </span>
                  </td>
                  <td className={`${TD} text-right font-display font-bold tabular-nums`}>{m.points}</td>
                  <td className={`${TD} text-right tabular-nums`}>{m.titles.length}</td>
                </tr>,
                isOpen && (
                  <tr key={`${m.id}-titles`} className="border-b border-border last:border-0">
                    <td colSpan={5} className="px-4 py-3">
                      <ul className="m-0 p-0 list-none space-y-1">
                        {[...m.titles].reverse().map((ti, i) => (
                          <li key={i} className="flex justify-between gap-4 text-sm">
                            <span>
                              <span className="text-muted-foreground tabular-nums mr-2">{ti.season}</span>
                              {titleLabel(ti.kind, ti.competition)}
                            </span>
                            <span className="tabular-nums text-muted-foreground">+{ti.points}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>
      {rows.length < total && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-3 h-10 px-5 bg-transparent border-0 text-sm font-semibold text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-50"
        >
          {loadingMore ? t("statsScreen.loading") : t("statsScreen.retired.loadMore")}
        </button>
      )}
      <p className="text-sm text-muted-foreground mt-3">{t("statsScreen.managers.hint")}</p>
    </div>
  );
}
