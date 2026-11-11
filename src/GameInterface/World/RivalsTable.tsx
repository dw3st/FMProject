import { useTableSort } from "@/GameInterface/ui/tableSort";
import { rivalNation, rivalNextOpponent } from "@/GameInterface/World/rivalNext";
import { useTranslation } from "react-i18next";
import {
  ClubCell, CrestCell, NameCell, NumberCell, RankCell, StatsCell, StatsHead, StatsRow, StatsTable,
} from "@/GameInterface/Components/StatsTable";
import { ManagerFaceImage } from "@/GameInterface/Components/PersonFace";
import { formatDay } from "@/GameInterface/Dashboard/HomeCards";
import { RivalForm } from "@/GameInterface/World/RivalForm";
import { liveText } from "@/GameInterface/World/liveText";
import { seatManagerId } from "@/Domain/seats/seats";
import { managerFaceCountry } from "@/Domain/faces/managerFace";
import { scoreLineOf } from "@/Domain/rivals/results";
import type { RivalRow } from "@/types/rivalsTypes";

/** One row per friend (rivals, multiplayer part 6); a click opens the friend's results. */
export function RivalsTable({ rows, onSelect, selected }: { rows: RivalRow[]; onSelect: (seatId: string) => void; selected?: string | null }) {
  const { t, i18n } = useTranslation();
  const { sorted, head } = useTableSort(rows, {
    rank: (r) => -r.friendsRank, manager: (r) => r.nickname ?? r.managerName, club: (r) => r.clubName,
    position: (r) => (r.leaguePosition ? -r.leaguePosition : null),
    form: (r) => (r.form.length ? r.form.reduce((a, f) => a + (f === "W" ? 3 : f === "D" ? 1 : 0), 0) : null),
    next: (r) => (r.next ? r.next.date : null), bets: (r) => r.bets.open,
  });
  if (rows.length === 0) return <p className="text-sm text-muted-foreground m-0">{t("rivals.noRivals")}</p>;
  return (
    <StatsTable
      head={
        <>
          <StatsHead align="center" sort={head("rank")}>{t("rivals.col.rank")}</StatsHead>
          <StatsHead><span className="sr-only">{t("world.members.manager")}</span></StatsHead>
          <StatsHead sort={head("manager")}>{t("world.members.manager")}</StatsHead>
          <StatsHead><span className="sr-only">{t("world.members.club")}</span></StatsHead>
          <StatsHead sort={head("club")}>{t("world.members.club")}</StatsHead>
          <StatsHead align="center" sort={head("position")}>{t("rivals.col.position")}</StatsHead>
          <StatsHead sort={head("form")}>{t("rivals.col.form")}</StatsHead>
          <StatsHead>{t("rivals.col.last")}</StatsHead>
          <StatsHead sort={head("next")}>{t("rivals.col.next")}</StatsHead>
          <StatsHead>{t("rivals.col.live")}</StatsHead>
          <StatsHead align="center" sort={head("bets")}>{t("rivals.col.bets")}</StatsHead>
        </>
      }
    >
      {sorted.map((r) => (
        <StatsRow key={r.seatId} highlight={r.me || r.seatId === selected} onActivate={() => onSelect(r.seatId)}>
          <RankCell rank={r.friendsRank} />
          <StatsCell className="w-12">
            <ManagerFaceImage
              manager={{ id: seatManagerId(r.seatId), name: r.managerName, face: r.face, nationality: managerFaceCountry(r.nationalityIso) }}
              clubColors={r.clubColors}
              size={32}
            />
          </StatsCell>
          <NameCell highlight={r.me}>
            <span className="flex flex-col min-w-0">
              <span className="truncate">{r.nickname ?? r.managerName}</span>
              {r.nickname && <span className="text-sm font-normal text-muted-foreground truncate">{r.managerName}</span>}
            </span>
          </NameCell>
          <CrestCell squadId={r.clubId || null} />
          <ClubCell>{[r.clubId ? r.clubName : t("world.members.unemployed"), rivalNation(r.nationalTeam, i18n.language, t)].filter(Boolean).join(" · ")}</ClubCell>
          <NumberCell>{r.leaguePosition ? t("rivals.positionValue", { position: r.leaguePosition }) : "—"}</NumberCell>
          <StatsCell><RivalForm form={r.form} /></StatsCell>
          <StatsCell>
            <span className="text-sm tabular-nums">{r.last ? scoreLineOf(r.last) : "—"}</span>
          </StatsCell>
          <StatsCell>
            <span className="text-sm tabular-nums">
              {r.next ? t("rivals.nextValue", { date: formatDay(r.next.date, i18n.language), opponent: rivalNextOpponent(r.next, i18n.language, t) }) : "—"}
            </span>
          </StatsCell>
          <StatsCell>
            {r.live
              ? <span className="text-sm tabular-nums text-primary">{liveText(t, r.live)}</span>
              : <span className="text-sm text-muted-foreground">—</span>}
          </StatsCell>
          <NumberCell>{r.bets.open > 0 ? t("rivals.bets.openCount", { count: r.bets.open }) : "—"}</NumberCell>
        </StatsRow>
      ))}
    </StatsTable>
  );
}
