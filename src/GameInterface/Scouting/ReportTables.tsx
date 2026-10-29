import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { TABLE_CELL, TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import { Button } from "@/GameInterface/ui/Button";
import { Notice } from "@/GameInterface/ui/Notice";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { formatFee, formatWageShort } from "@/Domain/money";
import { positionLabel } from "@/GameInterface/positionHelpers";
import type { LeagueData } from "@/types/playerTypes";
import type { ScoutReport } from "@/types/scoutingTypes";
import { KnowledgeBar } from "@/GameInterface/Scouting/KnowledgeBar";
import { GemBadge, GradeBadge } from "@/GameInterface/Scouting/Badges";
import { ShortlistStar } from "@/GameInterface/Scouting/ShortlistStar";
import { playerHref, scoutingCall, type ScoutingData } from "@/GameInterface/Scouting/scoutingApi";
import { targetLabel } from "@/GameInterface/Scouting/scoutingText";
import { RECOMMENDATION_ORIGIN } from "@/types/scoutingTypes";
import { Chip } from "@/GameInterface/ui/Chip";
import { Icon } from "@/GameInterface/Icons";
import {
  REPORT_GRADES, defaultDir, filterReports, sortReports, type ReportSortKey, type SortDir,
} from "@/Domain/scouting/reportView";
import type { ScoutGrade } from "@/types/scoutingTypes";

function SortHead({ col, label, sort, dir, onSort }: {
  col: ReportSortKey; label: string; sort: ReportSortKey; dir: SortDir; onSort: (col: ReportSortKey) => void;
}) {
  const active = sort === col;
  return (
    <th className={`${TABLE_CELL.head} text-left`} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 bg-transparent border-0 p-0 cursor-pointer font-display font-bold uppercase tracking-[0.08em] text-[13px] hover:text-primary transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}
      >
        {label}
        {active && <Icon name={dir === "asc" ? "chevron-up" : "chevron-down"} size={16} className="text-primary" />}
      </button>
    </th>
  );
}

const range = (r: [number, number], scale = 10) =>
  r[0] === r[1] ? `${Math.round(r[0] * scale)}` : `${Math.round(r[0] * scale)}–${Math.round(r[1] * scale)}`;
const money = (r: [number, number]) => {
  const f = (v: number) => (v >= 100 ? `${Math.round(v)}` : v.toFixed(1));
  return r[0] === r[1] ? `${f(r[0])}M` : `${f(r[0])}–${f(r[1])}M`;
};

