import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RosterPlayer } from "@/types/playerTypes";
import type { SetPieceRoutine, SetPieceTakersSave, SetPieceTarget } from "@/types/tacticsTypes";
import { ROUTINE_LIMITS } from "@/GameEngine/Domain/SetPieces";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { Button } from "@/GameInterface/ui/Button";
import { getMainRole } from "@/Domain/roles";
import { MAX_TAKERS_PER_DUTY } from "@/Domain/tactics/setPieceTakers";

const DUTIES = ["corners", "freeKicks", "penalties"] as const;
type Duty = (typeof DUTIES)[number];

const RESTARTS = ["corners", "freeKicks"] as const;
type Restart = (typeof RESTARTS)[number];
const TARGETS: SetPieceTarget[] = ["auto", "near_post", "penalty_spot", "far_post", "short"];
const NEW_ROUTINE: SetPieceRoutine = { target: "auto", attackers: 5 };

/** The attribute the automatic pick uses for each duty (`set-pieces-play.md` §4), on the 0–10 scale. */
function dutyScore(duty: Duty, p: RosterPlayer): number {
  return duty === "corners" ? (p.stats.passing + p.stats.vision) / 2 : p.stats.finishing;
}

/**
 * Set-piece takers on the tactics screen: per duty (corners, free kicks, penalties) up to 3 takers
 * in order of preference (#116), "Automatic" when empty. The match uses the first one on the
 * pitch; none of them playing falls back to automatic. Self-contained — reads and writes
 * `TacticsSave.setPieceTakers` through `/api/saves/:id/tactics`.
 */
