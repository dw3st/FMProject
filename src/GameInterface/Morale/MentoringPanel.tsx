import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MENTORING, nextMentoringGain, type MentoringRow } from "@/Domain/personality/mentoring";
import { daysBetween } from "@/Domain/dates";
import { formatGameDate } from "@/GameInterface/formatDate";
import type { MentoredTrait, RosterPlayer } from "@/types/playerTypes";

interface MentoringInfo {
  max: number;
  team: MentoringRow[];
  seasonEnd: string | null;
  goodAssistant: boolean;
  today: string;
}

const TRAITS: MentoredTrait[] = ["professionalism", "temperament"];
const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";

/**
 * The assistant's work on the mentality of the club's own player (`.claude/rules/game/personality.md`), option B of the
 * mock (tester report 2026-11-17): the two traits as cards, the progress of this player and the players the assistant
 * works with. With the assistant full, picking a trait asks who leaves the work to make room.
 */
export function MentoringPanel({ saveId, player, onChanged }: { saveId: string; player: RosterPlayer; onChanged?: () => void }) {
  const { t, i18n } = useTranslation();
  const [current, setCurrent] = useState<MentoredTrait | null>(player.mentoring?.trait ?? null);
  const [since, setSince] = useState<string | null>(player.mentoring?.since ?? null);
  const [info, setInfo] = useState<MentoringInfo | null>(null);
  const [pending, setPending] = useState<MentoredTrait | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch(`/api/saves/${saveId}/mentoring`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: MentoringInfo | null) => { if (alive) setInfo(d); })
      .catch(() => { if (alive) setInfo(null); });
    return () => { alive = false; };
  }, [saveId, reload]);

  if (player.age > MENTORING.MAX_AGE && !current) {
    return <p className="text-sm text-muted-foreground m-0">{t("mentoring.tooOld", { age: MENTORING.MAX_AGE })}</p>;
  }

  const date = (iso: string | null | undefined) => formatGameDate(iso, i18n.language, "long");
  const others = (info?.team ?? []).filter((r) => r.id !== player.id);
  const full = others.length >= (info?.max ?? MENTORING.MAX_PLAYERS);
  const gained = Math.abs(current ? player.personalityGrowth?.[current] ?? 0 : 0);

  async function save(trait: MentoredTrait | null, replace?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/saves/${saveId}/players/${encodeURIComponent(player.id)}/mentoring`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trait, ...(replace ? { replace } : {}) }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; mentoring?: { trait: MentoredTrait; since: string } | null };
      if (!res.ok) {
        const known = ["mentoringFull", "tooOld", "onLoan", "atBest"].includes(body.error ?? "");
        setError(t(`mentoring.errors.${known ? body.error : "generic"}`, { max: MENTORING.MAX_PLAYERS }));
        return;
      }
      setCurrent(body.mentoring?.trait ?? null);
      setSince(body.mentoring?.since ?? null);
      setPending(null);
      setReload((n) => n + 1);
      onChanged?.();
    } catch {
      setError(t("mentoring.errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  function pick(trait: MentoredTrait) {
    if (busy || trait === current) return;
    if (!current && full) { setPending(trait); return; }
    void save(trait);
  }

  const next = current && since && info?.seasonEnd
    ? nextMentoringGain(player.age, since, info.seasonEnd, info.goodAssistant)
    : null;
  const elapsed = since && info?.seasonEnd
    ? Math.max(0, Math.min(1, daysBetween(since, info.today) / Math.max(1, daysBetween(since, info.seasonEnd))))
    : 0;

  return (
    <div className="flex flex-col gap-3">
      <span className={LABEL}>{t("mentoring.label")}</span>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="flex flex-col gap-3 min-w-0">
          <div className="grid gap-3 grid-cols-1">
            {TRAITS.map((trait) => {
              const on = current === trait || pending === trait;
              const sub = current === trait && since
                ? t("mentoring.since", { date: date(since) })
                : current ? t("mentoring.switch") : t(`mentoring.what.${trait}`);
              return (
                <button
                  key={trait}
                  type="button"
                  disabled={busy}
                  aria-pressed={current === trait}
                  onClick={() => pick(trait)}
                  className={`flex items-center gap-4 rounded-lg border px-4 py-3 text-left cursor-pointer transition-colors disabled:opacity-60 ${
                    on ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/60"
                  }`}
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 font-display font-bold text-xl ${on ? "border-primary text-primary" : "border-foreground/80 text-foreground"}`}>
                    {t(`mentoring.letter.${trait}`)}
                  </span>
                  <span className="flex flex-col min-w-0 flex-1">
                    <span className={`font-display font-bold uppercase text-base leading-tight break-words ${on ? "text-primary" : "text-foreground"}`}>
                      {t(`personality.trait.${trait}`)}
                    </span>
                    <span className="text-sm text-muted-foreground line-clamp-2">{sub}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {current && (
            <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-2">
              <span className={LABEL}>{t("mentoring.progress")}</span>
              <span className="text-sm font-semibold text-primary tabular-nums">
                {gained > 0 ? t("mentoring.gained", { n: gained.toLocaleString(i18n.language), trait: t(`personality.trait.${current}`).toLowerCase() }) : t("mentoring.notYet")}
              </span>
              {info?.seasonEnd && (
                <>
                  <div className="h-1.5 rounded bg-border overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${Math.round(elapsed * 100)}%` }} />
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground tabular-nums">
                    <span>{t("mentoring.today", { date: date(info.today) })}</span>
                    <span className="text-foreground">
                      {next?.counts
                        ? t("mentoring.nextGain", { date: date(info.seasonEnd), n: next.amount.toLocaleString(i18n.language) })
                        : t("mentoring.countsNextSeason", { date: date(info.seasonEnd), days: MENTORING.MIN_DAYS })}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {current && (
            <div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void save(null)}
                className="inline-flex h-10 items-center justify-center rounded-md border border-destructive/60 bg-transparent px-5 text-sm font-semibold text-destructive hover:bg-destructive/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t("mentoring.stop")}
              </button>
            </div>
          )}

          {pending && (
            <p className="text-sm text-chart-4 m-0">{t("mentoring.pickSwap", { trait: t(`personality.trait.${pending}`).toLowerCase() })}</p>
          )}
          <p className="text-sm text-muted-foreground m-0">{t("mentoring.hint", { max: MENTORING.MAX_PLAYERS, young: MENTORING.YOUNG_AGE, old: MENTORING.MAX_AGE })}</p>
          {error && <p className="text-sm text-destructive m-0">{error}</p>}
        </div>

        <div className="flex flex-col gap-2 min-w-0">
          <span className={LABEL}>{t("mentoring.team", { n: info?.team.length ?? 0, max: info?.max ?? MENTORING.MAX_PLAYERS })}</span>
          {info && info.team.length === 0 && <p className="text-sm text-muted-foreground m-0">{t("mentoring.teamEmpty")}</p>}
          {info?.team.map((r) => (
            <div key={r.id} className={`flex items-center gap-3 rounded-md border px-3 py-2 ${r.id === player.id ? "border-primary/60 bg-primary/10" : "border-border bg-card"}`}>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-semibold text-primary truncate">{r.name}</span>
                <span className="text-sm text-muted-foreground truncate">
                  {r.academy ? `${t("mentoring.academy")} · ` : ""}{t(`personality.trait.${r.trait}`)} · {t("mentoring.sinceShort", { date: formatGameDate(r.since, i18n.language) })}
                </span>
                {r.counts !== undefined && (
                  <span className={`text-sm tabular-nums truncate ${r.counts ? "text-foreground" : "text-chart-4"}`}>
                    {r.counts
                      ? t("mentoring.rowCounts", { n: (r.amount ?? 0).toLocaleString(i18n.language) })
                      : t("mentoring.rowNextSeason")}
                  </span>
                )}
              </div>
              <span className={`text-sm font-semibold tabular-nums whitespace-nowrap ${r.gained > 0 ? "text-star-green" : "text-muted-foreground"}`}>
                {t("mentoring.gainedShort", { n: r.gained.toLocaleString(i18n.language) })}
              </span>
              {pending && r.id !== player.id && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void save(pending, r.id)}
                  className="h-8 shrink-0 rounded-md border border-border px-3 text-sm font-semibold text-foreground hover:border-primary cursor-pointer disabled:opacity-60"
                >
                  {t("mentoring.swap")}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