function ReportsTable({ reports, saveId, shortlisted, onShortlist, sort }: {
  reports: ScoutReport[];
  saveId: string;
  shortlisted: Set<string>;
  onShortlist: () => void;
  /** Sortable headers (the reports tab); absent = fixed headers. */
  sort?: { key: ReportSortKey; dir: SortDir; onSort: (col: ReportSortKey) => void };
}) {
  const { t } = useTranslation();
  const th = `${TABLE_CELL.head} text-left`;
  const td = TABLE_CELL.body;
  const head = (col: ReportSortKey, label: string) => sort
    ? <SortHead col={col} label={label} sort={sort.key} dir={sort.dir} onSort={sort.onSort} />
    : <th className={th}>{label}</th>;
  return (
    <div className={`${TABLE_STYLE.shell} overflow-x-auto`}>
      <table className="w-full text-sm border-collapse tabular-nums">
        <thead className={TABLE_STYLE.head}>
          <tr>
            {head("grade", t("scouting.col.grade"))}
            <th className={th}>{t("scouting.col.player")}</th>
            {head("age", t("scouting.col.age"))}
            <th className={th}>{t("scouting.col.club")}</th>
            {head("overall", t("scouting.col.overall"))}
            {head("potential", t("scouting.col.potential"))}
            {head("value", t("scouting.col.value"))}
            {head("wage", t("scouting.col.wage"))}
            {head("knowledge", t("scouting.knowledge"))}
            <th className={th}>{t("scouting.col.verdict")}</th>
          </tr>
        </thead>
        <tbody className={TABLE_STYLE.body}>
          {reports.map((r) => (
            <tr key={r.id} className={TABLE_STYLE.row}>
              <td className={td}><GradeBadge grade={r.grade} /></td>
              <td className={td}>
                <span className="inline-flex items-center gap-1">
                  {!r.prospectId && (
                    <ShortlistStar saveId={saveId} playerId={r.playerId} squadId={r.squadId} on={shortlisted.has(r.playerId)} onChange={onShortlist} />
                  )}
                  {r.prospectId || !r.squadId || r.gone ? (
                    <span className={`${TABLE_STYLE.name} text-base`}>{r.name}</span>
                  ) : (
                    <a href={playerHref(r.playerId, r.squadId, r.league)} className={`${TABLE_STYLE.name} text-base no-underline hover:text-primary`}>{r.name}</a>
                  )}
                  {r.gem && <GemBadge />}
                  {r.gone && <span className="text-sm text-muted-foreground">{t("scouting.reports.moved")}</span>}
                </span>
                <span className="block text-sm text-muted-foreground">{positionLabel(t, r.position, r.position)}{r.forSale ? ` · ${t("scouting.forSale")}` : ""}</span>
              </td>
              <td className={`${td} text-muted-foreground`}>{r.age}</td>
              <td className={`${td} text-muted-foreground`}>{r.prospectId ? t("scouting.noClubProspect", { country: r.country }) : r.club}</td>
              <td className={`${td} font-display font-bold text-primary`}>{range(r.overall)}</td>
              <td className={`${td} text-muted-foreground`}>{range(r.potential)}</td>
              <td className={`${td} text-muted-foreground`}>{money(r.value)}</td>
              <td className={`${td} text-muted-foreground`}>{formatWageShort(r.wageDemand)}</td>
              <td className={td}><KnowledgeBar value={r.k} /></td>
              <td className={`${td} text-muted-foreground`}>{t(`scouting.text.${r.text}`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReportsTab({ saveId, data, leagues, onChanged }: { saveId: string; data: ScoutingData; leagues: LeagueData[]; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const [mission, setMission] = useState("all");
  const shortlisted = useMemo(() => new Set(data.shortlist.map((e) => e.playerId)), [data.shortlist]);
  const missionOptions = useMemo(() => {
    const ids = [...new Set(data.reports.map((r) => r.missionId).filter((x): x is string => !!x))];
    const label = (id: string) => {
      if (id === RECOMMENDATION_ORIGIN) return t("scouting.recommendationReports");
      const m = data.missions.find((x) => x.id === id);
      return m ? `${t(`scouting.kind.${m.target.kind}`)} · ${targetLabel(m.target, t, leagues, i18n.language)}` : t("scouting.finishedMission");
    };
    return [{ value: "all", label: t("scouting.allMissions") }, ...ids.map((id) => ({ value: id, label: label(id) }))];
  }, [data, leagues, t, i18n.language]);
  const scoutOptions = useMemo(() => [
    { value: "all", label: t("scouting.allScouts") },
    ...data.scouts.filter((s) => !s.vacant).map((s) => ({ value: s.id, label: s.chief ? t("scouting.chiefNamed", { name: s.name }) : s.name })),
  ], [data.scouts, t]);
  const [scout, setScout] = useState("all");
  const [grades, setGrades] = useState<ScoutGrade[]>([]);
  const [sortKey, setSortKey] = useState<ReportSortKey>("grade");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const onSort = (col: ReportSortKey) => {
    if (col === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(col); setSortDir(defaultDir(col)); }
  };
  const toggleGrade = (g: ScoutGrade) => setGrades(grades.includes(g) ? grades.filter((x) => x !== g) : [...grades, g]);
  // One row per player (the newest report): several scouts often report the same player (report).
  const rows = useMemo(
    () => sortReports(filterReports(data.reports, { mission, scout, grades }, data.missions), sortKey, sortDir),
    [data.reports, data.missions, mission, scout, grades, sortKey, sortDir],
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-full sm:w-72">
          <SelectCombobox label={t("scouting.mission")} value={mission} onChange={setMission} options={missionOptions} />
        </div>
        <div className="w-full sm:w-64">
          <SelectCombobox label={t("scouting.scout")} value={scout} onChange={setScout} options={scoutOptions} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t("scouting.col.grade")}</span>
          <div className="flex gap-1.5">
            {REPORT_GRADES.map((g) => (
              <Chip key={g} selected={grades.includes(g)} onClick={() => toggleGrade(g)} aria-pressed={grades.includes(g)}>{g}</Chip>
            ))}
          </div>
        </div>
      </div>
      {rows.length === 0
        ? <p className="text-sm text-muted-foreground m-0">{t("scouting.noReports")}</p>
        : <ReportsTable reports={rows} saveId={saveId} shortlisted={shortlisted} onShortlist={onChanged}
            sort={{ key: sortKey, dir: sortDir, onSort }} />}
    </div>
  );
}

export function ShortlistTab({ saveId, data, onChanged }: { saveId: string; data: ScoutingData; onChanged: () => void }) {
  const { t } = useTranslation();
  const th = `${TABLE_CELL.head} text-left`;
  const td = TABLE_CELL.body;
  async function saveNote(playerId: string, squadId: string, note: string) {
    await scoutingCall(`/api/saves/${saveId}/scouting/shortlist`, "POST", { playerId, squadId, note });
    onChanged();
  }
  if (data.shortlist.length === 0) return <p className="text-sm text-muted-foreground m-0">{t("scouting.shortlist.empty")}</p>;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground m-0 tabular-nums">{t("scouting.shortlist.count", { count: data.shortlist.length, max: data.maxShortlist })}</p>
      <div className={`${TABLE_STYLE.shell} overflow-x-auto`}>
        <table className="w-full text-sm border-collapse tabular-nums">
          <thead className={TABLE_STYLE.head}>
            <tr>
              <th className={th}>{t("scouting.col.player")}</th>
              <th className={th}>{t("scouting.col.club")}</th>
              <th className={th}>{t("scouting.col.overall")}</th>
              <th className={th}>{t("scouting.knowledge")}</th>
              <th className={th}>{t("scouting.col.status")}</th>
              <th className={th}>{t("scouting.col.note")}</th>
            </tr>
          </thead>
          <tbody className={TABLE_STYLE.body}>
            {data.shortlist.map((e) => {
              const status = [
                e.free ? t("scouting.status.free") : null,
                e.forSale ? t("scouting.forSale") : null,
                e.contractEnding ? t("scouting.status.contractEnding", { year: (e.contractUntil ?? "").slice(0, 4) }) : null,
                e.injured ? t("scouting.status.injured") : null,
              ].filter(Boolean).join(" · ");
              return (
                <tr key={e.playerId} className={TABLE_STYLE.row}>
                  <td className={td}>
                    <span className="inline-flex items-center gap-1">
                      <ShortlistStar saveId={saveId} playerId={e.playerId} squadId={e.squadId} on onChange={onChanged} />
                      {e.squadId ? (
                        <a href={playerHref(e.playerId, e.squadId, e.leagueSlug)} className={`${TABLE_STYLE.name} text-base no-underline hover:text-primary`}>{e.name}</a>
                      ) : (
                        <span className={`${TABLE_STYLE.name} text-base`}>{e.name}</span>
                      )}
                    </span>
                    {e.position && <span className="block text-sm text-muted-foreground">{positionLabel(t, e.position, e.position)} · {e.age}</span>}
                  </td>
                  <td className={`${td} text-muted-foreground`}>{e.missing ? "—" : e.club || t("scouting.status.free")}</td>
                  <td className={`${td} font-display font-bold text-primary`}>{e.overall ? range(e.overall) : "—"}</td>
                  <td className={td}>{e.knowledge !== undefined ? <KnowledgeBar value={e.knowledge} /> : "—"}</td>
                  <td className={`${td} text-muted-foreground`}>{status || "—"}</td>
                  <td className={td}>
                    <input
                      defaultValue={e.note ?? ""}
                      maxLength={200}
                      aria-label={t("scouting.col.note")}
                      placeholder={t("scouting.notePlaceholder")}
                      onBlur={(ev) => { if (ev.target.value !== (e.note ?? "")) void saveNote(e.playerId, e.squadId, ev.target.value); }}
                      className="h-8 w-full min-w-40 bg-transparent border-0 border-b border-border focus:border-primary outline-none text-sm"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function GemsTab({ saveId, data, onChanged }: { saveId: string; data: ScoutingData; onChanged: (next?: ScoutingData) => void }) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const shortlisted = useMemo(() => new Set(data.shortlist.map((e) => e.playerId)), [data.shortlist]);
  // One row per player: several scouts (and weeks) often report the same gem.
  const gems = filterReports(data.reports.filter((r) => r.gem && !r.prospectId), { mission: "all", scout: "all", grades: [] }, data.missions)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const reportOf = new Map(data.reports.map((r) => [r.id, r]));
  async function sign(id: string) {
    setError(null);
    const r = await scoutingCall(`/api/saves/${saveId}/scouting/prospects/${encodeURIComponent(id)}/sign`, "POST");
    if (r.ok) onChanged(r.json as ScoutingData);
    else setError(t(`scouting.errors.${r.json?.error ?? "generic"}`, { defaultValue: t("scouting.errors.generic") }));
  }
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <SectionTitle>{t("scouting.prospects.title")}</SectionTitle>
        <p className="text-sm text-muted-foreground m-0">{t("scouting.prospects.hint")}</p>
        {error && <Notice kind="error">{error}</Notice>}
        {data.prospects.length === 0 ? (
          <p className="text-sm text-muted-foreground m-0">{t("scouting.prospects.empty")}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.prospects.map((p) => {
              const rep = reportOf.get(p.reportId);
              return (
                <div key={p.player.id} className="rounded-md border border-border bg-card p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-display font-black uppercase text-base leading-none m-0 truncate">{p.player.name}</p>
                      <p className="text-sm text-muted-foreground m-0 mt-1">
                        {positionLabel(t, p.player.positions[0], p.player.positions[0] ?? "")} · {p.player.age} · {p.country}
                      </p>
                    </div>
                    {rep && <GradeBadge grade={rep.grade} />}
                  </div>
                  {rep && (
                    <p className="text-sm text-foreground m-0 tabular-nums">
                      {t("scouting.col.overall")}: {range(rep.overall)} · {t("scouting.col.potential")}: {range(rep.potential)}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground m-0 tabular-nums">
                    {t("scouting.prospects.fee", { fee: formatFee(p.fee) })} · {t("scouting.prospects.until", { date: p.expires })}
                  </p>
                  <Button onClick={() => void sign(p.player.id)} disabled={!data.employed || p.expires < data.date} className="self-start">
                    {t("scouting.prospects.sign")}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <section className="flex flex-col gap-3">
        <SectionTitle>{t("scouting.gems.title")}</SectionTitle>
        {gems.length === 0
          ? <p className="text-sm text-muted-foreground m-0">{t("scouting.gems.empty")}</p>
          : <ReportsTable reports={gems} saveId={saveId} shortlisted={shortlisted} onShortlist={() => onChanged()} />}
      </section>
    </div>
  );
}
