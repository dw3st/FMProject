import { useTableSort, type HeadSort, type SortAccessors } from "@/GameInterface/ui/tableSort";
import { SortButton } from "@/GameInterface/ui/SortButton";
import { positionIndex } from "@/Domain/positions/positionSort";
import { PlayerNameLink } from "@/GameInterface/Inbox/PlayerNameText";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { Button } from "@/GameInterface/ui/Button";
import { Notice } from "@/GameInterface/ui/Notice";
import { TickBox } from "@/GameInterface/ui/TickBox";
import { TABLE_CELL, TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import { ConfirmDialog } from "@/GameInterface/Components/ConfirmDialog";
import { Flag } from "@/GameInterface/Components/Flag";
import { StarBadge } from "@/GameInterface/Components/StarBadge";
import { useStarPlayers } from "@/GameInterface/useStarPlayers";
import { getDetailedPositionColor } from "@/GameInterface/positionHelpers";
import { competitionName, nationalityDisplayName } from "@/Domain/world/labels";
import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";
import { IBERO_PASSPORT_MIN_AGE } from "@/Domain/registration/registrationConfig";
import type { LeagueData } from "@/types/playerTypes";
import type { RegistrationCompView, RegistrationRowView } from "@/types/registrationTypes";
import {
  fetchRegistration, registrationErrorKey, resetRegistration, saveRegistration,
} from "@/GameInterface/Squad/registrationApi";
import {
  anyMark, registrationTableRows, toggledIds, type RegistrationTableRow,
} from "@/GameInterface/Squad/registrationTable";

function formatDay(date: string, lang: string): string {
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(lang, { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** A small text badge (foreign, home-grown) in a row. */
type TagTone = "foreign" | "greenCard" | "club" | "nation";
const TAG_TONE: Record<TagTone, string> = {
  foreign: "border-rose-400/50 bg-rose-400/15 text-rose-300",
  greenCard: "border-emerald-400/50 bg-emerald-400/15 text-emerald-300",
  club: "border-primary/50 bg-primary/15 text-primary",
  nation: "border-violet-400/50 bg-violet-400/15 text-violet-300",
};
function Tag({ children, tone, title }: { children: string; tone: TagTone; title?: string }) {
  const cls = TAG_TONE[tone];
  return <span title={title} className={`inline-flex items-center rounded border px-2 py-0.5 text-sm whitespace-nowrap ${cls}`}>{children}</span>;
}

function Counter({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{label}</span>
      <span className={`font-display font-bold tabular-nums text-xl leading-none ${warn ? "text-chart-4" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

const NO_ROWS: RegistrationTableRow[] = [];
const ariaSort = (s: HeadSort) => (s.active ? (s.dir === "asc" ? "ascending" : "descending") : "none");
const compKey = (slug: string) => `comp:${slug}`;

/**
 * Registration tab of the squad (`.claude/rules/game/registration.md` → Telas): one list of players with a column per
 * competition and a tick box in each; above it, a card per competition with its deadline, rule and counters.
 */
export function RegistrationView() {
  const { t, i18n } = useTranslation();
  const { session, currentDate } = useGameSave();
  const saveId = session?.saveId;
  // Same star index as the squad list and the player profile (#160).
  const stars = useStarPlayers(saveId, currentDate);
  const [comps, setComps] = useState<RegistrationCompView[] | null>(null);
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmAuto, setConfirmAuto] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!saveId) return;
    fetchRegistration(saveId)
      .then((d) => setComps(d.competitions))
      .catch(() => setError(t("registration.loadFailed")));
  }, [saveId, t]);

  useEffect(load, [load]);
  useEffect(() => {
    void fetch("/api/leagues")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: LeagueData[]) => setLeagues(Array.isArray(d) ? d : []))
      .catch(() => setLeagues([]));
  }, []);

  const rows = useMemo(() => (comps ? registrationTableRows(comps) : NO_ROWS), [comps]);
  const nameOf = (slug: string) => competitionName(slug, leagues, i18n.language);
  const accessors: SortAccessors<RegistrationTableRow> = {
    pos: (r) => positionIndex(r.base.role), player: (r) => r.base.name, age: (r) => r.base.age,
    nation: (r) => (r.base.nationality ? nationalityDisplayName(r.base.nationality, i18n.language, t) : null),
    rating: (r) => r.base.overall,
  };
  // A competition column sorts the registered players first.
  for (const c of comps ?? []) accessors[compKey(c.slug)] = (r) => (r.marks[c.slug]?.registered ? 1 : 0);
  const { sorted: sortedRows, head } = useTableSort(rows, accessors);

  const replace = (view: RegistrationCompView) => setComps((cs) => (cs ?? []).map((c) => (c.slug === view.slug ? view : c)));

  async function toggle(comp: RegistrationCompView, playerId: string, registered: boolean) {
    if (!saveId) return;
    setBusy(true);
    setError(null);
    try {
      replace(await saveRegistration(saveId, comp.slug, toggledIds(comp, playerId, registered)));
    } catch (e) {
      setError(t(registrationErrorKey(e)));
    } finally {
      setBusy(false);
    }
  }

  async function automatic(slug: string) {
    if (!saveId) return;
    setBusy(true);
    setError(null);
    try {
      replace(await resetRegistration(saveId, slug));
    } catch (e) {
      setError(t(registrationErrorKey(e)));
    } finally {
      setBusy(false);
      setConfirmAuto(null);
    }
  }

  if (!comps) return <p className="text-sm text-muted-foreground m-0">{error ?? t("registration.loading")}</p>;
  if (comps.length === 0) return <p className="text-sm text-muted-foreground m-0">{t("registration.none")}</p>;

  // Knocked out (or the competition is over): nothing to edit, the list counts for no match (4.47.19).
  const isOpen = (c: RegistrationCompView) => c.status.open && !c.out;
  const deadlineOf = (c: RegistrationCompView) =>
    c.out
      ? t("registration.out")
      : isOpen(c)
        ? t("registration.openUntil", { date: formatDay(c.status.until ?? "", i18n.language) })
        : c.status.stageStarted && !c.status.opensOn
          ? t("registration.stageStarted")
          : c.status.opensOn
            ? t("registration.closedOpens", { date: formatDay(c.status.opensOn, i18n.language) })
            : t("registration.closed");
  const ruleOf = ({ rule }: RegistrationCompView) => [
    rule.maxList != null ? t("registration.rule.list", { n: rule.maxList }) : t("registration.rule.noList"),
    rule.free ? t(rule.free.formedOnly ? "registration.rule.freeFormed" : "registration.rule.free", { age: rule.free.maxAge }) : null,
    rule.minFormed && rule.maxList != null ? t("registration.rule.formed", { n: rule.minFormed }) : null,
    rule.maxForeign != null
      ? t(rule.foreign === "nonEU" ? "registration.rule.foreignNonEU" : "registration.rule.foreign", { n: rule.maxForeign })
      : null,
    rule.foreign === "nonEU" && rule.exempt?.includes("ibero") ? t("registration.rule.exemptIbero", { age: IBERO_PASSPORT_MIN_AGE }) : null,
    rule.foreign === "nonEU" && rule.exempt?.includes("acp") ? t("registration.rule.exemptAcp") : null,
    rule.greenCard ? t("registration.rule.greenCard") : null,
    rule.maxForeignMatchday != null ? t("registration.rule.foreignMatchday", { n: rule.maxForeignMatchday }) : null,
  ].filter(Boolean).join(" · ");
  // The reason he takes a foreign place (`foreignBasis`), shown on the "Foreign" tag.
  const basisText = (r: RegistrationRowView) =>
    r.foreignBasis && r.foreignBasis !== "greenCard"
      ? t(`registration.basis.${r.foreignBasis}`, { nation: nationalityDisplayName(r.nationality ?? "", i18n.language, t), age: IBERO_PASSPORT_MIN_AGE })
      : undefined;
  const confirming = comps.find((c) => c.slug === confirmAuto) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {comps.map((c) => {
          const open = isOpen(c);
          const { counts, rule } = c;
          return (
            <section key={c.slug} className="card-arcade rounded-md p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1.5 min-w-0">
                  <h3 className="font-display font-black uppercase text-xl leading-none m-0 truncate">{nameOf(c.slug)}</h3>
                  <p className={`m-0 text-sm font-semibold ${open ? "text-primary" : "text-muted-foreground"}`}>{deadlineOf(c)}</p>
                </div>
                <Button disabled={!open || busy} onClick={() => (c.manual ? setConfirmAuto(c.slug) : void automatic(c.slug))}>
                  {t("registration.auto")}
                </Button>
              </div>
              <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                <Counter label={t("registration.counters.registered")} value={counts.max != null ? `${counts.counted}/${counts.max}` : String(counts.counted)} />
                {counts.maxForeign != null && (
                  <Counter label={t("registration.counters.foreign")} value={`${counts.foreign}/${counts.maxForeign}`} warn={counts.foreign >= counts.maxForeign} />
                )}
                {counts.minFormed > 0 && (
                  <Counter
                    label={counts.lostSlots > 0 ? t("registration.counters.formedLost", { n: counts.lostSlots }) : t("registration.counters.formed")}
                    value={`${counts.formed}/${counts.minFormed}`}
                    warn={counts.lostSlots > 0}
                  />
                )}
                {rule.free && <Counter label={t("registration.counters.free")} value={String(counts.free)} />}
              </div>
              <p className="m-0 text-sm text-muted-foreground">{ruleOf(c)}</p>
              {c.manual && <p className="m-0 text-sm text-muted-foreground">{t("registration.manual")}</p>}
              {c.exception && <p className="m-0 text-sm text-chart-4">{t("registration.exception")}</p>}
            </section>
          );
        })}
      </div>

      {error && <Notice kind="error">{error}</Notice>}

      <div className={TABLE_STYLE.shell}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className={TABLE_STYLE.head}>
              <tr>
                <th className={TABLE_CELL.head} aria-sort={ariaSort(head("pos")!)}><SortButton sort={head("pos")!}>{t("registration.cols.pos")}</SortButton></th>
                <th className={TABLE_CELL.head} aria-sort={ariaSort(head("player")!)}><SortButton sort={head("player")!}>{t("registration.cols.player")}</SortButton></th>
                <th className={`${TABLE_CELL.head} text-center`} aria-sort={ariaSort(head("age")!)}><SortButton sort={head("age")!} align="center">{t("registration.cols.age")}</SortButton></th>
                <th className={TABLE_CELL.head} aria-sort={ariaSort(head("nation")!)}><SortButton sort={head("nation")!}>{t("registration.cols.nation")}</SortButton></th>
                <th className={TABLE_CELL.head}>{t("registration.cols.status")}</th>
                <th className={`${TABLE_CELL.head} text-center`} aria-sort={ariaSort(head("rating")!)}><SortButton sort={head("rating")!} align="center">{t("registration.cols.rating")}</SortButton></th>
                {comps.map((c) => {
                  const sort = head(compKey(c.slug))!;
                  return (
                    <th key={c.slug} className={`${TABLE_CELL.head} text-center whitespace-nowrap ${c.out ? "opacity-60" : ""}`} aria-sort={ariaSort(sort)} title={deadlineOf(c)}>
                      <SortButton sort={sort} align="center">{nameOf(c.slug)}</SortButton>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className={TABLE_STYLE.body}>
              {sortedRows.map((row) => {
                const r = row.base;
                const flag = nationalityFlagCode(r.nationality);
                const nation = r.nationality ? nationalityDisplayName(r.nationality, i18n.language, t) : "—";
                const foreign = anyMark(row, (m) => m.foreign);
                const greenCard = anyMark(row, (m) => m.greenCard);
                const clubTrained = anyMark(row, (m) => m.clubTrained);
                const nationTrained = anyMark(row, (m) => m.nationTrained);
                const nowhere = !anyMark(row, (m) => m.registered);
                return (
                  <tr key={r.id} className={`${TABLE_STYLE.row} ${nowhere ? "opacity-70" : ""}`}>
                    <td className={`${TABLE_CELL.body} font-display font-bold text-sm ${getDetailedPositionColor(r.role)}`}>
                      {t(`roles.detailedAbbr.${r.role}`)}
                    </td>
                    <td className={`${TABLE_CELL.body} ${TABLE_STYLE.name}`}>
                      <PlayerNameLink player={{ id: r.id, name: r.name }} />
                      {stars.get(r.id) && <StarBadge kind={stars.get(r.id)} className="ml-1.5 align-middle" />}
                    </td>
                    <td className={`${TABLE_CELL.body} ${TABLE_STYLE.number}`}>{r.age}</td>
                    <td className={TABLE_CELL.body}>
                      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        {flag && <Flag code={flag} />}
                        {nation}
                      </span>
                    </td>
                    <td className={TABLE_CELL.body}>
                      <span className="flex flex-wrap gap-1.5">
                        {foreign && <Tag tone="foreign" title={basisText(foreign)}>{t("registration.tags.foreign")}</Tag>}
                        {greenCard && <Tag tone="greenCard" title={t("registration.tags.greenCardHint")}>{t("registration.tags.greenCard")}</Tag>}
                        {clubTrained ? <Tag tone="club">{t("registration.tags.clubTrained")}</Tag> : nationTrained ? <Tag tone="nation">{t("registration.tags.nationTrained")}</Tag> : null}
                      </span>
                    </td>
                    <td className={`${TABLE_CELL.body} ${TABLE_STYLE.key}`}>{r.overall.toFixed(1)}</td>
                    {comps.map((c) => {
                      const m = row.marks[c.slug];
                      if (!m) return <td key={c.slug} className={TABLE_CELL.body} />;
                      const open = isOpen(c);
                      const blocked = !m.registered && !m.canAdd;
                      const title = m.free
                        ? t("registration.freeHint")
                        : !open
                          ? deadlineOf(c)
                          : blocked && m.reason
                            ? t(`registration.reason.${m.reason}`)
                            : t(m.registered ? "registration.remove" : "registration.add");
                      return (
                        <td key={c.slug} className={`${TABLE_CELL.body} text-center ${c.out ? "opacity-60" : ""}`}>
                          <TickBox
                            checked={m.registered}
                            fixed={m.free}
                            disabled={!open || busy || blocked}
                            title={title}
                            label={t("registration.markLabel", { competition: nameOf(c.slug), player: r.name })}
                            onChange={(next) => void toggle(c, r.id, next)}
                          />
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

      <p className="m-0 text-sm text-muted-foreground">{t("registration.legend")}</p>

      <ConfirmDialog
        open={!!confirming}
        title={t("registration.autoConfirmTitle")}
        body={t("registration.autoConfirmBody")}
        confirmLabel={t("registration.auto")}
        onConfirm={() => confirming && void automatic(confirming.slug)}
        onClose={() => setConfirmAuto(null)}
        busy={busy}
      />
    </div>
  );
}
