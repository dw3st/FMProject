import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MENTORING } from "@/Domain/personality/mentoring";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import type { MentoredTrait, RosterPlayer } from "@/types/playerTypes";

type Choice = MentoredTrait | "none";

/** The assistant's work on the mentality of the club's own player (`.claude/rules/game/personality.md`). */
export function MentoringPanel({ saveId, player, onChanged }: { saveId: string; player: RosterPlayer; onChanged?: () => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState<Choice>(player.mentoring?.trait ?? "none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (player.age > MENTORING.MAX_AGE && value === "none") {
    return <p className="text-sm text-muted-foreground m-0">{t("mentoring.tooOld", { age: MENTORING.MAX_AGE })}</p>;
  }

  async function choose(next: Choice) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/saves/${saveId}/players/${encodeURIComponent(player.id)}/mentoring`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trait: next === "none" ? null : next }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        const known = ["mentoringFull", "tooOld", "onLoan", "atBest"].includes(body.error ?? "");
        setError(t(`mentoring.errors.${known ? body.error : "generic"}`, { max: MENTORING.MAX_PLAYERS }));
        return;
      }
      setValue(next);
      onChanged?.();
    } catch {
      setError(t("mentoring.errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 max-w-3xl">
      <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t("mentoring.label")}</span>
      <OptionChips<Choice>
        aria-label={t("mentoring.label")}
        options={[
          { key: "none", label: t("mentoring.none") },
          { key: "professionalism", label: t("personality.trait.professionalism") },
          { key: "temperament", label: t("personality.trait.temperament") },
        ]}
        value={value}
        onChange={(k) => { if (k !== value) void choose(k); }}
        disabled={busy}
      />
      <p className="text-sm text-muted-foreground m-0">{t("mentoring.hint", { max: MENTORING.MAX_PLAYERS, young: MENTORING.YOUNG_AGE, old: MENTORING.MAX_AGE })}</p>
      {error && <p className="text-sm text-destructive m-0">{error}</p>}
    </div>
  );
}
