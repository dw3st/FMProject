import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { formatDay } from "@/GameInterface/Dashboard/HomeCards";
import { Flag } from "@/GameInterface/Components/Flag";
import { Icon } from "@/GameInterface/Icons";
import { TABLE_CELL, TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";

/** One window of a country (`.claude/rules/game/transfer-windows.md`). */
export interface WindowDto {
  kind: "pre" | "mid";
  open: string;
  close: string;
}

export interface TransferWindowsDto {
  player: { country: string; iso2?: string; open: boolean; until?: string; opensOn?: string };
  countries: { country: string; iso2?: string; current?: WindowDto; next?: WindowDto }[];
}

/** The save's transfer windows, refetched when the game day changes. */
export function useTransferWindows(): TransferWindowsDto | null {
  const { session, currentDate } = useGameSave();
  const saveId = session?.saveId;
  const [data, setData] = useState<TransferWindowsDto | null>(null);
  useEffect(() => {
    if (!saveId) return;
    let alive = true;
    void fetch(`/api/saves/${saveId}/transfer-windows`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: TransferWindowsDto | null) => { if (alive) setData(d); })
      .catch(() => { if (alive) setData(null); });
    return () => { alive = false; };
  }, [saveId, currentDate]);
  return data;
}

/** "Window open until 31 Aug 2027" / "Window closed — opens on 31 May 2028", with the country. */
export function WindowBanner({ data }: { data: TransferWindowsDto | null }) {
  const { t, i18n } = useTranslation();
  if (!data) return null;
  const p = data.player;
  const text = p.open
    ? t("transferWindows.openUntil", { date: p.until ? formatDay(p.until, i18n.language, "year") : "—" })
    : t("transferWindows.closedOpensOn", { date: p.opensOn ? formatDay(p.opensOn, i18n.language, "year") : "—" });
  return (
    <div
      role="status"
      className={`flex items-center gap-3 rounded-md border px-4 py-3 ${p.open ? "border-chart-2/40 bg-chart-2/10" : "border-border bg-card"}`}
    >
      <Icon name={p.open ? "check-circle" : "clock"} size={16} className={p.open ? "text-chart-2" : "text-muted-foreground"} />
      {p.iso2 && <Flag code={p.iso2} />}
      <span className="text-sm font-semibold text-foreground">{text}</span>
      {p.country && <span className="text-sm text-muted-foreground">· {p.country}</span>}
    </div>
  );
}

/** Windows tab: every country's current and next window (the player's and the followed ones first). */
export function WindowsTable({ data }: { data: TransferWindowsDto | null }) {
  const { t, i18n } = useTranslation();
  if (!data) return <p className="text-sm text-muted-foreground">{t("transferWindows.loading")}</p>;
  const span = (w?: WindowDto) =>
    w ? `${formatDay(w.open, i18n.language, "short")} – ${formatDay(w.close, i18n.language, "year")}` : "—";
  return (
    <div className={TABLE_STYLE.shell}>
      <table className="w-full text-left">
        <thead className={TABLE_STYLE.head}>
          <tr>
            <th className={TABLE_CELL.head}>{t("transferWindows.country")}</th>
            <th className={TABLE_CELL.head}>{t("transferWindows.current")}</th>
            <th className={TABLE_CELL.head}>{t("transferWindows.next")}</th>
          </tr>
        </thead>
        <tbody className={TABLE_STYLE.body}>
          {data.countries.map((c) => {
            const mine = c.country === data.player.country;
            return (
              <tr key={c.country} className={`${TABLE_STYLE.row} ${mine ? TABLE_STYLE.rowHighlight : ""}`}>
                <td className={TABLE_CELL.body}>
                  <span className="flex items-center gap-2">
                    {c.iso2 && <Flag code={c.iso2} />}
                    <span className={mine ? TABLE_STYLE.nameHighlight : TABLE_STYLE.name}>{c.country}</span>
                  </span>
                </td>
                <td className={`${TABLE_CELL.body} text-sm tabular-nums ${c.current ? "text-chart-2 font-semibold" : "text-muted-foreground"}`}>
                  {c.current ? `${t(`transferWindows.kind.${c.current.kind}`)} · ${span(c.current)}` : t("transferWindows.closed")}
                </td>
                <td className={`${TABLE_CELL.body} text-sm tabular-nums text-muted-foreground`}>
                  {c.next ? `${t(`transferWindows.kind.${c.next.kind}`)} · ${span(c.next)}` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Translated text of a `windowClosed` refusal (`opensOn` from the 409 body). */
export function windowClosedText(t: (k: string, o?: Record<string, unknown>) => string, lang: string, opensOn?: string): string {
  return opensOn ? t("transferWindows.closedOpensOnShort", { date: formatDay(opensOn, lang, "year") }) : t("transferWindows.closed");
}

/** Players the club is buying and selling (`summary` of `GET /api/saves/:id/negotiation`). */
function useNegotiationSummary(): { buying: number; selling: number } | null {
  const { session, currentDate } = useGameSave();
  const saveId = session?.saveId;
  const [data, setData] = useState<{ buying: number; selling: number } | null>(null);
  useEffect(() => {
    if (!saveId) return;
    let alive = true;
    void fetch(`/api/saves/${saveId}/negotiation`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { summary?: { buying: number; selling: number } } | null) => { if (alive) setData(d?.summary ?? null); })
      .catch(() => { if (alive) setData(null); });
    return () => { alive = false; };
  }, [saveId, currentDate]);
  return data;
}

/**
 * Green strip while the club's window is open (report: highlight it, with the deals in progress): until when, how
 * many players the club is buying and selling, and a link to the market. Nothing with the window closed.
 */
export function MarketWindowStrip() {
  const { t, i18n } = useTranslation();
  const windows = useTransferWindows();
  const summary = useNegotiationSummary();
  const p = windows?.player;
  if (!p?.open) return null;
  const until = t("transferWindows.strip.open", { date: p.until ? formatDay(p.until, i18n.language, "short") : "—" });
  const deals = !summary
    ? null
    : summary.buying + summary.selling === 0
      ? t("transferWindows.strip.dealsNone")
      : t("transferWindows.strip.deals", {
          buying: t("transferWindows.strip.buying", { count: summary.buying }),
          selling: t("transferWindows.strip.selling", { count: summary.selling }),
        });
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-green-500/50 bg-green-500/15 px-4 py-2.5">
      <Icon name="check-circle" size={16} className="text-green-400 shrink-0" />
      <span className="text-sm font-semibold text-foreground">{until}</span>
      {deals && <span className="text-sm text-muted-foreground tabular-nums">· {deals}</span>}
      <a
        href="/transfers"
        className="ml-auto inline-flex items-center h-8 px-3 rounded-md border border-green-500/50 text-sm font-semibold text-green-400 no-underline hover:bg-green-500/20"
      >
        {t("transferWindows.strip.market")}
      </a>
    </div>
  );
}
