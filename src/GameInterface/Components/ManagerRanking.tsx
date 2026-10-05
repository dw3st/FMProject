import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ClubCell, CrestCell, NameCell, NumberCell, RankCell, LoadMoreButton, StatsDetailRow, StatsHead, StatsRow, StatsTable,
} from "@/GameInterface/Components/StatsTable";
import { competitionName } from "@/Domain/world/labels";
import type { ManagerRecord } from "@/types/managerTypes";
import type { LeagueData } from "@/types/playerTypes";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { formatDay } from "@/GameInterface/Dashboard/HomeCards";
import { formatFee } from "@/Domain/money";

type Row = Omit<ManagerRecord, "clubs"> & {
  rank: number;
  clubName: string | null;
  /** Every manager's passages through clubs, with the reason he left (Etapa 25). */
  clubs?: { squadId: string; from: string; to?: string; left?: string; clubName: string | null }[];
  free?: boolean;
  /** The human manager: wages and severance received in the career. */
  earnings?: number;
};
type Page = { total: number; playerRank: number | null; items: Row[] };
type Scope = "world" | "country" | "free";

const PAGE = 50;

/** "Técnicos" tab of the Stats screen (`.claude/rules/game/managers.md`). */
export function ManagerRanking({ saveId, leagues, refreshKey }: { saveId: string; leagues: LeagueData[]; refreshKey?: string }) {
  const { t, i18n } = useTranslation();
  const [scope, setScope] = useState<Scope>("world");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [playerRank, setPlayerRank] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
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
    setMoreFailed(false);
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
    setMoreFailed(false);
    fetchPage(rows.length)
      .then((d) => { if (gen === generation.current) { setRows([...rows, ...d.items]); setTotal(d.total); } })
      .catch(() => { if (gen === generation.current) setMoreFailed(true); })
      .finally(() => { if (gen === generation.current) setLoadingMore(false); });
  };

  const header = (
    <div className="flex flex-wrap items-center gap-3 mb-3">
      <OptionChips<Scope>
        options={[
          { key: "world", label: t("statsScreen.managers.world") },
          { key: "country", label: t("statsScreen.managers.country") },
          { key: "free", label: t("statsScreen.managers.free") },
        ]}
        value={scope}
        onChange={setScope}
      />
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
      <StatsTable
        head={<>
          <StatsHead align="center">#</StatsHead>
          <StatsHead />
          <StatsHead>{t("statsScreen.managers.name")}</StatsHead>
          <StatsHead>{t("statsScreen.club")}</StatsHead>
          <StatsHead align="center">{t("statsScreen.managers.points")}</StatsHead>
          <StatsHead align="center">{t("statsScreen.managers.titles")}</StatsHead>
        </>}
      >
        {rows.map((m) => {
          const isOpen = open === m.id;
          return [
            <StatsRow
              key={m.id}
              highlight={m.isPlayer}
              onActivate={m.titles.length > 0 || (m.clubs?.length ?? 0) > 0 ? () => setOpen(isOpen ? null : m.id) : undefined}
              expanded={isOpen}
            >
              <RankCell rank={m.rank} />
              <CrestCell squadId={m.squadId} />
              <NameCell highlight={m.isPlayer}><span className="truncate">{m.name}</span></NameCell>
              <ClubCell>
                {m.clubName ?? t("statsScreen.managers.noClub")}
                {m.interim && <span className="text-muted-foreground"> · {t("statsScreen.managers.interim")}</span>}
              </ClubCell>
              <NumberCell strong>{m.points}</NumberCell>
              <NumberCell>{m.titles.length}</NumberCell>
            </StatsRow>,
            isOpen && (
              <StatsDetailRow key={`${m.id}-titles`} colSpan={6}>
                {m.isPlayer && m.earnings !== undefined && (
                  <p className="text-sm text-foreground m-0 mb-3 tabular-nums">
                    {t("statsScreen.managers.earnings", { amount: formatFee(m.earnings) })}
                  </p>
                )}
                {m.clubs && m.clubs.length > 0 && (
                  <div className="mb-3">
                    <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0 mb-1">
                      {t("statsScreen.managers.career")}
                    </p>
                    <ul className="m-0 p-0 list-none space-y-1">
                      {[...m.clubs].reverse().map((c, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm">
                          <ClubLogo logoUrl={squadLogoUrl(c.squadId)} className="w-8 h-8" imgClassName="w-full h-full object-contain" />
                          <span className="font-semibold">{c.clubName ?? "-"}</span>
                          <span className="text-muted-foreground tabular-nums ml-auto">
                            {formatDay(c.from, i18n.language, "year")} – {c.to ? formatDay(c.to, i18n.language, "year") : t("statsScreen.managers.current")}
                            {c.left && <> · {t(`statsScreen.managers.leftReason.${c.left}`)}</>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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
              </StatsDetailRow>
            ),
          ];
        })}
      </StatsTable>
      {rows.length < total && (
        <LoadMoreButton
          onClick={loadMore}
          loading={loadingMore}
          failed={moreFailed}
          label={t("statsScreen.retired.loadMore")}
          loadingLabel={t("statsScreen.loading")}
          failedLabel={t("statsScreen.loadFailed")}
        />
      )}
      <p className="text-sm text-muted-foreground mt-3">{t("statsScreen.managers.hint")}</p>
    </div>
  );
}
