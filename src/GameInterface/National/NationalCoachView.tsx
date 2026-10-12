import { useEffect, useMemo, useState } from "react";
import { DialogTitle } from "@headlessui/react";
import { useTranslation } from "react-i18next";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { Button } from "@/GameInterface/ui/Button";
import { Chip } from "@/GameInterface/ui/Chip";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { Modal } from "@/GameInterface/Components/Modal";
import { Flag } from "@/GameInterface/Components/Flag";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import { ClubCell, NameCell, NumberCell, StatsCell, StatsHead, StatsRow, StatsTable } from "@/GameInterface/Components/StatsTable";
import { formatDay } from "@/GameInterface/Dashboard/HomeCards";
import { playerHref } from "@/GameInterface/Scouting/scoutingApi";
import { getDetailedPositionColor } from "@/GameInterface/positionHelpers";
import { NationalOfferCard } from "@/GameInterface/National/NationalCoachInboxBody";
import { FORMATION_IDS, formationForSimId } from "@/Domain/matchFormations";
import { getMainRole } from "@/Domain/roles";
import { formatFee } from "@/Domain/money";
import { nationalCompetitionName, nationalityDisplayName } from "@/Domain/world/labels";
import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";
import { TACTICAL_STYLE_OPTIONS, getTacticalStyleMeta, type TacticalStyle } from "@/types/tacticsTypes";
import type { NationalCoachView as CoachData } from "@/backend/nationalCoachWorld";
import type { NationalObjective } from "@/Domain/national/nationalCoach";

const SQUAD_SIZE = 23;
const GK_QUOTA = 3;
const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";

