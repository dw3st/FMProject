import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/GameInterface/ui/Button";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { competitionName } from "@/Domain/world/labels";
import { useLeagueCatalog } from "@/GameInterface/World/useLeagueCatalog";
import { betCompetitionOf, openFriendBets, rivalCompText } from "@/GameInterface/World/RivalCompetitions";
import { rivalsApi } from "@/GameInterface/World/rivalsApi";
import type { RivalRow } from "@/types/rivalsTypes";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";

/** One friend: five rows of his league table around him, his cups, and the bet button (8.9.9). */
function FriendCard({ row }: { row: RivalRow }) {
  const { t, i18n } = useTranslation();
  const leagues = useLeagueCatalog();
  const cups = (row.comps ?? []).filter((c) => c.kind !== "league");
  const betSlug = betCompetitionOf(row);
  return (
    <div className="rounded-md border border-border bg-card p-4 flex flex-col gap-3 min-w-0">
      <div className="flex items-center gap-3">
        <ClubLogo logoUrl={squadLogoUrl(row.clubId)} primaryColor={row.clubColors[0]} secondaryColor={row.clubColors[1]} className="w-8 h-8 shrink-0" imgClassName="w-full h-full object-contain" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-foreground truncate">{row.nickname ?? row.managerName}</div>
          <div className="text-sm text-muted-foreground truncate">{row.clubName}</div>
        </div>
        {betSlug && <Button className="h-9 shrink-0" onClick={() => openFriendBets(betSlug)}>{t("rivals.comps.bet")}</Button>}
      </div>
      {(row.table ?? []).length > 0 && (
        <div className="flex flex-col gap-1">
          <span className={LABEL}>{competitionName(row.leagueSlug, leagues, i18n.language)}</span>
          <ol className="m-0 p-0 list-none flex flex-col">
            {row.table!.map((r) => {
              const his = r.squadId === row.clubId;
              return (
                <li key={r.squadId} className={`flex items-center gap-3 px-2 py-1 rounded ${his ? "bg-primary/10" : ""}`}>
                  <span className="w-6 text-sm font-bold text-muted-foreground text-center tabular-nums">{r.position}</span>
                  <span className={`flex-1 min-w-0 truncate font-semibold ${his ? "text-primary" : "text-foreground"}`}>{r.name}</span>
                  <span className="font-black font-display text-primary tabular-nums">{r.points}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      {cups.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className={LABEL}>{t("rivals.comps.cups")}</span>
          {cups.map((c) => (
            <p key={c.slug} className="m-0 text-sm text-foreground">
              <span className="font-semibold">{competitionName(c.slug, leagues, i18n.language)}</span>
              <span className={c.state === "out" ? "text-muted-foreground" : ""}> · {rivalCompText(c, t, i18n.language)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Campeonatos dos amigos" on the League tab of a friends' world (tester report, 8.9.9). */
export function FriendCompetitions({ saveId, version }: { saveId: string; version: number }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<RivalRow[] | null>(null);
  useEffect(() => {
    let live = true;
    void rivalsApi.rivals(saveId).then((r) => { if (live && r.ok) setRows(r.data.rows); });
    return () => { live = false; };
  }, [saveId, version]);
  const friends = (rows ?? []).filter((r) => !r.me && r.clubId);
  if (friends.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display font-black uppercase text-xl leading-none m-0">{t("rivals.comps.title")}</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {friends.map((r) => <FriendCard key={r.seatId} row={r} />)}
      </div>
    </section>
  );
}
