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

interface PlayerScouting {
  view: ScoutView;
  report: ScoutReport | null;
  shortlisted: boolean;
  mission: ScoutAssignment | null;
}

/** "Knowledge" block of the player sheet (players outside the user's club, `scouting.md`). */
export function PlayerKnowledgePanel({ saveId, playerId, squadId }: { saveId: string; playerId: string; squadId: string }) {
  const { t } = useTranslation();
  const [info, setInfo] = useState<PlayerScouting | null>(null);
  const [scouting, setScouting] = useState<ScoutingData | null>(null);
  const [scoutId, setScoutId] = useState<string | null>(null);
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

  async function observe() {
    if (!chosen || !scouting) return;
    setError(null);
    const r = await scoutingCall(`/api/saves/${saveId}/scouting/missions`, "POST", {
      scoutId: chosen, target: { kind: "player", playerId, squadId }, weeks: scouting.weeks.player,
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
          {t("scouting.beingObserved", { done: info.mission.weeksDone, total: info.mission.weeks })}
        </p>
      ) : info.view.knowledge < 100 && scouting?.employed && (
        free.length === 0 ? (
          <p className="text-sm text-muted-foreground m-0">{t("scouting.noFreeScout")}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <OptionChips<string>
              value={chosen}
              onChange={setScoutId}
              options={free.map((s) => ({ key: s.id, label: s.chief ? t("scouting.chief") : s.name }))}
            />
            <Button onClick={() => void observe()}>
              <Icon name="binoculars" size={16} />
              {t("scouting.observe")}
            </Button>
          </div>
        )
      )}
      {error && <Notice kind="error">{error}</Notice>}
    </section>
  );
}
