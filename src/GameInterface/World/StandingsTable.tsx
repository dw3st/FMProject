import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  ClubCell, CrestCell, NameCell, NumberCell, RankCell, StatsCell, StatsDetailRow, StatsHead, StatsRow, StatsTable,
} from "@/GameInterface/Components/StatsTable";
import { ManagerFaceImage } from "@/GameInterface/Components/PersonFace";
import { seatManagerId } from "@/Domain/seats/seats";
import { managerFaceCountry } from "@/Domain/faces/managerFace";
import { competitionName } from "@/Domain/world/labels";
import type { LeagueData } from "@/types/playerTypes";
import type { SeatSeasonRow, StandingItem, StandingsEntry, StandingsView } from "@/types/standingsTypes";

const COLS = 8;
const label = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";

/** "+10", "−3", "0". */
export function signedPoints(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return "0";
}

/** Place of each entry: equal totals share the place. */
function rankOf(entries: readonly StandingsEntry[], e: StandingsEntry): number {
  return 1 + entries.filter((o) => o.total > e.total).length;
}

/** Friends' league standings (multiplayer part 5a): one row per manager, details on click. */
export function StandingsTable({ view, mySeatId }: { view: StandingsView; mySeatId: string | null }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<LeagueData[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/leagues")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: LeagueData[]) => { if (!cancelled) setLeagues(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setLeagues([]); });
    return () => { cancelled = true; };
  }, []);

  if (view.entries.length === 0) return <p className="text-sm text-muted-foreground m-0">{t("world.standings.empty")}</p>;

  return (
    <StatsTable
      head={
        <>
          <StatsHead align="center">#</StatsHead>
          <StatsHead><span className="sr-only">{t("world.members.manager")}</span></StatsHead>
          <StatsHead>{t("world.members.manager")}</StatsHead>
          <StatsHead><span className="sr-only">{t("world.members.club")}</span></StatsHead>
          <StatsHead>{t("world.members.club")}</StatsHead>
          <StatsHead align="center">{t("world.standings.current")}</StatsHead>
          <StatsHead align="center">{t("world.standings.closed")}</StatsHead>
          <StatsHead align="center">{t("world.standings.total")}</StatsHead>
        </>
      }
    >
      {view.entries.map((e) => {
        const me = e.seatId === mySeatId;
        const expanded = open === e.seatId;
        return (
          <Fragment key={e.seatId}>
            <StatsRow highlight={me} expanded={expanded} onActivate={() => setOpen(expanded ? null : e.seatId)}>
              <RankCell rank={rankOf(view.entries, e)} />
              <StatsCell className="w-12">
                <ManagerFaceImage
                  manager={{ id: seatManagerId(e.seatId), name: e.managerName, face: e.face, nationality: managerFaceCountry(e.nationalityIso) }}
                  clubColors={e.clubColors}
                  size={32}
                />
              </StatsCell>
              <NameCell highlight={me}>
                <span className="flex flex-col min-w-0">
                  <span className="truncate">{e.managerName}</span>
                  {e.nickname && <span className="text-sm font-normal text-muted-foreground truncate">{e.nickname}</span>}
                </span>
              </NameCell>
              <CrestCell squadId={e.clubId || null} />
              <ClubCell>{e.clubId ? e.clubName : t("world.members.unemployed")}</ClubCell>
              <NumberCell>
                {e.partial ? (
                  <span className="inline-flex items-center gap-1.5">
                    {signedPoints(e.partial.total)}
                    <span className="rounded border border-border px-2 py-0.5 text-sm">{t("world.standings.partial")}</span>
                  </span>
                ) : "—"}
              </NumberCell>
              <NumberCell>{signedPoints(e.closedTotal)}</NumberCell>
              <NumberCell strong>{signedPoints(e.total)}</NumberCell>
            </StatsRow>
            {expanded && (
              <StatsDetailRow colSpan={COLS}>
                <EntryDetail entry={e} rows={view.rows.filter((r) => r.seatId === e.seatId)} leagues={leagues} />
              </StatsDetailRow>
            )}
          </Fragment>
        );
      })}
    </StatsTable>
  );
}

function EntryDetail({ entry, rows, leagues }: { entry: StandingsEntry; rows: SeatSeasonRow[]; leagues: LeagueData[] }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      {entry.partial && (
        <PassageBlock
          title={t("world.standings.currentSeason")}
          meta={[entry.clubName, placeText(t, entry.partial.position, entry.partial.target)]}
          items={entry.partial.items}
          total={entry.partial.total}
          leagues={leagues}
          partial
        />
      )}
      {rows.map((r) => (
        <PassageBlock
          key={r.id}
          title={t("world.standings.season", { season: r.season })}
          meta={[r.clubName, t(`world.standings.reason.${r.reason}`), placeText(t, r.position, r.target)]}
          items={r.items}
          total={r.total}
          leagues={leagues}
        />
      ))}
      {!entry.partial && rows.length === 0 && <p className="text-sm text-muted-foreground m-0">{t("world.standings.noSeasons")}</p>}
    </div>
  );
}

function placeText(t: TFunction, position: number | null, target: number | null): string {
  if (position === null) return "";
  return target === null ? t("world.standings.position", { position }) : t("world.standings.positionTarget", { position, target });
}

function PassageBlock({ title, meta, items, total, leagues, partial }: {
  title: string;
  meta: string[];
  items: StandingItem[];
  total: number;
  leagues: LeagueData[];
  partial?: boolean;
}) {
  const { t, i18n } = useTranslation();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={label}>{title}</span>
        <span className="text-sm text-muted-foreground">{meta.filter(Boolean).join(" · ")}</span>
        {partial && <span className="rounded border border-border px-2 py-0.5 text-sm text-muted-foreground">{t("world.standings.partial")}</span>}
      </div>
      <ul className="m-0 p-0 list-none flex flex-col gap-1 max-w-md">
        {items.length === 0 && <li className="text-sm text-muted-foreground">{t("world.standings.noItems")}</li>}
        {items.map((it, i) => (
          <li key={`${it.key}-${i}`} className="flex items-center justify-between gap-4 text-sm">
            <span className="text-foreground">
              {t(`world.standings.items.${it.key}`)}
              {it.detail && <span className="text-muted-foreground"> · {competitionName(it.detail, leagues, i18n.language)}</span>}
            </span>
            <span className={`tabular-nums font-semibold ${it.points < 0 ? "text-destructive" : "text-foreground"}`}>{signedPoints(it.points)}</span>
          </li>
        ))}
        <li className="flex items-center justify-between gap-4 text-sm border-t border-border pt-1">
          <span className={label}>{t("world.standings.total")}</span>
          <span className="tabular-nums font-display font-bold text-primary">{signedPoints(total)}</span>
        </li>
      </ul>
    </div>
  );
}
