import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { Button } from "@/GameInterface/ui/Button";
import { Notice } from "@/GameInterface/ui/Notice";
import { TABLE_CELL, TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import { ConfirmDialog } from "@/GameInterface/Components/ConfirmDialog";
import { Flag } from "@/GameInterface/Components/Flag";
import { getDetailedPositionColor } from "@/GameInterface/positionHelpers";
import { competitionName, nationalityDisplayName } from "@/Domain/world/labels";
import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";
import type { LeagueData } from "@/types/playerTypes";
import type { RegistrationCompView, RegistrationRowView } from "@/types/registrationTypes";
import {
  fetchRegistration, registrationErrorKey, resetRegistration, saveRegistration,
} from "@/GameInterface/Squad/registrationApi";

function formatDay(date: string, lang: string): string {
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(lang, { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** A small text badge (foreign, home-grown, free) in a row. */
function Tag({ children, tone = "muted" }: { children: string; tone?: "muted" | "primary" | "warn" }) {
  const cls = tone === "primary" ? "border-primary/40 text-primary" : tone === "warn" ? "border-chart-4/40 text-chart-4" : "border-border text-muted-foreground";
  return <span className={`inline-flex items-center rounded border px-2 py-0.5 text-sm whitespace-nowrap ${cls}`}>{children}</span>;
}

function Counter({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{label}</span>
      <span className={`font-display font-bold tabular-nums text-2xl leading-none ${warn ? "text-chart-4" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

/**
 * Registration tab of the squad (`.claude/rules/game/registration.md` → Telas): one competition at a time, deadline,
 * rule, counters and every player with Add/Remove while the deadline is open; "Automatic" rebuilds the list.
 */
export function RegistrationView() {
  const { t, i18n } = useTranslation();
  const { session } = useGameSave();
  const saveId = session?.saveId;
  const [comps, setComps] = useState<RegistrationCompView[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmAuto, setConfirmAuto] = useState(false);

  const load = useCallback(() => {
    if (!saveId) return;
    fetchRegistration(saveId)
      .then((d) => {
        setComps(d.competitions);
        setActive((cur) => (cur && d.competitions.some((c) => c.slug === cur) ? cur : d.competitions[0]?.slug ?? null));
      })
      .catch(() => setError(t("registration.loadFailed")));
  }, [saveId, t]);

  useEffect(load, [load]);
  useEffect(() => {
    void fetch("/api/leagues")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: LeagueData[]) => setLeagues(Array.isArray(d) ? d : []))
      .catch(() => setLeagues([]));
  }, []);

  const comp = useMemo(() => comps?.find((c) => c.slug === active) ?? null, [comps, active]);
  const nameOf = (slug: string) => competitionName(slug, leagues, i18n.language);

  const replace = (view: RegistrationCompView) => setComps((cs) => (cs ?? []).map((c) => (c.slug === view.slug ? view : c)));

  async function toggle(row: RegistrationRowView) {
    if (!saveId || !comp) return;
    const ids = comp.rows.filter((r) => r.registered && !r.free).map((r) => r.id);
    const next = row.registered ? ids.filter((id) => id !== row.id) : [...ids, row.id];
    setBusy(true);
    setError(null);
    try {
      replace(await saveRegistration(saveId, comp.slug, next));
    } catch (e) {
      setError(t(registrationErrorKey(e)));
    } finally {
      setBusy(false);
    }
  }

  async function automatic() {
    if (!saveId || !comp) return;
    setBusy(true);
    setError(null);
    try {
      replace(await resetRegistration(saveId, comp.slug));
    } catch (e) {
      setError(t(registrationErrorKey(e)));
    } finally {
      setBusy(false);
      setConfirmAuto(false);
    }
  }

  if (!comps) return <p className="text-sm text-muted-foreground m-0">{error ?? t("registration.loading")}</p>;
  if (!comp) return <p className="text-sm text-muted-foreground m-0">{t("registration.none")}</p>;

  const { status, counts, rule } = comp;
  const open = status.open;
  const deadline = open
    ? t("registration.openUntil", { date: formatDay(status.until ?? "", i18n.language) })
    : status.stageStarted && !status.opensOn
      ? t("registration.stageStarted")
      : status.opensOn
        ? t("registration.closedOpens", { date: formatDay(status.opensOn, i18n.language) })
        : t("registration.closed");
  const ruleParts = [
    rule.maxList != null ? t("registration.rule.list", { n: rule.maxList }) : t("registration.rule.noList"),
    rule.free ? t(rule.free.formedOnly ? "registration.rule.freeFormed" : "registration.rule.free", { age: rule.free.maxAge }) : null,
    rule.minFormed && rule.maxList != null ? t("registration.rule.formed", { n: rule.minFormed }) : null,
    rule.maxForeign != null ? t("registration.rule.foreign", { n: rule.maxForeign }) : null,
    rule.maxForeignMatchday != null ? t("registration.rule.foreignMatchday", { n: rule.maxForeignMatchday }) : null,
  ].filter(Boolean);
  const reasonText = (r: RegistrationRowView) => (r.reason ? t(`registration.reason.${r.reason}`) : "");

  return (
    <div className="flex flex-col gap-6">
      <SegmentedTabs
        compact
        wrap
        tabs={comps.map((c) => ({ key: c.slug, label: nameOf(c.slug) }))}
        active={active}
        onChange={setActive}
        aria-label={t("registration.competitions")}
      />

      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1">
          <p className={`m-0 text-sm font-semibold ${open ? "text-primary" : "text-muted-foreground"}`}>{deadline}</p>
          <p className="m-0 text-sm text-muted-foreground">{ruleParts.join(" · ")}</p>
          {comp.manual && <p className="m-0 text-sm text-muted-foreground">{t("registration.manual")}</p>}
        </div>
        <div className="flex flex-wrap items-end gap-8">
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
          <Button disabled={!open || busy} onClick={() => (comp.manual ? setConfirmAuto(true) : void automatic())}>
            {t("registration.auto")}
          </Button>
        </div>
      </div>

      {comp.exception && <Notice kind="warning">{t("registration.exception")}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      <div className={TABLE_STYLE.shell}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className={TABLE_STYLE.head}>
              <tr>
                <th className={TABLE_CELL.head}>{t("registration.cols.pos")}</th>
                <th className={TABLE_CELL.head}>{t("registration.cols.player")}</th>
                <th className={`${TABLE_CELL.head} text-center`}>{t("registration.cols.age")}</th>
                <th className={TABLE_CELL.head}>{t("registration.cols.nation")}</th>
                <th className={TABLE_CELL.head}>{t("registration.cols.status")}</th>
                <th className={`${TABLE_CELL.head} text-center`}>{t("registration.cols.rating")}</th>
                <th className={`${TABLE_CELL.head} text-right`}>{t("registration.cols.action")}</th>
              </tr>
            </thead>
            <tbody className={TABLE_STYLE.body}>
              {comp.rows.map((r) => {
                const flag = nationalityFlagCode(r.nationality);
                const nation = r.nationality ? nationalityDisplayName(r.nationality, i18n.language, t) : "—";
                const canToggle = open && !busy && !r.free && (r.registered || r.canAdd);
                const title = !open ? deadline : r.free ? t("registration.freeHint") : !r.registered && !r.canAdd ? reasonText(r) : undefined;
                return (
                  <tr key={r.id} className={`${TABLE_STYLE.row} ${r.registered ? "" : "opacity-70"}`}>
                    <td className={`${TABLE_CELL.body} font-display font-bold text-sm ${getDetailedPositionColor(r.role)}`}>
                      {t(`roles.detailedAbbr.${r.role}`)}
                    </td>
                    <td className={`${TABLE_CELL.body} ${TABLE_STYLE.name}`}>{r.name}</td>
                    <td className={`${TABLE_CELL.body} ${TABLE_STYLE.number}`}>{r.age}</td>
                    <td className={TABLE_CELL.body}>
                      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        {flag && <Flag code={flag} />}
                        {nation}
                      </span>
                    </td>
                    <td className={TABLE_CELL.body}>
                      <span className="flex flex-wrap gap-1.5">
                        {r.registered ? <Tag tone="primary">{t("registration.tags.registered")}</Tag> : <Tag tone="warn">{t("registration.tags.out")}</Tag>}
                        {r.free && <Tag>{t("registration.tags.free")}</Tag>}
                        {r.foreign && <Tag>{t("registration.tags.foreign")}</Tag>}
                        {r.clubTrained ? <Tag>{t("registration.tags.clubTrained")}</Tag> : r.nationTrained ? <Tag>{t("registration.tags.nationTrained")}</Tag> : null}
                      </span>
                    </td>
                    <td className={`${TABLE_CELL.body} ${TABLE_STYLE.key}`}>{r.overall.toFixed(1)}</td>
                    <td className={`${TABLE_CELL.body} text-right`}>
                      {!r.free && (
                        <Button
                          variant={r.registered ? "danger" : "secondary"}
                          flush
                          disabled={!canToggle}
                          title={title}
                          onClick={() => void toggle(r)}
                        >
                          {r.registered ? t("registration.remove") : t("registration.add")}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={confirmAuto}
        title={t("registration.autoConfirmTitle")}
        body={t("registration.autoConfirmBody")}
        confirmLabel={t("registration.auto")}
        onConfirm={() => void automatic()}
        onClose={() => setConfirmAuto(false)}
        busy={busy}
      />
    </div>
  );
}
