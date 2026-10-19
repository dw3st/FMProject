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
export function RivalsTable({ rows, onSelect }: { rows: RivalRow[]; onSelect: (seatId: string) => void }) {
  const { t, i18n } = useTranslation();
  if (rows.length === 0) return <p className="text-sm text-muted-foreground m-0">{t("rivals.noRivals")}</p>;
  return (
    <StatsTable
      head={
        <>
          <StatsHead align="center">{t("rivals.col.rank")}</StatsHead>
          <StatsHead><span className="sr-only">{t("world.members.manager")}</span></StatsHead>
          <StatsHead>{t("world.members.manager")}</StatsHead>
          <StatsHead><span className="sr-only">{t("world.members.club")}</span></StatsHead>
          <StatsHead>{t("world.members.club")}</StatsHead>
          <StatsHead align="center">{t("rivals.col.position")}</StatsHead>
          <StatsHead>{t("rivals.col.form")}</StatsHead>
          <StatsHead>{t("rivals.col.last")}</StatsHead>
          <StatsHead>{t("rivals.col.next")}</StatsHead>
          <StatsHead>{t("rivals.col.live")}</StatsHead>
        </>
      }
    >
      {rows.map((r) => (
        <StatsRow key={r.seatId} highlight={r.me} onActivate={() => onSelect(r.seatId)}>
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
          <ClubCell>{r.clubId ? r.clubName : t("world.members.unemployed")}</ClubCell>
          <NumberCell>{r.leaguePosition ? t("rivals.positionValue", { position: r.leaguePosition }) : "—"}</NumberCell>
          <StatsCell><RivalForm form={r.form} /></StatsCell>
          <StatsCell>
            <span className="text-sm tabular-nums">{r.last ? scoreLineOf(r.last) : "—"}</span>
          </StatsCell>
          <StatsCell>
            <span className="text-sm tabular-nums">
              {r.next ? t("rivals.nextValue", { date: formatDay(r.next.date, i18n.language), opponent: r.next.opponentName }) : "—"}
            </span>
          </StatsCell>
          <StatsCell>
            {r.live
              ? <span className="text-sm tabular-nums text-primary">{liveText(t, r.live)}</span>
              : <span className="text-sm text-muted-foreground">—</span>}
          </StatsCell>
        </StatsRow>
      ))}
    </StatsTable>
  );
}
