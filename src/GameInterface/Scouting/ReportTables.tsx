import { useMemo, useState } from "react";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { AvailabilityChips } from "@/GameInterface/Scout/AvailabilityChips";
import { useTranslation } from "react-i18next";
import { TABLE_CELL, TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import { Button } from "@/GameInterface/ui/Button";
import { Notice } from "@/GameInterface/ui/Notice";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { formatFee, formatWageShort } from "@/Domain/money";
import { positionLabel, positionLabelColor } from "@/GameInterface/positionHelpers";
import { AvgBadge } from "@/GameInterface/Components/AvgBadge";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { ClubLink } from "@/GameInterface/Components/EntityLinks";
import { Flag } from "@/GameInterface/Components/Flag";
import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";
import { ratingTextClass10 } from "@/GameInterface/scoreColors";
import type { LeagueData } from "@/types/playerTypes";
import type { ScoutReport } from "@/types/scoutingTypes";
import { KnowledgeBar } from "@/GameInterface/Scouting/KnowledgeBar";
import { GemBadge, GradeBadge } from "@/GameInterface/Scouting/Badges";
import { ShortlistStar } from "@/GameInterface/Scouting/ShortlistStar";
import { useScoutHoverCard } from "@/GameInterface/Scout/useScoutHoverCard";
import { playerHref, scoutingCall, type ScoutingData } from "@/GameInterface/Scouting/scoutingApi";
import { targetLabel } from "@/GameInterface/Scouting/scoutingText";
import { RECOMMENDATION_ORIGIN } from "@/types/scoutingTypes";
import { Chip } from "@/GameInterface/ui/Chip";
import { Label } from "@/GameInterface/ui/Label";
import { Icon } from "@/GameInterface/Icons";
import {
  REPORT_GRADES, defaultDir, filterReports, sortReports, type ReportSortKey, type SortDir,
} from "@/Domain/scouting/reportView";
import type { ScoutGrade } from "@/types/scoutingTypes";
import { SortButton } from "@/GameInterface/ui/SortButton";
import { useTableSort } from "@/GameInterface/ui/tableSort";

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

/** Level badge of a seen range, as in the scout search (one number when the scouts know him well). */
function LevelBadge({ range: r }: { range: [number, number] }) {
  const mid = (r[0] + r[1]) / 2;
  return r[0] === r[1] ? <AvgBadge value={mid} /> : <AvgBadge value={mid} range={r} />;
}

/** Flag of a nationality written as in the data; nothing when unknown. */
function NationFlag({ nationality }: { nationality?: string | undefined }) {
  const code = nationality ? nationalityFlagCode(nationality) : null;
  return code ? <span title={nationality} className="shrink-0 inline-flex"><Flag code={code} /></span> : null;
}

/** Crest and name of a club, the name opening the club (the scout search's club cell). */
function ClubCell({ squadId, league, name }: { squadId: string; league?: string | undefined; name: string }) {
  return (
    <span className="flex items-center gap-2 min-w-0">
      <ClubLogo logoUrl={squadLogoUrl(squadId)} className="w-8 h-8 shrink-0" imgClassName="w-full h-full object-contain" />
      <ClubLink id={squadId} league={league ?? null} className="truncate text-foreground font-medium">{name}</ClubLink>
    </span>
  );
}

const NO_PROSPECTS = new Set<string>();

function ReportsTable({ reports, saveId, shortlisted, onShortlist, openProspects, sort }: {
  reports: ScoutReport[];
  saveId: string;
  shortlisted: Set<string>;
  onShortlist: () => void;
  /** Clubless youngsters still on offer: their rows say where to sign them (they cannot be watched). */
  openProspects: Set<string>;
  /** Sortable headers (the reports tab); absent = fixed headers. */
  sort?: { key: ReportSortKey; dir: SortDir; onSort: (col: ReportSortKey) => void };
}) {
  const { t } = useTranslation();
  const th = `${TABLE_CELL.head} text-left`;
  const td = TABLE_CELL.body;
  const head = (col: ReportSortKey, label: string) => sort
    ? <SortHead col={col} label={label} sort={sort.key} dir={sort.dir} onSort={sort.onSort} />
    : <th className={th}>{label}</th>;
  // The search's player card on the name (tester report, 10.4.2).
  const hoverCard = useScoutHoverCard(saveId);
  return (
    <div className={`${TABLE_STYLE.shell} overflow-x-auto`}>
      <table className="w-full text-sm border-collapse tabular-nums">
        <thead className={TABLE_STYLE.head}>
          <tr>
            <th className={th}>{t("scout.table.columns.pos")}</th>
            <th className={th}>{t("scouting.col.player")}</th>
            {head("age", t("scouting.col.age"))}
            <th className={th}>{t("scouting.col.club")}</th>
            {head("grade", t("scouting.col.grade"))}
            {head("overall", t("scouting.col.overall"))}
            {head("potential", t("scouting.col.potential"))}
            {head("knowledge", t("scouting.knowledge"))}
            {head("wage", t("scouting.col.wage"))}
            {head("value", t("scouting.col.value"))}
            <th className={th}>{t("scouting.col.verdict")}</th>
          </tr>
        </thead>
        <tbody className={TABLE_STYLE.body}>
          {reports.map((r) => (
            <tr key={r.id} className={TABLE_STYLE.row}>
              <td className={`${td} font-black ${positionLabelColor(r.position, r.position)}`}>{positionLabel(t, r.position, r.position)}</td>
              <td className={td}>
                <span className="flex items-center gap-1.5 min-w-0 whitespace-nowrap">
                  {r.prospectId ? (
                    // A clubless youngster is not in the world yet: no watch list, he is signed in the Gems tab.
                    <span className="inline-block w-8 shrink-0" aria-hidden />
                  ) : (
                    <ShortlistStar saveId={saveId} playerId={r.playerId} squadId={r.squadId} on={shortlisted.has(r.playerId)} onChange={onShortlist} />
                  )}
                  <NationFlag nationality={r.nationality} />
                  {r.prospectId || !r.squadId || r.gone ? (
                    <span className="font-semibold text-foreground">{r.name}</span>
                  ) : (
                    <a href={playerHref(r.playerId, r.squadId, r.league)} {...hoverCard.hoverProps(r.playerId)} className="font-semibold text-foreground no-underline hover:text-primary hover:underline">{r.name}</a>
                  )}
                  {r.gem && <GemBadge />}
                  {r.gone && <span className="text-sm text-muted-foreground">{t("scouting.reports.moved")}</span>}
                  {!r.prospectId && r.availability && <AvailabilityChips inline value={r.availability} />}
                  {r.prospectId && (openProspects.has(r.prospectId) ? (
                    <a href="/scout?tab=gems" title={t("scouting.reports.prospectNoStar")}
                      className="rounded border border-star-green/50 px-1.5 py-0.5 text-sm font-semibold leading-none text-star-green no-underline hover:bg-star-green/10">
                      {t("scouting.reports.prospectSign")}
                    </a>
                  ) : (
                    <span className="text-sm text-muted-foreground">{t("scouting.reports.prospectGone")}</span>
                  ))}
                </span>
              </td>
              <td className={`${td} text-muted-foreground font-medium`}>{r.age}</td>
              <td className={td}>
                {r.prospectId || !r.squadId
                  ? <span className="text-muted-foreground">{r.prospectId ? t("scouting.noClubProspect", { country: r.country }) : r.club}</span>
                  : <ClubCell squadId={r.squadId} league={r.league} name={r.club} />}
              </td>
              <td className={td}><GradeBadge grade={r.grade} /></td>
              <td className={td}><LevelBadge range={r.overall} /></td>
              <td className={`${td} text-muted-foreground font-medium`}>{range(r.potential)}</td>
              <td className={td}><KnowledgeBar value={r.k} /></td>
              <td className={`${td} whitespace-nowrap text-muted-foreground font-medium`}>{formatWageShort(r.wageDemand)}</td>
              <td className={`${td} whitespace-nowrap font-bold ${ratingTextClass10((r.overall[0] + r.overall[1]) / 2)}`}>{money(r.value)}</td>
              <td className={`${td} text-muted-foreground`}>{t(`scouting.text.${r.text}`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {hoverCard.card}
    </div>
  );
}

export function ReportsTab({ saveId, data, leagues, onChanged }: { saveId: string; data: ScoutingData; leagues: LeagueData[]; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const [mission, setMission] = useState("all");
  const shortlisted = useMemo(() => new Set(data.shortlist.map((e) => e.playerId)), [data.shortlist]);
  const openProspects = useMemo(
    () => new Set(data.prospects.filter((p) => p.expires >= data.date).map((p) => p.player.id)),
    [data.prospects, data.date],
  );
  const missionOptions = useMemo(() => {
    const ids = [...new Set([...data.reports.map((r) => r.missionId), ...data.missions.map((m) => m.id)].filter((x): x is string => !!x))];
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
      {data.missions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label>{t("scouting.reports.onMission")}</Label>
          <div className="flex flex-wrap gap-1.5">
            {data.missions.map((m) => (
              <Chip
                key={m.id}
                selected={mission === m.id}
                aria-pressed={mission === m.id}
                onClick={() => setMission(mission === m.id ? "all" : m.id)}
                title={m.byChief ? t("scouting.chiefPlans.byChief") : undefined}
              >
                {t("scouting.reports.missionChip", {
                  scout: data.scouts.find((s) => s.id === m.scoutId)?.name ?? "",
                  target: targetLabel(m.target, t, leagues, i18n.language),
                  done: m.weeksDone,
                  total: m.weeks,
                })}
              </Chip>
            ))}
          </div>
        </div>
      )}
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
        : <ReportsTable reports={rows} saveId={saveId} shortlisted={shortlisted} onShortlist={onChanged} openProspects={openProspects}
            sort={{ key: sortKey, dir: sortDir, onSort }} />}
    </div>
  );
}

export function ShortlistTab({ saveId, data, onChanged }: { saveId: string; data: ScoutingData; onChanged: () => void }) {
  const { t } = useTranslation();
  const th = `${TABLE_CELL.head} text-left`;
  const td = TABLE_CELL.body;
  const hoverCard = useScoutHoverCard(saveId);
  type Row = ScoutingData["shortlist"][number];
  const midOf = (r?: [number, number]) => (r ? (r[0] + r[1]) / 2 : null);
  // The order the list came in until a header is clicked.
  const { sorted, head } = useTableSort<Row>(data.shortlist, {
    player: (e) => e.name,
    age: (e) => e.age,
    club: (e) => e.club,
    overall: (e) => midOf(e.overall),
    knowledge: (e) => e.knowledge,
    value: (e) => midOf(e.value),
  });
  const sortTh = (key: string, label: string) => {
    const s = head(key);
    return (
      <th className={th} aria-sort={s?.active ? (s.dir === "asc" ? "ascending" : "descending") : "none"}>
        {s ? <SortButton sort={s}>{label}</SortButton> : label}
      </th>
    );
  };
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
              <th className={th}>{t("scout.table.columns.pos")}</th>
              {sortTh("player", t("scouting.col.player"))}
              {sortTh("age", t("scouting.col.age"))}
              {sortTh("club", t("scouting.col.club"))}
              {sortTh("overall", t("scouting.col.overall"))}
              {sortTh("knowledge", t("scouting.knowledge"))}
              {sortTh("value", t("scouting.col.value"))}
              <th className={th}>{t("scouting.col.status")}</th>
              <th className={th}>{t("scouting.col.note")}</th>
            </tr>
          </thead>
          <tbody className={TABLE_STYLE.body}>
            {sorted.map((e) => {
              const status = [
                e.free ? t("scouting.status.free") : null,
                e.contractEnding ? t("scouting.status.contractEnding", { year: (e.contractUntil ?? "").slice(0, 4) }) : null,
                e.injured ? t("scouting.status.injured") : null,
              ].filter(Boolean).join(" · ");
              return (
                <tr key={e.playerId} className={TABLE_STYLE.row}>
                  <td className={`${td} font-black ${e.position ? positionLabelColor(e.natural, e.position) : "text-muted-foreground"}`}>
                    {e.position ? positionLabel(t, e.natural, e.position) : "—"}
                  </td>
                  <td className={td}>
                    <span className="flex items-center gap-1.5 min-w-0 whitespace-nowrap">
                      <ShortlistStar saveId={saveId} playerId={e.playerId} squadId={e.squadId} on onChange={onChanged} />
                      <NationFlag nationality={e.nationality} />
                      {e.squadId ? (
                        <a href={playerHref(e.playerId, e.squadId, e.leagueSlug)} {...hoverCard.hoverProps(e.playerId)} className="font-semibold text-foreground no-underline hover:text-primary hover:underline">{e.name}</a>
                      ) : (
                        <span className="font-semibold text-foreground">{e.name}</span>
                      )}
                      {e.availability && <AvailabilityChips inline value={e.availability} />}
                    </span>
                  </td>
                  <td className={`${td} text-muted-foreground font-medium`}>{e.age ?? "—"}</td>
                  <td className={td}>
                    {e.missing || !e.club || !e.squadId
                      ? <span className="text-muted-foreground">{e.missing ? "—" : t("scouting.status.free")}</span>
                      : <ClubCell squadId={e.squadId} league={e.leagueSlug} name={e.club} />}
                  </td>
                  <td className={td}>{e.overall ? <LevelBadge range={e.overall} /> : "—"}</td>
                  <td className={td}>{e.knowledge !== undefined ? <KnowledgeBar value={e.knowledge} /> : "—"}</td>
                  <td className={`${td} whitespace-nowrap font-bold ${e.overall ? ratingTextClass10((e.overall[0] + e.overall[1]) / 2) : "text-muted-foreground"}`}>{e.value ? money(e.value) : "—"}</td>
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
      {hoverCard.card}
    </div>
  );
}

export function GemsTab({ saveId, data, onChanged }: { saveId: string; data: ScoutingData; onChanged: (next?: ScoutingData) => void }) {
  const { t } = useTranslation();
  const { session } = useGameSave();
  const [error, setError] = useState<string | null>(null);
  const [academyFull, setAcademyFull] = useState(false);
  const academyHref = session ? `/squad/${encodeURIComponent(session.leagueSlug)}/${encodeURIComponent(session.clubId)}?tab=youth` : null;
  const shortlisted = useMemo(() => new Set(data.shortlist.map((e) => e.playerId)), [data.shortlist]);
  // Newest first until a header is clicked (tester report, 10.7).
  const [sortKey, setSortKey] = useState<ReportSortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const onSort = (col: ReportSortKey) => {
    if (col === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(col); setSortDir(defaultDir(col)); }
  };
  // One row per player: several scouts (and weeks) often report the same gem.
  const gems = sortReports(
    filterReports(data.reports.filter((r) => r.gem && !r.prospectId), { mission: "all", scout: "all", grades: [] }, data.missions),
    sortKey, sortDir,
  );
  const reportOf = new Map(data.reports.map((r) => [r.id, r]));
  async function sign(id: string) {
    setError(null);
    setAcademyFull(false);
    const r = await scoutingCall(`/api/saves/${saveId}/scouting/prospects/${encodeURIComponent(id)}/sign`, "POST");
    if (r.ok) onChanged(r.json as ScoutingData);
    else setAcademyFull(r.json?.error === "youthFull");
    if (!r.ok) setError(t(`scouting.errors.${r.json?.error ?? "generic"}`, { defaultValue: t("scouting.errors.generic") }));
  }
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <SectionTitle>{t("scouting.prospects.title")}</SectionTitle>
        <p className="text-sm text-muted-foreground m-0">{t("scouting.prospects.hint")}</p>
        {error && <Notice kind="error">{error}</Notice>}
        {academyFull && academyHref && (
          <a href={academyHref} className="self-start inline-flex h-10 items-center rounded border border-border bg-card px-4 text-sm font-semibold text-foreground no-underline hover:bg-muted/50">
            {t("scouting.prospects.openAcademy")}
          </a>
        )}
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
          : <ReportsTable reports={gems} saveId={saveId} shortlisted={shortlisted} onShortlist={() => onChanged()} openProspects={NO_PROSPECTS}
              sort={{ key: sortKey, dir: sortDir, onSort }} />}
      </section>
    </div>
  );
}
