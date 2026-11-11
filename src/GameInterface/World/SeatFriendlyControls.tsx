import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { formatGameDate } from "@/GameInterface/formatDate";
import { Button } from "@/GameInterface/ui/Button";

/** A friendly between two managers as the asking seat sees it (`/api/worlds/:id/friendlies`, 9.5). */
export interface SeatFriendlyView {
  id: string;
  date: string;
  status: "pending" | "accepted" | "declined" | "cancelled" | "played";
  /** He invited (plays at home). */
  mine: boolean;
  otherSeat: string;
  otherManager: string;
  otherClub: string;
  score?: { home: number; away: number };
}

/** The seat's friendlies, reloaded after each action. */
export function useSeatFriendlies(): { list: SeatFriendlyView[]; reload: () => Promise<void>; saveId: string | undefined } {
  const { session } = useGameSave();
  const saveId = session?.saveId;
  const [list, setList] = useState<SeatFriendlyView[]>([]);
  const reload = useCallback(async () => {
    if (!saveId) return;
    try {
      const res = await fetch(`/api/worlds/${saveId}/friendlies`);
      if (!res.ok) return;
      setList(((await res.json()) as { friendlies: SeatFriendlyView[] }).friendlies);
    } catch { /* offline: keep the last list */ }
  }, [saveId]);
  useEffect(() => { void reload(); }, [reload]);
  return { list, reload, saveId };
}

async function act(saveId: string, path: string, body: unknown): Promise<string | null> {
  const res = await fetch(`/api/worlds/${saveId}/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (res.ok) return null;
  return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "generic";
}

/** The friendly line of a friend on the Rivals card: invite, answer, or the day already set. */
export function SeatFriendlyLine({ seatId, list, saveId, reload }: {
  seatId: string; list: SeatFriendlyView[]; saveId: string | undefined; reload: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = list.find((f) => f.otherSeat === seatId && (f.status === "pending" || f.status === "accepted"));
  const day = (d: string) => formatGameDate(d, i18n.language);

  async function run(path: string, body: unknown) {
    if (!saveId) return;
    setBusy(true);
    setError(null);
    const code = await act(saveId, path, body);
    if (code) setError(t(`seatFriendly.errors.${code}`, { defaultValue: t("seatFriendly.errors.generic") }));
    await reload();
    setBusy(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!open ? (
        <Button variant="secondary" className="h-8 px-3" disabled={busy} onClick={() => void run("friendlies", { seat: seatId })}>
          {t("seatFriendly.invite")}
        </Button>
      ) : open.status === "accepted" ? (
        <>
          <span className="text-sm text-foreground tabular-nums">{t("seatFriendly.set", { date: day(open.date) })}</span>
          <Button variant="secondary" className="h-8 px-3" disabled={busy} onClick={() => void run(`friendlies/${open.id}`, { action: "cancel" })}>{t("seatFriendly.cancel")}</Button>
        </>
      ) : open.mine ? (
        <>
          <span className="text-sm text-muted-foreground tabular-nums">{t("seatFriendly.waiting", { date: day(open.date) })}</span>
          <Button variant="secondary" className="h-8 px-3" disabled={busy} onClick={() => void run(`friendlies/${open.id}`, { action: "cancel" })}>{t("seatFriendly.cancel")}</Button>
        </>
      ) : (
        <SeatFriendlyAnswer friendlyId={open.id} date={open.date} onDone={reload} />
      )}
      {error && <span role="alert" className="text-sm text-destructive">{error}</span>}
    </div>
  );
}

/** Accept / decline an invitation (Rivals card and inbox). */
export function SeatFriendlyAnswer({ friendlyId, date, onDone }: { friendlyId: string; date: string; onDone?: () => Promise<void> | void }) {
  const { t, i18n } = useTranslation();
  const { session } = useGameSave();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  async function answer(action: "accept" | "decline") {
    if (!session?.saveId) return;
    setBusy(true);
    const code = await act(session.saveId, `friendlies/${friendlyId}`, { action });
    setResult(code ? t(`seatFriendly.errors.${code}`, { defaultValue: t("seatFriendly.errors.generic") }) : t(action === "accept" ? "seatFriendly.accepted" : "seatFriendly.declined"));
    await onDone?.();
    setBusy(false);
  }
  if (result) return <span className="text-sm text-muted-foreground">{result}</span>;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-foreground tabular-nums">{t("seatFriendly.invited", { date: formatGameDate(date, i18n.language) })}</span>
      <Button className="h-8 px-3" disabled={busy} onClick={() => void answer("accept")}>{t("seatFriendly.accept")}</Button>
      <Button variant="secondary" className="h-8 px-3" disabled={busy} onClick={() => void answer("decline")}>{t("seatFriendly.decline")}</Button>
    </span>
  );
}
