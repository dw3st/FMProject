import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { StatsCell, StatsHead, StatsRow, StatsTable, NumberCell } from "@/GameInterface/Components/StatsTable";
import { TABLE_CELL, TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import { useTableSort } from "@/GameInterface/ui/tableSort";
import { getDetailedPositionColor, positionLabel } from "@/GameInterface/positionHelpers";
import type { GrowthPhase } from "@/Domain/development/developmentFactors";

export interface SquadDevRow {
  id: string;
  name: string;
  /** Detailed natural position (GK, CB, ST…). */
  position: string;
  /** Pitch order (from `compareSquadPositions`), for the default order and the position sort. */
  order: number;
  age: number;
  /** OVR on the 0..100 display scale. */
  ovr: number;
  /** OVR change over the last 4 weeks, display scale; null without history. */
  change: number | null;
  phase: GrowthPhase;
  /** Name of the main growth factor, or "" when every factor is neutral. */
  main: string;
}

const PHASE_TONE: Record<GrowthPhase, string> = {
  growing: "text-chart-2",
  peak: "text-chart-4",
  declining: "text-destructive",
};
const PHASE_ORDER: Record<GrowthPhase, number> = { growing: 0, peak: 1, declining: 2 };

export function SquadDevelopmentTable({ rows, selectedId, onSelect }: {
  rows: readonly SquadDevRow[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const k = "developmentScreen.squadView";
  const { sorted, head } = useTableSort(rows, {
    name: (r) => r.name,
    position: (r) => -r.order,
    age: (r) => r.age,
    ovr: (r) => r.ovr,
    change: (r) => r.change,
    phase: (r) => -PHASE_ORDER[r.phase],
    main: (r) => r.main || null,
  });

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon name="users" className="w-5 h-5 text-primary" />
        <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t(`${k}.title`)}</h3>
      </div>
      <StatsTable
        head={
          <>
            <StatsHead sort={head("name")}>{t(`${k}.player`)}</StatsHead>
            <StatsHead align="center" sort={head("position")}>{t(`${k}.position`)}</StatsHead>
            <StatsHead align="center" sort={head("age")}>{t(`${k}.age`)}</StatsHead>
            <StatsHead align="center" sort={head("ovr")}>{t(`${k}.ovr`)}</StatsHead>
            <StatsHead align="center" sort={head("change")}>{t(`${k}.change`)}</StatsHead>
            <StatsHead sort={head("phase")}>{t(`${k}.phase`)}</StatsHead>
            <StatsHead className="phone:hidden" sort={head("main")}>{t(`${k}.main`)}</StatsHead>
          </>
        }
      >
        {sorted.map((r) => (
          <StatsRow key={r.id} highlight={r.id === selectedId} onActivate={() => onSelect(r.id)}>
            <td className={`${TABLE_CELL.body} max-w-[14rem]`}>
              <span className={`truncate block ${r.id === selectedId ? TABLE_STYLE.nameHighlight : TABLE_STYLE.name}`}>{r.name}</span>
            </td>
            <StatsCell align="center" className={`font-bold ${getDetailedPositionColor(r.position)}`}>
              {positionLabel(t, r.position, r.position)}
            </StatsCell>
            <NumberCell>{r.age}</NumberCell>
            <NumberCell strong>{r.ovr}</NumberCell>
            <StatsCell align="center" className="tabular-nums font-semibold">
              {r.change === null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <span className={r.change > 0 ? "text-chart-2" : r.change < 0 ? "text-destructive" : "text-muted-foreground"}>
                  {r.change > 0 ? `+${r.change}` : r.change < 0 ? `−${Math.abs(r.change)}` : "0"}
                </span>
              )}
            </StatsCell>
            <StatsCell className={`text-sm font-semibold ${PHASE_TONE[r.phase]}`}>{t(`${k}.phases.${r.phase}`)}</StatsCell>
            <StatsCell className="text-sm text-muted-foreground phone:hidden">{r.main || "—"}</StatsCell>
          </StatsRow>
        ))}
      </StatsTable>
    </div>
  );
}
