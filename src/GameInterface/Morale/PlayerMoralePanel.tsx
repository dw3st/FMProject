import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { Button } from "@/GameInterface/ui/Button";
import { Label } from "@/GameInterface/ui/Label";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { MoraleBadge } from "@/GameInterface/Components/MoraleBadge";
import { TalkModal } from "@/GameInterface/Morale/TalkModal";
import { PromiseLine } from "@/GameInterface/Morale/MoralePromises";
import { useMorale } from "@/GameInterface/Morale/useMorale";
import { SQUAD_STATUSES, type SquadStatus } from "@/types/moraleTypes";

/**
 * Morale block of the player screen (own player only, `.claude/rules/game/morale.md`): morale with
 * the 7-day trend, squad status (editable), expected vs played minutes, open promises, Talk.
 */
export function PlayerMoralePanel({
  saveId, playerId, playerName, onRenew, onChanged,
}: {
  saveId: string;
  playerId: string;
  playerName: string;
  /** A renewal was promised: open the renewal. */
  onRenew: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const { data, reload } = useMorale(saveId);
  const [talkOpen, setTalkOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // The chip just clicked, shown while the PUT and the morale reload are in flight.
  const [pending, setPending] = useState<SquadStatus | "auto" | null>(null);
  const row = data?.players.find((p) => p.id === playerId);
  if (!data || !row) return null;
  const talk = data.talks.find((x) => x.playerId === playerId) ?? null;
  const promises = data.promises.filter((p) => p.playerId === playerId);

  async function setStatus(key: SquadStatus | "auto") {
    if (saving) return;
    setSaving(true);
    setPending(key);
    try {
      const res = await fetch(`/api/saves/${saveId}/players/${encodeURIComponent(playerId)}/squad-status`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: key === "auto" ? null : key }),
      });
      if (!res.ok) { setPending(null); return; }
      // Only this panel and the club squad in the background: never remount the player screen.
      await reload();
      setPending(null);
      onChanged();
    } catch {
      setPending(null);
    } finally {
      setSaving(false);
    }
  }

  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display font-black uppercase text-xl leading-none m-0">{t("morale.sectionTitle")}</h2>
        <Button onClick={() => setTalkOpen(true)}>
          <Icon name="talk" size={16} />
          {talk ? t("morale.talk.answerRequest") : t("morale.talk.open")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <MoraleBadge morale={row.morale} showValue />
        {row.trend !== null && row.trend !== 0 && (
          <span className={`inline-flex items-center gap-1 text-sm tabular-nums ${row.trend > 0 ? "text-chart-2" : "text-destructive"}`}>
            <Icon name={row.trend > 0 ? "trend-up" : "trend-down"} size={16} />
            {t("morale.trend", { value: `${row.trend > 0 ? "+" : ""}${fmt(row.trend)}` })}
          </span>
        )}
        <span className="text-sm text-muted-foreground tabular-nums">
          {t("morale.expected", { lo: row.expected[0], hi: row.expected[1] })}
          {row.played !== null ? ` · ${t("morale.played", { n: fmt(Math.round(row.played * 10) / 10) })}` : ""}
        </span>
        {row.transferRequest && <span className="text-sm font-semibold text-destructive">{t("morale.transferRequest")}</span>}
        {talk && <span className="text-sm font-semibold text-chart-4">{t(`morale.reason.${talk.reason}`, { club: talk.clubName ?? "" })}</span>}
      </div>

      <div className="space-y-2">
        <Label>{t("morale.statusLabel")}</Label>
        <OptionChips
          aria-label={t("morale.statusLabel")}
          options={[
            { key: "auto" as const, label: t("morale.statusAuto", { status: t(`morale.status.${row.suggested}`) }) },
            ...SQUAD_STATUSES.map((s) => ({ key: s, label: t(`morale.status.${s}`) })),
          ]}
          value={pending ?? (row.manualStatus ? row.status : "auto")}
          onChange={(k) => void setStatus(k)}
          disabled={saving}
        />
      </div>

      {promises.length > 0 && (
        <div className="space-y-1">
          <Label>{t("morale.promisesTitle")}</Label>
          <ul className="list-none m-0 p-0 space-y-1">
            {promises.map((p) => <li key={p.id}><PromiseLine promise={p} showName={false} /></li>)}
          </ul>
        </div>
      )}

      {talkOpen && (
        <TalkModal
          saveId={saveId}
          player={{ id: playerId, name: playerName }}
          reason={talk?.reason ?? null}
          clubName={talk?.clubName}
          onClose={() => setTalkOpen(false)}
          onDone={(r) => {
            reload();
            onChanged();
            if (r.openRenewal) { setTalkOpen(false); onRenew(); }
          }}
        />
      )}
    </section>
  );
}