/** "Minha seleção" (Etapa 41b): offers, the team he coaches, objectives, call-up, tactics, games, resignation. */
export function NationalCoachView({ saveId, refreshKey, onChanged }: { saveId: string; refreshKey: string; onChanged: () => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<CoachData | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    fetch(`/api/saves/${saveId}/national/coach`)
      .then((r) => (r.ok ? (r.json() as Promise<CoachData>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [saveId, refreshKey, tick]);

  const reload = () => { setTick((x) => x + 1); onChanged(); };

  if (failed) return <p className="text-sm text-muted-foreground">{t("national.loadFailed")}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">{t("national.loading")}</p>;
  return (
    <div className="flex flex-col gap-6">
      {data.offers.length > 0 && (
        <section className="flex flex-col gap-3 max-w-2xl">
          <SectionTitle>{t("nationalCoach.offers")}</SectionTitle>
          {data.offers.map((o) => <NationalOfferCard key={o.id} offer={o} onDone={reload} />)}
        </section>
      )}
      {!data.team ? (
        data.offers.length === 0 && <p className="text-sm text-muted-foreground max-w-2xl">{t("nationalCoach.none")}</p>
      ) : (
        <TeamBlock saveId={saveId} data={data} onChanged={reload} />
      )}
    </div>
  );
}

function TeamBlock({ saveId, data, onChanged }: { saveId: string; data: CoachData; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const team = data.team!;
  const nationName = (n: string) => nationalityDisplayName(n, i18n.language, t);
  const code = nationalityFlagCode(team.nation);
  const [resigning, setResigning] = useState(false);
  const [busy, setBusy] = useState(false);

  async function resign() {
    setBusy(true);
    try {
      await fetch(`/api/saves/${saveId}/national/coach/resign`, { method: "POST" });
      setResigning(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="inline-flex items-center gap-2 font-display font-black uppercase text-xl leading-none">
          {code && <Flag code={code} />} {nationName(team.nation)}
        </span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {t("nationalCoach.teamLine", { rank: team.rank, points: team.elo, date: formatDay(team.since, i18n.language, "year"), wage: formatFee(team.wage) })}
        </span>
        <Button variant="danger" flush onClick={() => setResigning(true)}>{t("nationalCoach.resign")}</Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="flex flex-col gap-2">
          <SectionTitle>{t("nationalCoach.objectives")}</SectionTitle>
          {data.objectives.length === 0 ? <p className="text-sm text-muted-foreground m-0">{t("nationalCoach.noObjectives")}</p>
            : data.objectives.map((o) => (
              <p key={o.competition} className="text-sm m-0">
                <span className="font-semibold">{nationalCompetitionName(o.competition, i18n.language) ?? o.competition}</span>
                <span className="text-muted-foreground"> · {objectiveText(o, t)}</span>
              </p>
            ))}
        </section>
        <section className="flex flex-col gap-2">
          <SectionTitle>{t("nationalCoach.upcoming")}</SectionTitle>
          {data.upcoming.length === 0 ? <p className="text-sm text-muted-foreground m-0">{t("nationalCoach.noUpcoming")}</p>
            : data.upcoming.map((f) => (
              <p key={f.id} className="text-sm m-0 tabular-nums flex flex-wrap gap-2">
                <span className="text-muted-foreground w-16 shrink-0">{formatDay(f.date, i18n.language)}</span>
                <span className="truncate">{nationName(data.names[f.home] ?? f.home)} {t("national.vs")} {nationName(data.names[f.away] ?? f.away)}</span>
                <span className="text-muted-foreground">{nationalCompetitionName(f.competition, i18n.language)}</span>
              </p>
            ))}
        </section>
      </div>

      <CallUpBlock saveId={saveId} data={data} onSaved={onChanged} />
      <TacticsBlock saveId={saveId} data={data} onSaved={onChanged} />

      <Modal open={resigning} onClose={() => !busy && setResigning(false)} size="sm">
        <div className="p-6 space-y-4">
          <DialogTitle as="h2" className="font-display font-black uppercase text-xl leading-none m-0">{t("nationalCoach.resignTitle")}</DialogTitle>
          <p className="text-sm text-foreground m-0">{t("nationalCoach.resignBody", { nation: nationName(team.nation) })}</p>
          <div className="flex justify-end gap-4">
            <Button variant="secondary" disabled={busy} onClick={() => setResigning(false)}>{t("common.cancel")}</Button>
            <Button disabled={busy} onClick={() => void resign()}>{t("nationalCoach.resignConfirm")}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function objectiveText(o: NationalObjective, t: (k: string, p?: Record<string, unknown>) => string): string {
  if (o.kind === "qualifier") return t(o.mustQualify ? "nationalCoach.objective.qualifierMust" : "nationalCoach.objective.qualifier", { group: o.group, target: o.target });
  return t(`nationalCoach.objective.${o.stage}`);
}

function CallUpBlock({ saveId, data, onSaved }: { saveId: string; data: CoachData; onSaved: () => void }) {
  const { t, i18n } = useTranslation();
  const cu = data.callUp;
  const initial = useMemo(() => cu?.chosen ?? cu?.suggestion ?? [], [cu]);
  const [picked, setPicked] = useState<string[]>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPicked(initial); setMsg(null); }, [initial]);

  if (!cu) {
    return (
      <section className="flex flex-col gap-2">
        <SectionTitle>{t("national.squadNow")}</SectionTitle>
        <p className="text-sm text-muted-foreground m-0">{t("nationalCoach.callUpNone")}</p>
      </section>
    );
  }
  const set = new Set(picked);
  const byId = new Map(cu.candidates.map((c) => [c.id, c]));
  const gk = picked.filter((id) => getMainRole(byId.get(id)?.role ?? "CM") === "GK").length;
  const fillGk = Math.min(Math.max(0, SQUAD_SIZE - picked.length), Math.max(0, GK_QUOTA - gk));

  async function save(players: string[] | null) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/saves/${saveId}/national/coach/callup`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ players }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; reason?: string };
        const key = body.reason ?? body.error ?? "generic";
        setMsg({ ok: false, text: t(`nationalCoach.error.${key}`, { defaultValue: t("nationalCoach.error.generic") }) });
        return;
      }
      setMsg({ ok: true, text: t("nationalCoach.saved") });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= SQUAD_SIZE ? p : [...p, id]));

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>{t("nationalCoach.callUp", { date: formatDay(cu.date, i18n.language, "year") })}</SectionTitle>
      <p className="text-sm text-muted-foreground m-0">{t("nationalCoach.callUpFirstGame", { date: formatDay(cu.firstGame, i18n.language) })}</p>
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-sm tabular-nums">{t("nationalCoach.callUpCount", { count: picked.length, gk: gk + fillGk })}</span>
        <Button disabled={busy} onClick={() => void save(picked)}>{t("nationalCoach.saveCallUp")}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => { setPicked(cu.suggestion); void save(null); }}>{t("nationalCoach.useSuggestion")}</Button>
        {msg && <span className={`text-sm ${msg.ok ? "text-primary" : "text-destructive"}`}>{msg.text}</span>}
      </div>
      <StatsTable
        className="max-w-5xl"
        head={<>
          <StatsHead />
          <StatsHead>{t("national.pos")}</StatsHead>
          <StatsHead>{t("national.player")}</StatsHead>
          <StatsHead>{t("national.club")}</StatsHead>
          <StatsHead align="center">{t("national.rating")}</StatsHead>
          <StatsHead align="center">{t("nationalCoach.age")}</StatsHead>
          <StatsHead align="center">{t("nationalCoach.fitness")}</StatsHead>
          <StatsHead />
        </>}
      >
        {cu.candidates.map((c) => (
          <StatsRow key={c.id} highlight={set.has(c.id)}>
            <StatsCell className="w-28">
              <Chip selected={set.has(c.id)} disabled={c.injured && !set.has(c.id)} onClick={() => toggle(c.id)}>
                {set.has(c.id) ? t("nationalCoach.drop") : t("nationalCoach.pick")}
              </Chip>
            </StatsCell>
            <StatsCell className={`font-display font-bold ${getDetailedPositionColor(c.role)}`}>{t(`roles.detailedAbbr.${c.role}`, { defaultValue: c.role })}</StatsCell>
            <NameCell href={playerHref(c.id, c.squadId)} highlight={set.has(c.id)}><span className="truncate">{c.name}</span></NameCell>
            <ClubCell>{c.clubName ?? "-"}</ClubCell>
            <NumberCell strong>{Math.round(c.overall * 10)}</NumberCell>
            <NumberCell>{c.age}</NumberCell>
            <NumberCell>{c.fitness}</NumberCell>
            <StatsCell className="text-sm">
              {c.injured ? <span className="text-destructive">{t("nationalCoach.injured")}</span>
                : c.suggested ? <span className="text-muted-foreground">{t("nationalCoach.suggested")}</span> : null}
            </StatsCell>
          </StatsRow>
        ))}
      </StatsTable>
    </section>
  );
}

function TacticsBlock({ saveId, data, onSaved }: { saveId: string; data: CoachData; onSaved: () => void }) {
  const { t } = useTranslation();
  const [formation, setFormation] = useState(data.tactics.formation);
  const [style, setStyle] = useState<TacticalStyle>(data.tactics.tactical_style);
  const [lineup, setLineup] = useState<string[]>(data.tactics.lineup);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setFormation(data.tactics.formation);
    setStyle(data.tactics.tactical_style);
    setLineup(data.tactics.lineup);
  }, [data.tactics]);

  const slots = formationForSimId(formation).attacking;
  const options = [{ value: "", label: t("nationalCoach.xiAuto") }, ...data.squad.map((p) => ({
    value: p.id, label: `${t(`roles.detailedAbbr.${p.role}`, { defaultValue: p.role })} · ${p.name} · ${Math.round(p.overall * 10)}`,
  }))];

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/saves/${saveId}/national/coach/tactics`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formation, tactical_style: style, lineup: slots.map((_, i) => lineup[i] ?? "") }),
      });
      setMsg(res.ok ? { ok: true, text: t("nationalCoach.saved") } : { ok: false, text: t("nationalCoach.error.generic") });
      if (res.ok) onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>{t("nationalCoach.tactics")}</SectionTitle>
      <div className="flex flex-col gap-2">
        <span className={LABEL}>{t("nationalCoach.formation")}</span>
        <OptionChips options={FORMATION_IDS.map((id) => ({ key: id, label: id }))} value={formation} onChange={(f) => { setFormation(f); setLineup([]); }} aria-label={t("nationalCoach.formation")} />
      </div>
      <div className="flex flex-col gap-2">
        <span className={LABEL}>{t("nationalCoach.style")}</span>
        <OptionChips
          options={TACTICAL_STYLE_OPTIONS.map((o) => ({ key: o.value, label: getTacticalStyleMeta(o.value, t as never).label }))}
          value={style}
          onChange={setStyle}
          aria-label={t("nationalCoach.style")}
        />
      </div>
      <div className="flex flex-col gap-2">
        <span className={LABEL}>{t("nationalCoach.xi")}</span>
        {data.squad.length === 0 ? <p className="text-sm text-muted-foreground m-0">{t("nationalCoach.xiAfterCallUp")}</p> : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 max-w-5xl">
            {slots.map((slot, i) => (
              <SelectCombobox
                key={`${formation}-${i}`}
                label={t(`roles.detailedAbbr.${slot.role}`, { defaultValue: slot.role })}
                labelId={`national-xi-${i}`}
                value={lineup[i] ?? ""}
                onChange={(v) => setLineup((l) => { const n = slots.map((_, j) => (l[j] === v && j !== i ? "" : l[j] ?? "")); n[i] = v; return n; })}
                options={options}
                className="w-full"
              />
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button disabled={busy} onClick={() => void save()}>{t("nationalCoach.saveTactics")}</Button>
        {msg && <span className={`text-sm ${msg.ok ? "text-primary" : "text-destructive"}`}>{msg.text}</span>}
      </div>
    </section>
  );
}
