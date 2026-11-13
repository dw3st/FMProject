import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { ClubCell, CrestCell, LoadMoreButton, NameCell, NumberCell, RankCell, StatsCell, StatsHead, StatsRow, StatsTable } from "@/GameInterface/Components/StatsTable";
import { fetchFanbase, followersLabel, HEAT_CLASS, trendLabel } from "@/GameInterface/Fanbase/fanbaseApi";
import { competitionName } from "@/Domain/world/labels";
import type { FanbaseRow, FanbaseScope, FanbaseView } from "@/Domain/fanbase/fanbase";
import type { LeagueData } from "@/types/playerTypes";

const PAGE = 50;

/** "Redes sociais" tab of the Stats screen (`.claude/rules/game/fanbase.md`): clubs by followers and how the season moves them. */
export function FanbaseTab({ saveId, leagues, refreshKey }: { saveId: string; leagues: LeagueData[]; refreshKey?: string }) {
  const { t, i18n } = useTranslation();
  const [scope, setScope] = useState<FanbaseScope>("league");
  const [view, setView] = useState<FanbaseView | undefined>(undefined);
  const [rows, setRows] = useState<FanbaseRow[]>([]);
  const [error, setError] = useState(false);
  const [more, setMore] = useState<"idle" | "loading" | "failed">("idle");

  useEffect(() => {
    let cancelled = false;
    setView(undefined);
    setRows([]);
    setError(false);
    setMore("idle");
    fetchFanbase(saveId, scope, 0, PAGE)
      .then((v) => { if (!cancelled) { setView(v); setRows(v.items); } })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [saveId, scope, refreshKey]);

  const loadMore = () => {
    setMore("loading");
    fetchFanbase(saveId, scope, rows.length, PAGE)
      .then((v) => { setRows((r) => [...r, ...v.items]); setMore("idle"); })
      .catch(() => setMore("failed"));
  };

  const mine = view?.mine ?? null;
  return (
    <div className="flex flex-col gap-4">
      <OptionChips
        aria-label={t("fanbase.scopeLabel")}
        options={[
          { key: "league" as const, label: t("fanbase.scope.league") },
          { key: "country" as const, label: t("fanbase.scope.country") },
          { key: "world" as const, label: t("fanbase.scope.world") },
        ]}
        value={scope}
        onChange={setScope}
      />

      {mine && (
        <div className="card-arcade rounded-md px-4 py-3 flex flex-wrap items-center gap-x-8 gap-y-2">
          <Figure label={t("fanbase.mine.rank")}>{t("fanbase.mine.rankValue", { rank: mine.rank, total: view!.total })}</Figure>
          <Figure label={t("fanbase.followers")}>{followersLabel(mine.followers, i18n.language)}</Figure>
          <Figure label={t("fanbase.trend")}>{trendLabel(mine.trend, i18n.language) ?? t("fanbase.noTrend")}</Figure>
          <Figure label={t("fanbase.mood")}><span className={HEAT_CLASS[mine.heat]}>{t(`fanbase.heat.${mine.heat}`)}</span></Figure>
          <p className="m-0 text-sm text-muted-foreground basis-full">{t(`fanbase.effect.${mine.heat}`)}</p>
        </div>
      )}

      {error ? (
        <p className="text-sm text-muted-foreground">{t("statsScreen.loadFailed")}</p>
      ) : view === undefined ? (
        <p className="text-sm text-muted-foreground">{t("statsScreen.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("fanbase.empty")}</p>
      ) : (
        <>
          <StatsTable
            head={
              <>
                <StatsHead align="center">#</StatsHead>
                <StatsHead className="w-12"><span className="sr-only">{t("fanbase.crest")}</span></StatsHead>
                <StatsHead>{t("fanbase.club")}</StatsHead>
                <StatsHead>{t("fanbase.league")}</StatsHead>
                <StatsHead align="center">{t("fanbase.followers")}</StatsHead>
                <StatsHead align="center" title={t("fanbase.trendLong")}>{t("fanbase.trend")}</StatsHead>
                <StatsHead>{t("fanbase.mood")}</StatsHead>
              </>
            }
          >
            {rows.map((r) => {
              const own = r.squadId === mine?.squadId;
              return (
                <StatsRow key={r.squadId} highlight={own}>
                  <RankCell rank={r.rank} />
                  <CrestCell squadId={r.squadId} />
                  <NameCell highlight={own} href={`/squad/${r.leagueSlug}/${r.squadId}`}><span className="truncate">{r.name}</span></NameCell>
                  <ClubCell>{competitionName(r.leagueSlug, leagues, i18n.language)}</ClubCell>
                  <NumberCell strong>{followersLabel(r.followers, i18n.language)}</NumberCell>
                  <NumberCell>{trendLabel(r.trend, i18n.language) ?? "–"}</NumberCell>
                  <StatsCell><span className={`text-sm font-semibold ${HEAT_CLASS[r.heat]}`}>{t(`fanbase.heat.${r.heat}`)}</span></StatsCell>
                </StatsRow>
              );
            })}
          </StatsTable>
          {rows.length < view.total && (
            <LoadMoreButton
              onClick={loadMore}
              loading={more === "loading"}
              failed={more === "failed"}
              label={t("fanbase.loadMore")}
              loadingLabel={t("statsScreen.loading")}
              failedLabel={t("statsScreen.loadFailed")}
            />
          )}
        </>
      )}
      <p className="m-0 text-sm text-muted-foreground">{t("fanbase.note")}</p>
    </div>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{label}</span>
      <span className="font-display font-bold tabular-nums text-xl leading-none">{children}</span>
    </div>
  );
}
