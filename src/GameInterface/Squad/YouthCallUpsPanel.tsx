import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { getDetailedPositionColor, positionLabel } from "@/GameInterface/positionHelpers";
import { Button } from "@/GameInterface/ui/Button";
import { Chip } from "@/GameInterface/ui/Chip";
import { Notice } from "@/GameInterface/ui/Notice";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { SortButton } from "@/GameInterface/ui/SortButton";
import { TickBox } from "@/GameInterface/ui/TickBox";
import { TABLE_CELL, TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import { useTableSort, type HeadSort, type SortAccessors } from "@/GameInterface/ui/tableSort";
import { Flag } from "@/GameInterface/Components/Flag";
import { PlayerNameLink } from "@/GameInterface/Inbox/PlayerNameText";
import { attrDisplay } from "@/Domain/attributes";
import { YOUTH_COMP } from "@/Domain/youthComps/youthCompConfig";
import { positionIndex } from "@/Domain/positions/positionSort";
import { nationalityDisplayName } from "@/Domain/world/labels";
import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";
import {
  CALL_UP_DURATIONS, CALL_UP_RULES, newCallUp, type CallUpDuration, type YouthCallUp,
} from "@/Domain/youthComps/callUps";
import type { YouthEligible, YouthNextGame } from "@/backend/youthCompRoutes";
import type { YouthCompAge } from "@/types/youthCompTypes";

interface CallUpsData {
  next: Partial<Record<YouthCompAge, YouthNextGame>>;
  callUps: Partial<Record<YouthCompAge, YouthCallUp[]>>;
  skipped: Partial<Record<YouthCompAge, { date: string; players: { id: string; name: string }[] }>>;
  eligible: Record<YouthCompAge, YouthEligible[]>;
}

const AGES: YouthCompAge[] = ["u21", "u19"];
/** The list opens on players up to this age (the under-21s may field anyone, so the whole club is eligible). */
const YOUNG_AGE = 21;

/** Toggles one player in a call-up list (added with `duration`), never past the cap. */
export function toggleCallUp(
  list: YouthCallUp[], id: string, duration: CallUpDuration, max: number = YOUTH_COMP.MAX_CALL_UPS,
): YouthCallUp[] {
  if (list.some((c) => c.id === id)) return list.filter((c) => c.id !== id);
  return list.length >= max ? list : [...list, newCallUp(id, duration)];
}

/** Gives every call-up of the list `duration` (one already on it keeps its progress). */
export function applyCallUpDuration(list: YouthCallUp[], duration: CallUpDuration): YouthCallUp[] {
  return list.map((c) => (c.duration === duration ? c : newCallUp(c.id, duration)));
}

/** What is left of a call-up, shown small next to its box: games left, "∞" or the rhythm streak. */
export function callUpLeftLabel(c: YouthCallUp, t: (key: string, o?: Record<string, unknown>) => string): string {
  if (c.duration === "indefinite") return "∞";
  if (c.duration === "rhythm") return t("youthComps.callUps.rhythmLeft", { n: c.streak ?? 0, of: CALL_UP_RULES.RHYTHM_GAMES });
  return String(c.left ?? CALL_UP_RULES.GAMES[c.duration] ?? 1);
}

/** The rows of the call-up table: everyone when `onlyYoung` is off, else the young ones plus whoever is called up. */
export function callUpRows(
  eligible: readonly YouthEligible[], onlyYoung: boolean, calledIds: ReadonlySet<string>, youngAge: number = YOUNG_AGE,
): YouthEligible[] {
  return eligible.filter((p) => !onlyYoung || p.age <= youngAge || calledIds.has(p.id));
}

const sameLists = (a: YouthCallUp[] = [], b: YouthCallUp[] = []) =>
  a.length === b.length && a.every((c, i) => c.id === b[i]!.id && c.duration === b[i]!.duration);
const ariaSort = (s: HeadSort) => (s.active ? (s.dir === "asc" ? "ascending" : "descending") : "none");
const NO_ROWS: YouthEligible[] = [];

/**
 * "Youth games" block of the Academy tab: one list of the club's players with a tick box per youth side (under-21,
 * under-19), the next game of each and the call-ups for it (tester report: one list instead of a chip grid per side).
 */
export function YouthCallUpsPanel() {
  const { t, i18n } = useTranslation();
  const { session } = useGameSave();
  const saveId = session?.saveId;
  const [data, setData] = useState<CallUpsData | null>(null);
  const [draft, setDraft] = useState<Partial<Record<YouthCompAge, YouthCallUp[]>>>({});
  const [stored, setStored] = useState<Partial<Record<YouthCompAge, YouthCallUp[]>>>({});
  const [duration, setDuration] = useState<CallUpDuration>("next");
  const [onlyYoung, setOnlyYoung] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    if (!saveId) return;
    fetch(`/api/saves/${saveId}/youth-callups`)
      .then((r) => (r.ok ? (r.json() as Promise<CallUpsData>) : Promise.reject(new Error("load"))))
      .then((d) => {
        setData(d);
        setDraft(d.callUps);
        setStored(d.callUps);
      })
      .catch(() => setFailed(true));
  }, [saveId]);
  useEffect(load, [load]);

  const ages = useMemo(() => (data ? AGES.filter((a) => data.next[a]) : []), [data]);
  const u19Ok = useMemo(() => new Set((data?.eligible.u19 ?? []).map((p) => p.id)), [data]);
  const calledIds = useMemo(() => new Set(AGES.flatMap((a) => (draft[a] ?? []).map((c) => c.id))), [draft]);
  const rows = useMemo(() => callUpRows(data?.eligible.u21 ?? NO_ROWS, onlyYoung, calledIds), [data, onlyYoung, calledIds]);
  const isCalled = (age: YouthCompAge, id: string) => (draft[age] ?? []).some((c) => c.id === id);
  const accessors: SortAccessors<YouthEligible> = {
    pos: (p) => positionIndex(p.role), player: (p) => p.name, age: (p) => p.age,
    nation: (p) => (p.nationality ? nationalityDisplayName(p.nationality, i18n.language, t) : null),
    ovr: (p) => p.overall, fitness: (p) => p.fitness,
    u21: (p) => (isCalled("u21", p.id) ? 1 : 0), u19: (p) => (isCalled("u19", p.id) ? 1 : 0),
  };
  const { sorted, head } = useTableSort(rows, accessors, { key: "pos", dir: "asc" });

  async function save() {
    if (!saveId || ages.length === 0) return;
    setSaving(true);
    setSaved(false);
    setFailed(false);
    try {
      const res = await fetch(`/api/saves/${saveId}/youth-callups`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(ages.map((a) => [a, (draft[a] ?? []).map((c) => ({ id: c.id, duration: c.duration }))]))),
      });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const body = (await res.json()) as { callUps: Partial<Record<YouthCompAge, YouthCallUp[]>> };
      setDraft(body.callUps);
      setStored(body.callUps);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (failed && !data) return <Notice kind="error">{t("warnings.errors.loadFailed")}</Notice>;
  if (!data) return <p className="text-sm text-muted-foreground m-0">{t("youth.loading")}</p>;
  const skippedAges = AGES.filter((a) => (data.skipped[a]?.players.length ?? 0) > 0);
  if (ages.length === 0 && skippedAges.length === 0) return null;
  const fmt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(i18n.language, { day: "numeric", month: "short" });
  const dirty = ages.some((a) => !sameLists(draft[a], stored[a]));
  const anyCalled = ages.some((a) => (draft[a] ?? []).length > 0);
  const th = (key: string, label: string, align: "left" | "center" = "left") => (
    <th className={`${TABLE_CELL.head} ${align === "center" ? "text-center" : ""}`} aria-sort={ariaSort(head(key)!)}>
      <SortButton sort={head(key)!} align={align}>{label}</SortButton>
    </th>
  );

  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("youthComps.callUps.title")}</h3>
        <p className="text-sm text-muted-foreground m-0 mt-1">{t("youthComps.callUps.hint", { n: YOUTH_COMP.MAX_CALL_UPS })}</p>
      </div>

      {skippedAges.map((a) => (
        <Notice key={a} kind="warning">
          {t(`youthComps.${a}`)}: {t("youthComps.callUps.skipped", { date: fmt(data.skipped[a]!.date), names: data.skipped[a]!.players.map((p) => p.name).join(", ") })}
        </Notice>
      ))}

      {ages.length > 0 && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {ages.map((age) => {
              const next = data.next[age]!;
              const n = (draft[age] ?? []).length;
              return (
                <div key={age} className="card-arcade rounded-md p-4 flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <span className="font-display font-black uppercase text-xl leading-none">{t(`youthComps.${age}`)}</span>
                    <span className="text-sm text-muted-foreground truncate">
                      {t("youthComps.callUps.next", {
                        opponent: next.opponentName,
                        venue: t(`youthComps.callUps.venue.${next.home ? "home" : "away"}`),
                        date: fmt(next.date),
                      })}
                    </span>
                  </div>
                  <span
                    className={`font-display font-bold tabular-nums text-xl leading-none whitespace-nowrap ${n >= YOUTH_COMP.MAX_CALL_UPS ? "text-chart-4" : "text-foreground"}`}
                    title={t("youthComps.callUps.count", { n, max: YOUTH_COMP.MAX_CALL_UPS })}
                  >
                    {n}/{YOUTH_COMP.MAX_CALL_UPS}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-2">
              <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
                {t("youthComps.callUps.durationLabel")}
              </span>
              <OptionChips
                aria-label={t("youthComps.callUps.durationLabel")}
                options={CALL_UP_DURATIONS.map((d) => ({ key: d, label: t(`youthComps.callUps.duration.${d}`) }))}
                value={duration}
                onChange={setDuration}
              />
            </div>
            <Chip selected={onlyYoung} onClick={() => setOnlyYoung((v) => !v)}>{t("youthComps.callUps.onlyYoung")}</Chip>
          </div>

          {failed && <Notice kind="error">{t("youthComps.callUps.failed")}</Notice>}

          <div className={TABLE_STYLE.shell}>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className={TABLE_STYLE.head}>
                  <tr>
                    {th("pos", t("youthComps.callUps.cols.pos"))}
                    {th("player", t("youthComps.callUps.cols.player"))}
                    {th("nation", t("youthComps.callUps.cols.nation"))}
                    {th("age", t("youthComps.callUps.cols.age"), "center")}
                    {th("ovr", t("youthComps.callUps.cols.ovr"), "center")}
                    {th("fitness", t("youthComps.callUps.cols.fitness"), "center")}
                    {ages.map((age) => <Fragment key={age}>{th(age, t(`youthComps.${age}`), "center")}</Fragment>)}
                  </tr>
                </thead>
                <tbody className={TABLE_STYLE.body}>
                  {sorted.map((p) => {
                    const flag = nationalityFlagCode(p.nationality);
                    return (
                      <tr key={p.id} className={TABLE_STYLE.row}>
                        <td className={`${TABLE_CELL.body} font-display font-bold text-sm ${getDetailedPositionColor(p.role)}`}>
                          {t(`roles.detailedAbbr.${p.role}`, { defaultValue: positionLabel(t, p.role, p.role) })}
                        </td>
                        <td className={`${TABLE_CELL.body} ${TABLE_STYLE.name}`}>
                          <PlayerNameLink player={{ id: p.id, name: p.name }} />
                          {p.academy && (
                            <span className="ml-2 inline-flex items-center rounded border border-border px-2 py-0.5 text-sm font-normal text-muted-foreground align-middle">
                              {t("youthComps.callUps.academy")}
                            </span>
                          )}
                        </td>
                        <td className={TABLE_CELL.body}>
                          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                            {flag && <Flag code={flag} />}
                            {p.nationality ? nationalityDisplayName(p.nationality, i18n.language, t) : "—"}
                          </span>
                        </td>
                        <td className={`${TABLE_CELL.body} ${TABLE_STYLE.number}`}>{p.age}</td>
                        <td className={`${TABLE_CELL.body} ${TABLE_STYLE.key}`}>{attrDisplay(p.overall)}</td>
                        <td className={`${TABLE_CELL.body} ${TABLE_STYLE.number}`}>{Math.round(p.fitness)}</td>
                        {ages.map((age) => {
                          const list = draft[age] ?? [];
                          const callUp = list.find((c) => c.id === p.id);
                          if (age === "u19" && !u19Ok.has(p.id)) {
                            return (
                              <td key={age} className={`${TABLE_CELL.body} text-center text-sm text-muted-foreground`} title={t("youthComps.callUps.tooOld")}>—</td>
                            );
                          }
                          const full = !callUp && list.length >= YOUTH_COMP.MAX_CALL_UPS;
                          const durationName = callUp ? t(`youthComps.callUps.duration.${callUp.duration}`) : undefined;
                          return (
                            <td key={age} className={`${TABLE_CELL.body} text-center`}>
                              <span className="inline-flex items-center gap-2">
                                <TickBox
                                  checked={callUp !== undefined}
                                  disabled={full || saving}
                                  title={full ? t("youthComps.callUps.full", { n: YOUTH_COMP.MAX_CALL_UPS }) : durationName}
                                  label={t("youthComps.callUps.markLabel", { age: t(`youthComps.${age}`), player: p.name })}
                                  onChange={() => {
                                    setSaved(false);
                                    setDraft((d) => ({ ...d, [age]: toggleCallUp(d[age] ?? [], p.id, duration) }));
                                  }}
                                />
                                <span className="inline-block min-w-[4.5rem] text-left text-sm tabular-nums text-muted-foreground" title={durationName}>
                                  {callUp ? callUpLeftLabel(callUp, t) : ""}
                                </span>
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={saving || !dirty} onClick={() => void save()}>
              {t("youthComps.callUps.save")}
            </Button>
            <Button
              variant="secondary"
              disabled={!anyCalled}
              onClick={() => {
                setSaved(false);
                setDraft((d) => Object.fromEntries(ages.map((a) => [a, applyCallUpDuration(d[a] ?? [], duration)])));
              }}
            >
              {t("youthComps.callUps.applyAll")}
            </Button>
            {dirty
              ? <span className="text-sm text-chart-4">{t("youthComps.callUps.unsaved")}</span>
              : saved && <span className="text-sm text-muted-foreground">{t("youthComps.callUps.saved")}</span>}
          </div>
        </>
      )}
    </section>
  );
}
