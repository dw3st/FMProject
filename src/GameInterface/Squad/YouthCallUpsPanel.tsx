import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { positionLabel, positionLabelColor } from "@/GameInterface/positionHelpers";
import { Button } from "@/GameInterface/ui/Button";
import { Chip } from "@/GameInterface/ui/Chip";
import { Notice } from "@/GameInterface/ui/Notice";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { YOUTH_COMP } from "@/Domain/youthComps/youthCompConfig";
import { groupByPosition } from "@/Domain/positions/positionSort";
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

/** What is left of a call-up, shown small on its chip: games left, "∞" or the rhythm streak. */
export function callUpLeftLabel(c: YouthCallUp, t: (key: string, o?: Record<string, unknown>) => string): string {
  if (c.duration === "indefinite") return "∞";
  if (c.duration === "rhythm") return t("youthComps.callUps.rhythmLeft", { n: c.streak ?? 0, of: CALL_UP_RULES.RHYTHM_GAMES });
  return String(c.left ?? CALL_UP_RULES.GAMES[c.duration] ?? 1);
}

/** "Youth games" block of the Academy tab: next game of each competition and the call-ups for it. */
export function YouthCallUpsPanel() {
  const { t, i18n } = useTranslation();
  const { session } = useGameSave();
  const saveId = session?.saveId;
  const [data, setData] = useState<CallUpsData | null>(null);
  const [draft, setDraft] = useState<Partial<Record<YouthCompAge, YouthCallUp[]>>>({});
  const [duration, setDuration] = useState<CallUpDuration>("next");
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState<YouthCompAge | null>(null);
  const [saved, setSaved] = useState<YouthCompAge | null>(null);

  const load = useCallback(() => {
    if (!saveId) return;
    fetch(`/api/saves/${saveId}/youth-callups`)
      .then((r) => (r.ok ? (r.json() as Promise<CallUpsData>) : Promise.reject(new Error("load"))))
      .then((d) => {
        setData(d);
        setDraft(d.callUps);
      })
      .catch(() => setFailed(true));
  }, [saveId]);
  useEffect(load, [load]);

  async function save(age: YouthCompAge) {
    if (!saveId) return;
    setSaving(age);
    setSaved(null);
    try {
      const res = await fetch(`/api/saves/${saveId}/youth-callups`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [age]: (draft[age] ?? []).map((c) => ({ id: c.id, duration: c.duration })) }),
      });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const body = (await res.json()) as { callUps: Partial<Record<YouthCompAge, YouthCallUp[]>> };
      setDraft((d) => ({ ...d, [age]: body.callUps[age] ?? [] }));
      setSaved(age);
    } finally {
      setSaving(null);
    }
  }

  if (failed && !data) return <Notice kind="error">{t("warnings.errors.loadFailed")}</Notice>;
  if (!data) return <p className="text-sm text-muted-foreground m-0">{t("youth.loading")}</p>;
  const ages = AGES.filter((a) => data.next[a] || data.skipped[a]);
  if (ages.length === 0) return null;
  const fmt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(i18n.language, { day: "numeric", month: "short" });

  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("youthComps.callUps.title")}</h3>
        <p className="text-sm text-muted-foreground m-0 mt-1">{t("youthComps.callUps.hint", { n: YOUTH_COMP.MAX_CALL_UPS })}</p>
      </div>
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
      {failed && <Notice kind="error">{t("youthComps.callUps.failed")}</Notice>}
      {ages.map((age) => {
        const next = data.next[age];
        const list = draft[age] ?? [];
        const skipped = data.skipped[age];
        return (
          <div key={age} className="space-y-3 rounded-md border border-border p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
                {t(`youthComps.${age}`)}
              </span>
              <span className="text-sm">
                {next
                  ? t("youthComps.callUps.next", {
                      opponent: next.opponentName,
                      venue: t(`youthComps.callUps.venue.${next.home ? "home" : "away"}`),
                      date: fmt(next.date),
                    })
                  : t("youthComps.callUps.noGame")}
              </span>
              <span className="ml-auto text-sm text-muted-foreground tabular-nums">
                {t("youthComps.callUps.count", { n: list.length, max: YOUTH_COMP.MAX_CALL_UPS })}
              </span>
            </div>
            {skipped && skipped.players.length > 0 && (
              <Notice kind="warning">
                {t("youthComps.callUps.skipped", { date: fmt(skipped.date), names: skipped.players.map((p) => p.name).join(", ") })}
              </Notice>
            )}
            {next && (
              <>
                {/* One column per detailed position (#159), in squad order. */}
                <div className="grid gap-x-3 gap-y-4 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
                  {groupByPosition(data.eligible[age], (p) => p.role).map((group) => (
                    <div key={group.role} className="flex flex-col gap-2">
                      <span className={`font-display font-bold uppercase tracking-[0.08em] text-[13px] ${positionLabelColor(group.role, group.role)}`}>
                        {t(`roles.detailed.${group.role}`, { defaultValue: positionLabel(t, group.role, group.role) })}
                      </span>
                      {group.items.map((p) => {
                        const callUp = list.find((c) => c.id === p.id);
                        return (
                          <Chip
                            key={p.id}
                            className="w-full !justify-between"
                            selected={callUp !== undefined}
                            disabled={!callUp && list.length >= YOUTH_COMP.MAX_CALL_UPS}
                            onClick={() => setDraft((d) => ({ ...d, [age]: toggleCallUp(d[age] ?? [], p.id, duration) }))}
                            title={`${p.name} · ${p.age} · ${t("youthComps.callUps.fitness", { n: Math.round(p.fitness) })}${
                              callUp ? ` · ${t(`youthComps.callUps.duration.${callUp.duration}`)}` : ""}`}
                          >
                            <span className="truncate">{p.name}</span>
                            <span className="flex items-center gap-1.5">
                              <span className="tabular-nums">{p.age}</span>
                              {callUp && (
                                <span className="rounded border border-primary/40 px-1.5 text-sm normal-case tracking-normal tabular-nums">
                                  {callUpLeftLabel(callUp, t)}
                                </span>
                              )}
                            </span>
                          </Chip>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button disabled={saving !== null} onClick={() => void save(age)}>
                    {t("youthComps.callUps.save")}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={list.length === 0}
                    onClick={() => setDraft((d) => ({ ...d, [age]: applyCallUpDuration(d[age] ?? [], duration) }))}
                  >
                    {t("youthComps.callUps.applyAll")}
                  </Button>
                  {saved === age && <span className="text-sm text-muted-foreground">{t("youthComps.callUps.saved")}</span>}
                </div>
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}
