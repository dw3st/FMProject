import { useEffect, useState } from "react";
import { DialogTitle } from "@headlessui/react";
import { useTranslation } from "react-i18next";
import { formatFee } from "@/Domain/money";
import { nationalCompetitionName, nationalityDisplayName } from "@/Domain/world/labels";
import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";
import { Flag } from "@/GameInterface/Components/Flag";
import { Modal } from "@/GameInterface/Components/Modal";
import { formatDay } from "@/GameInterface/Dashboard/HomeCards";
import { objectiveText } from "@/GameInterface/National/NationalCoachView";
import { navigate } from "@/GameInterface/router/navigation";
import { Button } from "@/GameInterface/ui/Button";
import { Chip } from "@/GameInterface/ui/Chip";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import type { NationalCoachView as CoachData } from "@/backend/nationalCoachWorld";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0";
const VIEW_KEY = "fm.dashboard.coachView";

export type CoachCardView = "club" | "national";

/** Which card the Dashboard shows for a manager who also coaches a national team (kept per browser). */
export function useCoachCardView(): [CoachCardView, (v: CoachCardView) => void] {
  const [view, setView] = useState<CoachCardView>(() => {
    try { return localStorage.getItem(VIEW_KEY) === "national" ? "national" : "club"; } catch { return "club"; }
  });
  const set = (v: CoachCardView) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* no storage: the choice lasts the page */ }
  };
  return [view, set];
}

/** The "Clube / Seleção" switch above the club card (user report, 2026-11-16). */
export function CoachCardSwitch({ view, onChange, nation }: { view: CoachCardView; onChange: (v: CoachCardView) => void; nation?: string | null }) {
  const { t, i18n } = useTranslation();
  return (
    <SegmentedTabs
      compact
      className="self-start"
      aria-label={t("dashboard.coachSwitch.label")}
      tabs={[
        { key: "club", label: t("dashboard.coachSwitch.club") },
        { key: "national", label: nation ? nationalityDisplayName(nation, i18n.language, t) : t("dashboard.coachSwitch.national") },
      ]}
      active={view}
      onChange={onChange}
    />
  );
}

/** The national team he coaches, on the Dashboard: ranking, objectives, next games, asking for another team, leaving. */
export function NationalCoachCard({ saveId, onNation }: { saveId: string; onNation?: (nation: string) => void }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<CoachData | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/saves/${saveId}/national/coach`)
      .then((r) => (r.ok ? (r.json() as Promise<CoachData>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (!cancelled) { setData(d); setFailed(false); if (d.team) onNation?.(d.team.nation); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveId, tick]);

  async function call(url: string, init: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) setError(t("nationalCoach.error.generic"));
      setLeaving(false);
      setTick((x) => x + 1);
    } catch {
      setError(t("nationalCoach.error.generic"));
    } finally {
      setBusy(false);
    }
  }

  if (failed) return <div className="card-arcade rounded-md p-5 text-sm text-muted-foreground">{t("national.loadFailed")}</div>;
  if (!data) return <div className="card-arcade rounded-md p-5 text-sm text-muted-foreground">{t("national.loading")}</div>;
  const team = data.team;
  if (!team) {
    return (
      <div className="card-arcade rounded-md p-5 flex flex-wrap items-center gap-4">
        <p className="text-sm text-muted-foreground m-0">{t("nationalCoach.none")}</p>
        <Button variant="secondary" onClick={() => navigate("/leagues?tab=national&national=coach")}>{t("dashboard.coachSwitch.open")}</Button>
      </div>
    );
  }
  const nationName = (n: string) => nationalityDisplayName(n, i18n.language, t);
  const code = nationalityFlagCode(team.nation);
  const next = data.upcoming[0];

  return (
    <div className="card-arcade rounded-md p-5 grid gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-2">
        <span className="inline-flex items-center gap-3 font-display font-black uppercase text-xl leading-none">
          {code && <Flag code={code} />} {nationName(team.nation)}
        </span>
        <p className="text-sm text-muted-foreground tabular-nums m-0">
          {t("nationalCoach.teamLine", { rank: team.rank, points: team.elo, date: formatDay(team.since, i18n.language, "year"), wage: formatFee(team.wage) })}
        </p>
        <div className="flex flex-wrap gap-2 mt-1">
          <Button onClick={() => navigate("/leagues?tab=national&national=coach")}>{t("dashboard.coachSwitch.open")}</Button>
          <Button variant="secondary" onClick={() => navigate("/formation?team=national")}>{t("nationalCoach.openTactics")}</Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className={LABEL}>{t("nationalCoach.objectives")}</p>
        {data.objectives.length === 0
          ? <p className="text-sm text-muted-foreground m-0">{t("nationalCoach.noObjectives")}</p>
          : data.objectives.map((o) => (
            <p key={o.competition} className="text-sm m-0">
              <span className="font-semibold">{nationalCompetitionName(o.competition, i18n.language) ?? o.competition}</span>
              <span className="text-muted-foreground"> · {objectiveText(o, t)}</span>
            </p>
          ))}
        <p className={`${LABEL} mt-2`}>{t("dashboard.coachSwitch.next")}</p>
        <p className="text-sm m-0 tabular-nums">
          {next
            ? `${formatDay(next.date, i18n.language)} · ${nationName(data.names[next.home] ?? next.home)} ${t("national.vs")} ${nationName(data.names[next.away] ?? next.away)}`
            : t("nationalCoach.noUpcoming")}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <p className={LABEL}>{t("dashboard.coachSwitch.career")}</p>
        <Chip
          className="self-start"
          selected={!!team.seeking}
          disabled={busy}
          onClick={() => void call(`/api/saves/${saveId}/national/coach/seeking`, {
            method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on: !team.seeking }),
          })}
        >
          {t("dashboard.coachSwitch.seeking")}
        </Chip>
        <p className="text-sm text-muted-foreground m-0">{t(team.seeking ? "dashboard.coachSwitch.seekingOn" : "dashboard.coachSwitch.seekingOff")}</p>
        {data.offers.length > 0 && (
          <Button variant="secondary" className="self-start" onClick={() => navigate("/leagues?tab=national&national=coach")}>
            {t("dashboard.coachSwitch.offers", { count: data.offers.length })}
          </Button>
        )}
        <Button variant="danger" flush className="self-start" disabled={busy} onClick={() => setLeaving(true)}>{t("nationalCoach.resign")}</Button>
        {error && <p role="alert" className="text-sm text-destructive m-0">{error}</p>}
      </div>

      <Modal open={leaving} onClose={() => !busy && setLeaving(false)} size="sm">
        <div className="p-6 space-y-4">
          <DialogTitle as="h2" className="font-display font-black uppercase text-xl leading-none m-0">{t("nationalCoach.resignTitle")}</DialogTitle>
          <p className="text-sm text-foreground m-0">{t("nationalCoach.resignBody", { nation: nationName(team.nation) })}</p>
          <div className="flex justify-end gap-4">
            <Button variant="secondary" disabled={busy} onClick={() => setLeaving(false)}>{t("common.cancel")}</Button>
            <Button disabled={busy} onClick={() => void call(`/api/saves/${saveId}/national/coach/resign`, { method: "POST" })}>
              {t("nationalCoach.resignConfirm")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
