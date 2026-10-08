import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/GameInterface/Components/Modal";
import { ConfirmDialog } from "@/GameInterface/Components/ConfirmDialog";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { Chip } from "@/GameInterface/ui/Chip";
import { Button } from "@/GameInterface/ui/Button";
import { Notice } from "@/GameInterface/ui/Notice";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { Icon } from "@/GameInterface/Icons";
import { formatFee } from "@/Domain/money";
import { leagueLabel } from "@/Domain/world/labels";
import type { LeagueData } from "@/types/playerTypes";
import type { ScoutFocus, ScoutTargetKind } from "@/types/scoutingTypes";
import { scoutingCall, type ScoutingData, type ScoutingScout } from "@/GameInterface/Scouting/scoutingApi";
import { targetLabel } from "@/GameInterface/Scouting/scoutingText";
import { StaffStars } from "@/GameInterface/Staff/StaffStars";
import countriesRaw from "@/Data/countries.json";

const CONTINENT_OF = new Map(Object.values(countriesRaw as Record<string, { name: string; continent?: string }>).map((c) => [c.name, c.continent ?? ""]));

type Region = Exclude<ScoutTargetKind, "player">;

/** Missions tab of the scouting centre: one card per scout, cancel, and the "new mission" modal. */
export function MissionsTab({
  saveId, data, leagues, onChanged,
}: {
  saveId: string;
  data: ScoutingData;
  leagues: LeagueData[];
  onChanged: (next?: ScoutingData) => void;
}) {
  const { t, i18n } = useTranslation();
  const [newFor, setNewFor] = useState<ScoutingScout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<ScoutingScout | null>(null);
  const [busy, setBusy] = useState(false);

  async function cancel(id: string) {
    const r = await scoutingCall(`/api/saves/${saveId}/scouting/missions/${id}`, "DELETE");
    if (r.ok) onChanged(r.json as ScoutingData);
    else setError(t("warnings.errors.loadFailed"));
  }

  // Field scouts are coaching staff (`.claude/rules/game/staff.md`): dismissed by the general fire
  // route (severance, back to the free pool; his mission is cancelled).
  async function dismiss() {
    if (!dismissing) return;
    setBusy(true);
    try {
      const r = await scoutingCall(`/api/saves/${saveId}/staff/fire`, "POST", { memberId: dismissing.id });
      if (r.ok) onChanged();
      else setError(t("warnings.errors.loadFailed"));
    } finally {
      setBusy(false);
      setDismissing(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {!data.employed && <Notice kind="warning">{t("scouting.noClub")}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.scouts.map((scout) => {
          const mission = data.missions.find((m) => m.scoutId === scout.id);
          return (
            <div key={scout.id} className="rounded-md border border-border bg-card p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0">
                    {scout.chief ? t("scouting.chief") : t("scouting.fieldScout")}
                  </p>
                  <p className="font-display font-black uppercase text-base leading-none m-0 mt-1 truncate">
                    {scout.vacant ? t("scouting.vacant") : scout.name}
                  </p>
                </div>
                <span className="shrink-0"><StaffStars stars={scout.stars} /></span>
              </div>
              {mission ? (
                <>
                  <div>
                    <p className="text-sm text-foreground m-0 font-semibold">
                      {t(`scouting.kind.${mission.target.kind}`)} · {targetLabel(mission.target, t, leagues, i18n.language)}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="flex-1 h-1.5 rounded bg-border overflow-hidden">
                        <span className="block h-full bg-primary" style={{ width: `${Math.min(100, (mission.weeksDone / mission.weeks) * 100)}%` }} />
                      </span>
                      <span className="text-sm tabular-nums text-muted-foreground">{t("scouting.weeksProgress", { done: mission.weeksDone, total: mission.weeks })}</span>
                    </div>
                    <p className="text-sm text-muted-foreground m-0 mt-2 tabular-nums">
                      {t("scouting.weeklyCost", { cost: formatFee(mission.weeklyCost) })} · {t("scouting.observedCount", { count: mission.observed })}
                    </p>
                  </div>
                  <Button variant="danger" flush onClick={() => void cancel(mission.id)} className="self-start">
                    {t("scouting.cancelMission")}
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground m-0">{t("scouting.idle")}</p>
                  <Button onClick={() => setNewFor(scout)} disabled={!data.employed} className="self-start">
                    <Icon name="binoculars" size={16} />
                    {t("scouting.newMission")}
                  </Button>
                </>
              )}
              {!scout.chief && (
                <Button variant="danger" flush onClick={() => setDismissing(scout)} disabled={!data.employed} className="self-start">
                  {t("staff.fire")}
                </Button>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground m-0">{t("scouting.fieldScoutsHint", { max: data.maxFieldScouts })}</p>
        <Button
          variant="secondary"
          disabled={!data.employed || data.scouts.filter((x) => !x.chief).length >= data.maxFieldScouts}
          onClick={() => { window.location.href = "/transfers?tab=staff&role=fieldScout"; }}
        >
          {t("scouting.findScouts")}
        </Button>
      </div>
      <ConfirmDialog
        open={dismissing !== null}
        title={t("staff.fireConfirmTitle", { name: dismissing?.name ?? "" })}
        body={t("staff.scouts.fireConfirmBody")}
        confirmLabel={t("staff.fire")}
        onConfirm={() => void dismiss()}
        onClose={() => setDismissing(null)}
        busy={busy}
      />
      <NewMissionModal
        saveId={saveId}
        scout={newFor}
        data={data}
        leagues={leagues}
        onClose={() => setNewFor(null)}
        onCreated={(next) => { setNewFor(null); onChanged(next); }}
      />
    </div>
  );
}

function NewMissionModal({
  saveId, scout, data, leagues, onClose, onCreated,
}: {
  saveId: string;
  scout: ScoutingScout | null;
  data: ScoutingData;
  leagues: LeagueData[];
  onClose: () => void;
  onCreated: (next: ScoutingData) => void;
}) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<Region>("country");
  const [country, setCountry] = useState("");
  const [league, setLeague] = useState("");
  const [continent, setContinent] = useState("");
  const [weeks, setWeeks] = useState<string>("4");
  const [line, setLine] = useState<string>("all");
  const [maxAge, setMaxAge] = useState<string>("any");
  const [improves, setImproves] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const countries = useMemo(() => [...new Set(leagues.map((l) => l.country).filter(Boolean))].sort(), [leagues]);
  const continents = useMemo(() => [...new Set(countries.map((c) => CONTINENT_OF.get(c) ?? "").filter(Boolean))].sort(), [countries]);
  const weekOptions = kind === "continent" ? data.weeks.continent : kind === "youth" ? data.weeks.youth : data.weeks.region;
  const weeksValue = weekOptions.map(String).includes(weeks) ? weeks : String(weekOptions[0]);

  async function submit() {
    if (!scout) return;
    const target = kind === "league" ? { kind, league } : kind === "continent" ? { kind, continent } : { kind, country };
    const focus: ScoutFocus = {
      ...(line !== "all" ? { line: line as ScoutFocus["line"] } : {}),
      ...(maxAge !== "any" ? { maxAge: Number(maxAge) } : {}),
      ...(improves ? { improves: true } : {}),
    };
    setBusy(true);
    setError(null);
    const r = await scoutingCall(`/api/saves/${saveId}/scouting/missions`, "POST", {
      scoutId: scout.id, target, weeks: Number(weeksValue), ...(Object.keys(focus).length > 0 ? { focus } : {}),
    });
    setBusy(false);
    if (r.ok) onCreated(r.json as ScoutingData);
    else setError(t(`scouting.errors.${r.json?.error ?? "generic"}`, { defaultValue: t("scouting.errors.generic") }));
  }

  const ready = kind === "league" ? !!league : kind === "continent" ? !!continent : !!country;
  return (
    <Modal open={!!scout} onClose={onClose} size="md">
      <div className="p-6 flex flex-col gap-5">
        <SectionTitle>{t("scouting.newMission")}</SectionTitle>
        {scout && (
          <p className="text-sm text-muted-foreground m-0 flex flex-wrap items-center gap-2">
            <span>{scout.vacant ? t("scouting.vacant") : scout.name}</span>
            <StaffStars stars={scout.stars} />
          </p>
        )}
        <div className="flex flex-col gap-2">
          <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t("scouting.targetLabel")}</span>
          <OptionChips<Region>
            value={kind}
            onChange={setKind}
            options={(["country", "league", "continent", "youth"] as const).map((k) => ({ key: k, label: t(`scouting.kind.${k}`) }))}
          />
        </div>
        {(kind === "country" || kind === "youth") && (
          <SelectCombobox
            label={t("scouting.country")}
            value={country}
            onChange={setCountry}
            options={countries.map((c) => ({ value: c, label: c, group: CONTINENT_OF.get(c) ?? "" }))
              .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label))}
            placeholder={t("scouting.pickCountry")}
          />
        )}
        {kind === "league" && (
          <SelectCombobox
            label={t("scouting.league")}
            value={league}
            onChange={setLeague}
            options={leagues.map((l) => ({ value: l.slug, label: leagueLabel(l, l.country) }))}
            placeholder={t("scouting.pickLeague")}
          />
        )}
        {kind === "continent" && (
          <OptionChips<string>
            value={continent || null}
            onChange={setContinent}
            options={continents.map((c) => ({ key: c, label: t(`scouting.continents.${c}`, { defaultValue: c }) }))}
          />
        )}
        <div className="flex flex-col gap-2">
          <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t("scouting.duration")}</span>
          <OptionChips<string>
            value={weeksValue}
            onChange={setWeeks}
            options={weekOptions.map((w) => ({ key: String(w), label: t("scouting.weeksN", { n: w }) }))}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t("scouting.focus")}</span>
          <OptionChips<string>
            value={line}
            onChange={setLine}
            options={["all", "GK", "Defender", "Midfielder", "Forward"].map((l) => ({ key: l, label: t(`scouting.lines.${l}`) }))}
          />
          <OptionChips<string>
            value={maxAge}
            onChange={setMaxAge}
            options={["any", "21", "23", "25"].map((a) => ({ key: a, label: a === "any" ? t("scouting.anyAge") : t("scouting.maxAge", { age: a }) }))}
          />
          <div>
            <Chip selected={improves} onClick={() => setImproves(!improves)}>{t("scouting.improves")}</Chip>
          </div>
        </div>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => void submit()} disabled={!ready || busy}>{t("scouting.send")}</Button>
        </div>
      </div>
    </Modal>
  );
}
