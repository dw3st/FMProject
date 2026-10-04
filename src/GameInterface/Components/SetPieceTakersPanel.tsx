import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RosterPlayer } from "@/types/playerTypes";
import type { SetPieceTakersSave } from "@/types/tacticsTypes";
import { getMainRole } from "@/Domain/roles";

const DUTIES = ["corners", "freeKicks", "penalties"] as const;
type Duty = (typeof DUTIES)[number];

/** The attribute the automatic pick uses for each duty (`set-pieces-play.md` §4), on the 0–10 scale. */
function dutyScore(duty: Duty, p: RosterPlayer): number {
  return duty === "corners" ? (p.stats.passing + p.stats.vision) / 2 : p.stats.finishing;
}

/**
 * Set-piece takers on the tactics screen: one selector per duty (corners, free kicks, penalties),
 * "Automatic" by default. Self-contained — reads and writes `TacticsSave.setPieceTakers` through
 * `/api/saves/:id/tactics`. A chosen player who is not on the pitch falls back to automatic.
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

  async function change(duty: Duty, id: string) {
    const prev = takers;
    const next: SetPieceTakersSave = { ...takers };
    if (id) next[duty] = id;
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
          const options = [...outfield].sort((a, b) => dutyScore(duty, b) - dutyScore(duty, a));
          return (
            <label key={duty} className="block">
              <span className="block font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground mb-1">
                {t(`tactics.setPieceTakers.${duty}`)}
              </span>
              <select
                className="w-full h-10 px-3 rounded border border-border bg-card text-sm cursor-pointer focus:border-primary outline-none"
                value={takers[duty] ?? ""}
                onChange={(e) => change(duty, e.target.value)}
              >
                <option value="">{t("tactics.setPieceTakers.auto")}</option>
                {options.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {dutyScore(duty, p).toFixed(1)}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </div>
  );
}