export function SetPieceTakersPanel({ saveId, players }: { saveId: string; players: RosterPlayer[] }) {
  const { t } = useTranslation();
  const [takers, setTakers] = useState<SetPieceTakersSave>({});

  useEffect(() => {
    let alive = true;
    fetch(`/api/saves/${saveId}/tactics`)
      .then((r) => (r.ok ? r.json() : null))
      .then((tac: { setPieceTakers?: SetPieceTakersSave } | null) => {
        if (alive && tac) setTakers(tac.setPieceTakers ?? {});
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [saveId]);

  const outfield = useMemo(() => players.filter((p) => getMainRole(p.positions[0] ?? "") !== "GK"), [players]);

  async function save(next: SetPieceTakersSave) {
    const prev = takers;
    setTakers(next);
    try {
      const res = await fetch(`/api/saves/${saveId}/tactics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setPieceTakers: next }),
      });
      if (!res.ok) setTakers(prev);
    } catch {
      setTakers(prev);
    }
  }

  /** Replaces the routines of one restart (an empty list goes back to automatic). */
  function setRoutines(restart: Restart, list: SetPieceRoutine[]) {
    const routines = { ...(takers.routines ?? {}) };
    if (list.length > 0) routines[restart] = list;
    else delete routines[restart];
    const next: SetPieceTakersSave = { ...takers };
    if (Object.keys(routines).length > 0) next.routines = routines;
    else delete next.routines;
    void save(next);
  }

  async function change(duty: Duty, index: number, id: string) {
    const prev = takers;
    const list = [...(takers[duty] ?? [])];
    if (id) list[index] = id;
    else list.splice(index, 1);
    const cleaned = list.filter((x, i) => x && list.indexOf(x) === i).slice(0, MAX_TAKERS_PER_DUTY);
    const next: SetPieceTakersSave = { ...takers };
    if (cleaned.length > 0) next[duty] = cleaned;
    else delete next[duty];
    setTakers(next);
    try {
      const res = await fetch(`/api/saves/${saveId}/tactics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setPieceTakers: next }),
      });
      if (!res.ok) setTakers(prev);
    } catch {
      setTakers(prev);
    }
  }

  return (
    <div className="card-arcade rounded-md p-5">
      <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("tactics.setPieceTakers.title")}</h3>
      <p className="text-sm text-muted-foreground mt-2 mb-4">{t("tactics.setPieceTakers.hint")}</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {DUTIES.map((duty) => {
          const sorted = [...outfield].sort((a, b) => dutyScore(duty, b) - dutyScore(duty, a));
          const chosen = takers[duty] ?? [];
          return (
            <fieldset key={duty} className="block m-0 p-0 border-0 min-w-0">
              <legend className="block font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground mb-1 p-0">
                {t(`tactics.setPieceTakers.${duty}`)}
              </legend>
              <div className="flex flex-col gap-2">
                {Array.from({ length: MAX_TAKERS_PER_DUTY }, (_, i) => {
                  const value = chosen[i] ?? "";
                  // A later choice opens once the previous one is set; a player already picked in
                  // another slot of the same duty is not offered again.
                  const disabled = i > chosen.length;
                  const options = sorted.filter((p) => p.id === value || !chosen.includes(p.id));
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-6 shrink-0 font-display font-bold text-sm text-muted-foreground tabular-nums">{i + 1}</span>
                      <select
                        aria-label={`${t(`tactics.setPieceTakers.${duty}`)} · ${t("tactics.setPieceTakers.order", { n: i + 1 })}`}
                        className="w-full h-10 px-3 rounded border border-border bg-card text-sm cursor-pointer focus:border-primary outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                        value={value}
                        disabled={disabled}
                        onChange={(e) => change(duty, i, e.target.value)}
                      >
                        <option value="">{t("tactics.setPieceTakers.auto")}</option>
                        {options.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {dutyScore(duty, p).toFixed(1)}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>

      <h3 className="font-display font-black uppercase text-xl leading-none m-0 mt-6">{t("tactics.routines.title")}</h3>
      <p className="text-sm text-muted-foreground mt-2 mb-4">{t("tactics.routines.hint")}</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {RESTARTS.map((restart) => {
          const list = takers.routines?.[restart] ?? [];
          return (
            <div key={restart} className="min-w-0">
              <div className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground mb-2">
                {t(`tactics.routines.${restart}`)}
              </div>
              {list.length === 0 && <p className="text-sm text-muted-foreground m-0 mb-2">{t("tactics.routines.none")}</p>}
              <div className="flex flex-col gap-3">
                {list.map((routine, i) => {
                  const name = t("tactics.routines.routine", { n: i + 1 });
                  const patch = (r: Partial<SetPieceRoutine>) => setRoutines(restart, list.map((x, k) => (k === i ? { ...x, ...r } : x)));
                  return (
                    <div key={i} className="rounded-md border border-border p-3 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display font-bold uppercase text-base leading-none">{name}</span>
                        <Button variant="danger" onClick={() => setRoutines(restart, list.filter((_, k) => k !== i))}>
                          {t("tactics.routines.remove")}
                        </Button>
                      </div>
                      <OptionChips
                        aria-label={`${name} · ${t("tactics.routines.target")}`}
                        options={TARGETS.map((key) => ({ key, label: t(`tactics.routines.targets.${key}`) }))}
                        value={routine.target}
                        onChange={(target) => patch({ target })}
                      />
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">{t("tactics.routines.attackers")}</span>
                        <button
                          type="button"
                          aria-label={t("tactics.routines.fewer")}
                          className="h-8 w-8 rounded border border-border bg-card text-base font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={routine.attackers <= ROUTINE_LIMITS.MIN_ATTACKERS}
                          onClick={() => patch({ attackers: routine.attackers - 1 })}
                        >−</button>
                        <span className="w-6 text-center font-display font-bold tabular-nums text-base">{routine.attackers}</span>
                        <button
                          type="button"
                          aria-label={t("tactics.routines.more")}
                          className="h-8 w-8 rounded border border-border bg-card text-base font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={routine.attackers >= ROUTINE_LIMITS.MAX_ATTACKERS}
                          onClick={() => patch({ attackers: routine.attackers + 1 })}
                        >+</button>
                        <span className="text-muted-foreground">{t("tactics.routines.stayBack", { count: 10 - routine.attackers })}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {list.length < ROUTINE_LIMITS.MAX && (
                <div className="mt-3">
                  <Button variant="secondary" onClick={() => setRoutines(restart, [...list, NEW_ROUTINE])}>
                    {t("tactics.routines.add")}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
