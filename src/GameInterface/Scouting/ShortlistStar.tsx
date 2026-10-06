import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";

/** Star toggle of the shortlist (`scouting.md` §5): add / remove a player. */
export function ShortlistStar({
  saveId, playerId, squadId, on, onChange, size = 16,
}: {
  saveId: string;
  playerId: string;
  squadId?: string;
  on: boolean;
  onChange?: (on: boolean) => void;
  size?: number;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = on
        ? await fetch(`/api/saves/${saveId}/scouting/shortlist/${encodeURIComponent(playerId)}`, { method: "DELETE" })
        : await fetch(`/api/saves/${saveId}/scouting/shortlist`, {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ playerId, squadId }),
          });
      if (r.ok) onChange?.(!on);
      else setError(r.status === 409 ? t("scouting.errors.shortlistFull") : t("warnings.errors.loadFailed"));
    } finally {
      setBusy(false);
    }
  }
  const label = error ?? (on ? t("scouting.shortlist.remove") : t("scouting.shortlist.add"));
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={label}
      aria-label={label}
      aria-pressed={on}
      className={`inline-flex items-center justify-center w-8 h-8 shrink-0 rounded bg-transparent border-0 cursor-pointer disabled:opacity-50 ${on ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
    >
      <Icon name={on ? "star-filled" : "star"} size={size} />
    </button>
  );
}
