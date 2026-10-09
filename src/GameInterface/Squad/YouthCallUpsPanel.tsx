import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { positionLabel, positionLabelColor } from "@/GameInterface/positionHelpers";
import { Button } from "@/GameInterface/ui/Button";
import { Chip } from "@/GameInterface/ui/Chip";
import { Notice } from "@/GameInterface/ui/Notice";
import { YOUTH_COMP } from "@/Domain/youthComps/youthCompConfig";
import type { YouthEligible, YouthNextGame } from "@/backend/youthCompRoutes";
import type { YouthCompAge } from "@/types/youthCompTypes";

interface CallUpsData {
  next: Partial<Record<YouthCompAge, YouthNextGame>>;
  callUps: Partial<Record<YouthCompAge, string[]>>;
  skipped: Partial<Record<YouthCompAge, { date: string; players: { id: string; name: string }[] }>>;
  eligible: Record<YouthCompAge, YouthEligible[]>;
}

const AGES: YouthCompAge[] = ["u21", "u19"];

/** Toggles one id in a call-up list, never past the cap. */
export function toggleCallUp(list: string[], id: string, max: number = YOUTH_COMP.MAX_CALL_UPS): string[] {
  if (list.includes(id)) return list.filter((x) => x !== id);
  return list.length >= max ? list : [...list, id];
}

/** "Youth games" block of the Academy tab: next game of each competition and the call-ups for it. */
export function YouthCallUpsPanel() {
  const { t, i18n } = useTranslation();
  const { session } = useGameSave();
  const saveId = session?.saveId;
  const [data, setData] = useState<CallUpsData | null>(null);
  const [draft, setDraft] = useState<Partial<Record<YouthCompAge, string[]>>>({});
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
        body: JSON.stringify({ [age]: draft[age] ?? [] }),
      });
      if (!res.ok) setFailed(true);
      else setSaved(age);
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
                <div className="flex flex-wrap gap-2">
                  {data.eligible[age].map((p) => (
                    <Chip
                      key={p.id}
                      selected={list.includes(p.id)}
                      disabled={!list.includes(p.id) && list.length >= YOUTH_COMP.MAX_CALL_UPS}
                      onClick={() => setDraft((d) => ({ ...d, [age]: toggleCallUp(d[age] ?? [], p.id) }))}
                      title={`${p.name} · ${p.age} · ${t("youthComps.callUps.fitness", { n: Math.round(p.fitness) })}`}
                    >
                      <span className={positionLabelColor(p.role, p.role)}>{positionLabel(t, p.role, p.role)}</span>
                      <span>{p.name}</span>
                      <span className="tabular-nums">{p.age}</span>
                    </Chip>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <Button disabled={saving !== null} onClick={() => void save(age)}>
                    {t("youthComps.callUps.save")}
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
