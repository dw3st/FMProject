import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Label } from "@/GameInterface/ui/Label";
import { Button } from "@/GameInterface/ui/Button";
import { Notice } from "@/GameInterface/ui/Notice";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { formatDay } from "@/GameInterface/Dashboard/HomeCards";
import { TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import { pickLabel } from "@/GameInterface/Achievements/betText";
import { FriendBetItem } from "@/GameInterface/World/FriendBetItem";
import { rivalsApi } from "@/GameInterface/World/rivalsApi";
import type { WorldApiError } from "@/GameInterface/World/worldApi";
import { formatFee } from "@/Domain/money";
import type { FriendBetsView, RivalRow } from "@/types/rivalsTypes";

/** Pick · game · stake · odds. */
const OPEN_COLS = "md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_120px_80px]";

/** A friend's bets under the Rivals table: the open ones and the last settled, with the banter (8.9.7, option A). */
export function FriendBetsPanel({ saveId, row, onResults, version }: {
  saveId: string;
  row: RivalRow;
  onResults: () => void;
  version: number;
}) {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<FriendBetsView | null>(null);
  const [error, setError] = useState<WorldApiError | null>(null);
  const name = row.nickname ?? row.managerName;

  useEffect(() => {
    let live = true;
    setView(null);
    void rivalsApi.friendBets(saveId, row.seatId).then((r) => {
      if (!live) return;
      if (r.ok) { setView(r.data); setError(null); } else setError(r.error);
    });
    return () => { live = false; };
  }, [saveId, row.seatId, version]);

  const net = view?.net ?? row.bets.net;
  return (
    <section className="flex flex-col gap-3 rounded-md border border-border px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("rivals.bets.title", { name })}</h3>
        <span className="text-sm text-muted-foreground tabular-nums">
          {t("rivals.bets.summary", { count: view?.open.length ?? row.bets.open })} · {t("rivals.bets.net", { value: `${net > 0 ? "+" : net < 0 ? "−" : ""}${formatFee(Math.abs(net))}` })}
        </span>
        <Button variant="secondary" flush className="ml-auto" onClick={onResults}>{t("rivals.bets.seeResults")}</Button>
      </div>
      {error && <Notice kind="error">{t(`world.errors.${error}`)}</Notice>}
      {!view && !error && <p className="text-sm text-muted-foreground m-0">{t("common.loading")}</p>}
      {view && (
        <>
          {view.open.length === 0 ? (
            <p className="text-sm text-muted-foreground m-0">{t("rivals.bets.noOpen")}</p>
          ) : (
            <div className={TABLE_STYLE.shell}>
              <div className={`${TABLE_STYLE.head} hidden md:grid ${OPEN_COLS} gap-3 px-4 py-3`}>
                <span>{t("rivals.bets.colPick")}</span>
                <span>{t("rivals.bets.colGame")}</span>
                <span>{t("rivals.bets.colStake")}</span>
                <span>{t("rivals.bets.colOdds")}</span>
              </div>
              <div className={TABLE_STYLE.body}>
                {view.open.map((b) => (
                  <div key={b.id} className={`grid grid-cols-1 ${OPEN_COLS} gap-x-3 gap-y-1 px-4 py-2.5 items-center`}>
                    <span className={TABLE_STYLE.name}>{pickLabel(t, b.pick, b.homeName, b.awayName)}</span>
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
                      <ClubLogo logoUrl={squadLogoUrl(b.home)} className="w-5 h-5 shrink-0" imgClassName="w-full h-full object-contain" />
                      <span className="truncate">{t("rivals.bets.gameOn", { home: b.homeName, away: b.awayName, date: formatDay(b.date, i18n.language) })}</span>
                      <ClubLogo logoUrl={squadLogoUrl(b.away)} className="w-5 h-5 shrink-0" imgClassName="w-full h-full object-contain" />
                    </span>
                    <span className="text-sm tabular-nums">{formatFee(b.stake)}</span>
                    <span className="text-sm tabular-nums">{b.odds.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {view.settled.length > 0 && (
            <>
              <Label>{t("rivals.bets.settled")}</Label>
              <div className="flex flex-col divide-y divide-border/50 border border-border rounded-md">
                {view.settled.map((b) => (
                  <FriendBetItem key={b.id} saveId={saveId} id={`${row.seatId}:${b.id}`} nickname={null} bet={b} canTaunt={!row.me} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
