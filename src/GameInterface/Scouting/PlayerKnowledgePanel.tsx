import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { Button } from "@/GameInterface/ui/Button";
import { Notice } from "@/GameInterface/ui/Notice";
import { Icon } from "@/GameInterface/Icons";
import type { ScoutAssignment, ScoutReport, ScoutView } from "@/types/scoutingTypes";
import { KnowledgeBar } from "@/GameInterface/Scouting/KnowledgeBar";
import { ShortlistStar } from "@/GameInterface/Scouting/ShortlistStar";
import { GemBadge, GradeBadge } from "@/GameInterface/Scouting/Badges";
import { scoutingCall, type ScoutingData } from "@/GameInterface/Scouting/scoutingApi";
import { nationalityDisplayName } from "@/Domain/world/labels";
import { formatFee } from "@/Domain/money";

interface PlayerScouting {
  view: ScoutView;
  report: ScoutReport | null;
  shortlisted: boolean;
  mission: ScoutAssignment | null;
  /** Country of his club's league (free agent: ""). */
  country: string;
  /** Per free scout: weeks and travel cost to reach each knowledge level (4.47.12). */
  plans: { scoutId: string; levels: { level: number; weeks: number; cost: number; reaches: boolean }[] }[];
}

/** "Knowledge" block of the player sheet (players outside the user's club, `scouting.md`). */
export function PlayerKnowledgePanel({ saveId, playerId, squadId }: { saveId: string; playerId: string; squadId: string }) {
  const { t, i18n } = useTranslation();
  const [info, setInfo] = useState<PlayerScouting | null>(null);
  const [scouting, setScouting] = useState<ScoutingData | null>(null);
  const [scoutId, setScoutId] = useState<string | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, s] = await Promise.all([
      fetch(`/api/saves/${saveId}/scouting/player/${encodeURIComponent(playerId)}?squad=${encodeURIComponent(squadId)}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/saves/${saveId}/scouting`).then((r) => (r.ok ? r.json() : null)),
    ]).catch(() => [null, null]);
    setInfo(p as PlayerScouting | null);
    setScouting(s as ScoutingData | null);
  }, [saveId, playerId, squadId]);
  useEffect(() => { void load(); }, [load]);

  if (!info) return null;
  const free = (scouting?.scouts ?? []).filter((s) => !s.busy);
  const chosen = scoutId ?? free[0]?.id ?? null;
  const levels = info.plans?.find((p) => p.scoutId === chosen)?.levels ?? [];
  const plan = levels.find((l) => l.level === level) ?? levels[levels.length - 1] ?? null;

  async function observe() {
    if (!chosen || !scouting) return;
    setError(null);
    const r = await scoutingCall(`/api/saves/${saveId}/scouting/missions`, "POST", {
      scoutId: chosen, target: { kind: "player", playerId, squadId, ...(plan ? { knowledgeTarget: plan.level } : {}) },
      weeks: scouting.weeks.player,
    });
    if (r.ok) await load();
    else setError(t(`scouting.errors.${r.json?.error ?? "generic"}`, { defaultValue: t("scouting.errors.generic") }));
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <SectionTitle>{t("scouting.knowledge")}</SectionTitle>
        <ShortlistStar saveId={saveId} playerId={playerId} squadId={squadId} on={info.shortlisted} onChange={() => void load()} />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <KnowledgeBar value={info.view.knowledge} />
        <span className="text-sm text-muted-foreground tabular-nums">
          {info.view.seen ? t("scouting.seenOn", { date: info.view.seen }) : t("scouting.neverSeen")}
        </span>
        {info.report && (
          <span className="inline-flex items-center gap-2 text-sm">
            <GradeBadge grade={info.report.grade} />
            <span className="text-muted-foreground">{t(`scouting.text.${info.report.text}`)}</span>
            {info.report.gem && <GemBadge />}
          </span>
        )}
      </div>
      {info.view.knowledge < 60 && <Notice kind="warning">{t("scouting.lowKnowledge", { k: info.view.knowledge })}</Notice>}
      {info.mission ? (
        <p className="text-sm text-muted-foreground m-0 tabular-nums">
          {info.mission.target.knowledgeTarget
            ? t("scouting.beingObservedTo", { done: info.mission.weeksDone, level: info.mission.target.knowledgeTarget })
            : t("scouting.beingObserved", { done: info.mission.weeksDone, total: info.mission.weeks })}
        </p>
      ) : info.view.knowledge < 100 && scouting?.employed && (
        free.length === 0 ? (
          <p className="text-sm text-muted-foreground m-0">{t("scouting.noFreeScout")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <OptionChips<string>
              value={chosen}
              onChange={setScoutId}
              options={free.map((s) => {
                // Each scout's knowledge of the player's country (it sets his pace there); free agent: "—".
                const k = info.country ? `${s.countries?.[info.country] ?? 0}` : "—";
                return { key: s.id, label: `${s.chief ? t("scouting.chief") : s.name} · ${k}` };
              })}
            />
            {levels.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t("scouting.observeTo")}</span>
                <OptionChips<string>
                  value={plan ? String(plan.level) : null}
                  onChange={(v) => setLevel(Number(v))}
                  options={levels.map((l) => ({ key: String(l.level), label: `${l.level}%` }))}
                />
                {plan && (
                  <p className="text-sm text-muted-foreground m-0 tabular-nums">
                    {t(plan.reaches ? "scouting.levelPlan" : "scouting.levelPlanShort", { count: plan.weeks, cost: formatFee(plan.cost), level: plan.level })}
                  </p>
                )}
              </div>
            )}
            <div>
              <Button onClick={() => void observe()}>
                <Icon name="binoculars" size={16} />
                {t("scouting.observe")}
              </Button>
            </div>
          </div>
        )
      )}
      {info.country && !info.mission && info.view.knowledge < 100 && scouting?.employed && free.length > 0 && (
        <p className="text-sm text-muted-foreground m-0">{t("scoutCountries.observeHint", { country: nationalityDisplayName(info.country, i18n.language, t) })}</p>
      )}
      {error && <Notice kind="error">{error}</Notice>}
    </section>
  );
}
