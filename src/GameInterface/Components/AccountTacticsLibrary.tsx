// The tactics kept in the account (tester report 2026-11-18): a saved line-up's code (`exportPreset`) stored per user,
// so it can be used in any save without copying a code by hand.
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/GameInterface/ui/Button";
import { Icon } from "@/GameInterface/Icons";

export interface AccountTactic { id: string; name: string; code: string; savedAt: string }

export function useAccountTactics() {
  const [tactics, setTactics] = useState<AccountTactic[] | null>(null);
  const [max, setMax] = useState(30);
  const load = useCallback(() => {
    void fetch("/api/account/tactics")
      .then((r) => (r.ok ? (r.json() as Promise<{ tactics: AccountTactic[]; max: number }>) : null))
      .then((d) => {
        if (d) { setTactics(d.tactics); setMax(d.max); } else setTactics([]);
      })
      .catch(() => setTactics([]));
  }, []);
  useEffect(() => load(), [load]);
  /** Keeps a code with a name; the error code of a refusal, or null. */
  const keep = useCallback(async (name: string, code: string): Promise<string | null> => {
    try {
      const res = await fetch("/api/account/tactics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code }),
      });
      if (!res.ok) return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "generic";
      load();
      return null;
    } catch {
      return "generic";
    }
  }, [load]);
  const remove = useCallback(async (id: string) => {
    await fetch(`/api/account/tactics/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
    load();
  }, [load]);
  return { tactics, max, keep, remove };
}

export function AccountTacticsLibrary({ tactics, max, busy, freeSlot, onUse, onRemove }: {
  tactics: AccountTactic[] | null;
  max: number;
  busy: boolean;
  /** The first empty slot, where "Use" puts the tactic; null = all six taken. */
  freeSlot: string | null;
  onUse: (tactic: AccountTactic) => void;
  onRemove: (tactic: AccountTactic) => void;
}) {
  const { t, i18n } = useTranslation();
  const [confirm, setConfirm] = useState<string | null>(null);
  const fmt = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(i18n.language, { day: "2-digit", month: "2-digit", year: "numeric" });
  return (
    <div className="mb-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
          {t("formations.presets.account.title")}
        </span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {t("formations.presets.account.count", { count: tactics?.length ?? 0, max })}
        </span>
      </div>
      {tactics && tactics.length === 0 && <p className="m-0 text-sm text-muted-foreground">{t("formations.presets.account.empty")}</p>}
      {tactics && tactics.length > 0 && (
        <ul className="m-0 p-0 list-none flex flex-col divide-y divide-border/50 rounded-md border border-border">
          {tactics.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <Icon name="cloud" size={16} className="text-primary shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-foreground truncate">{x.name}</span>
                <span className="block text-sm text-muted-foreground">{t("formations.presets.account.savedOn", { date: fmt(x.savedAt) })}</span>
              </span>
              {confirm === x.id ? (
                <>
                  <Button variant="danger" disabled={busy} onClick={() => { setConfirm(null); onRemove(x); }}>
                    {t("formations.presets.account.confirmRemove")}
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirm(null)}>{t("common.cancel")}</Button>
                </>
              ) : (
                <>
                  <Button
                    disabled={busy || !freeSlot}
                    title={freeSlot ? undefined : t("formations.presets.noFreeSlot")}
                    onClick={() => onUse(x)}
                  >
                    {t("formations.presets.account.use", { key: freeSlot ?? "" })}
                  </Button>
                  <Button
                    variant="danger"
                    disabled={busy}
                    aria-label={t("formations.presets.account.remove", { name: x.name })}
                    title={t("formations.presets.account.remove", { name: x.name })}
                    className="!px-2"
                    onClick={() => setConfirm(x.id)}
                  >
                    <Icon name="trash2" size={16} />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
