import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { Label } from "@/GameInterface/ui/Label";
import { Button } from "@/GameInterface/ui/Button";
import { Notice } from "@/GameInterface/ui/Notice";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { formatDay } from "@/GameInterface/Dashboard/HomeCards";
import { TauntActions } from "@/GameInterface/World/TauntActions";
import { rivalsApi } from "@/GameInterface/World/rivalsApi";
import type { WorldApiError } from "@/GameInterface/World/worldApi";
import { penaltiesInLineOrder, scoreLineOf } from "@/Domain/rivals/results";
import type { RivalRow, SeatResult } from "@/types/rivalsTypes";

/** The league's results by day, filtered by friend, each with the banter actions (multiplayer part 6). */
export function ResultsFeed({ saveId, mySeatId, rows, seat, onSeat, version }: {
  saveId: string;
  mySeatId: string | null;
  rows: RivalRow[];
  seat: string | null;
  onSeat: (seat: string | null) => void;
  version: number;
}) {
  const { t, i18n } = useTranslation();
  const [results, setResults] = useState<SeatResult[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<WorldApiError | null>(null);

  const load = useCallback(async (offset: number) => {
    const r = await rivalsApi.results(saveId, { seat, offset });
    if (!r.ok) { setError(r.error); return; }
    setError(null);
    setResults((prev) => (offset === 0 ? r.data.results : [...(prev ?? []), ...r.data.results]));
    setHasMore(r.data.hasMore);
  }, [saveId, seat]);

  useEffect(() => { void load(0); }, [load, version]);

  const byDay: [string, SeatResult[]][] = [];
  for (const r of results ?? []) {
    const last = byDay[byDay.length - 1];
    if (last && last[0] === r.date) last[1].push(r);
    else byDay.push([r.date, [r]]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>{t("rivals.filterLabel")}</Label>
        <OptionChips<string>
          aria-label={t("rivals.filterLabel")}
          value={seat ?? "all"}
          onChange={(k) => onSeat(k === "all" ? null : k)}
          options={[
            { key: "all", label: t("rivals.filterAll") },
            ...rows.map((r) => ({ key: r.seatId, label: r.nickname ?? r.managerName })),
          ]}
        />
      </div>
      {error && <Notice kind="error">{t(`world.errors.${error}`)}</Notice>}
      {!results && !error && <p className="text-sm text-muted-foreground m-0">{t("common.loading")}</p>}
      {results && results.length === 0 && <p className="text-sm text-muted-foreground m-0">{t("rivals.empty")}</p>}
      {byDay.map(([date, list]) => (
        <section key={date} className="flex flex-col gap-2">
          <Label>{formatDay(date, i18n.language, "long")}</Label>
          <ul className="m-0 p-0 list-none flex flex-col divide-y divide-border/50 border border-border rounded-md">
            {list.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <ClubLogo logoUrl={squadLogoUrl(r.clubId)} className="w-8 h-8 shrink-0" />
                <span className="flex flex-col min-w-0 flex-1">
                  <span className="font-semibold text-foreground truncate">{r.nickname}</span>
                  <span className="text-sm tabular-nums text-foreground">
                    {scoreLineOf(r)}
                    {penaltiesInLineOrder(r) && <span className="text-muted-foreground"> · {t("rivals.pens", penaltiesInLineOrder(r)!)}</span>}
                  </span>
                </span>
                {r.seatId !== mySeatId && <TauntActions saveId={saveId} target={{ result: r.id }} groups={r.situations} />}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {hasMore && (
        <Button variant="secondary" flush className="self-start" onClick={() => void load(results?.length ?? 0)}>
          {t("rivals.loadMore")}
        </Button>
      )}
    </div>
  );
}
