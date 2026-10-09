import { useState } from "react";
import { quickSimMatch, type QuickSimResult } from "@/Domain/advanceDay/quickSim";
import { autoLineupDefaultFormation, slotRoles } from "@/Domain/advanceDay/matchSimulationLineups";
import { DEFAULT_SIM_FORMATION_ID, formationForSimId } from "@/Domain/matchFormations";
import { emptySeasonLog } from "@/types/playerTypes";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import manUtdSquad from "@/Data/squads/premier_league/33.json";
import newcastleSquad from "@/Data/squads/premier_league/34.json";

interface RawSquadFile {
  id: string;
  name: string;
  colors: string[];
  players: RosterPlayer[];
}

function squadFrom(raw: RawSquadFile): Squad {
  const players = raw.players.map((p) => ({ ...p, seasonLog: emptySeasonLog() }));
  return {
    id: raw.id,
    name: raw.name,
    colors: [raw.colors[0] ?? "#3b82f6", raw.colors[1] ?? "#ffffff"],
    money: 0,
    players,
  };
}

const HOME = squadFrom(manUtdSquad as RawSquadFile);
const AWAY = squadFrom(newcastleSquad as RawSquadFile);
/** Both sides play the default formation — same as non-followed league fixtures. */
const ROLES = slotRoles(formationForSimId(DEFAULT_SIM_FORMATION_ID));

/** `fam` = style familiarity of each side (the /test selectors; 50 = neutral). */
function runOnce(
  knockout = false,
  fam: { home: number; away: number } = { home: 50, away: 50 },
  morale?: { home: number; away: number },
  temperament?: { home?: number; away?: number },
  pitchCondition?: number,
  refereeStrictness?: number,
): QuickSimResult {
  return quickSimMatch({
    fixtureId: "test",
    home: HOME,
    away: AWAY,
    homeLineup: autoLineupDefaultFormation(HOME),
    awayLineup: autoLineupDefaultFormation(AWAY),
    homeRoles: ROLES,
    awayRoles: ROLES,
    knockout,
    homeFamiliarity: fam.home,
    awayFamiliarity: fam.away,
    // Side morale (`.claude/rules/game/morale.md`; 65 = neutral).
    ...(morale ? { homeMorale: morale.home, awayMorale: morale.away } : {}),
    // Side temperament (`personality.md`); absent = each player's own.
    ...(temperament?.home !== undefined ? { homeTemperament: temperament.home } : {}),
    ...(temperament?.away !== undefined ? { awayTemperament: temperament.away } : {}),
    // Pitch of the match (`src/Domain/facilities/pitch.ts`); absent = 90.
    ...(pitchCondition !== undefined ? { pitchCondition } : {}),
    // Referee rigor (`referees.md`); absent = neutral.
    ...(refereeStrictness !== undefined ? { refereeStrictness } : {}),
  });
}

interface Batch { n: number; goals: number; home: number; draw: number; away: number; extraTime: number; penalties: number }

export function QuickSimPanel({ familiarity, morale, temperament, pitchCondition, refereeStrictness }: {
  familiarity?: { home: number; away: number };
  morale?: { home: number; away: number };
  temperament?: { home?: number; away?: number };
  pitchCondition?: number;
  refereeStrictness?: number;
} = {}) {
  const [last, setLast] = useState<QuickSimResult | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [knockout, setKnockout] = useState(false);

  function runBatch(n: number) {
    const b: Batch = { n, goals: 0, home: 0, draw: 0, away: 0, extraTime: 0, penalties: 0 };
    for (let i = 0; i < n; i++) {
      const { score, decider } = runOnce(knockout, familiarity, morale, temperament, pitchCondition, refereeStrictness).recording;
      b.goals += score.home + score.away;
      if (decider) b.extraTime++;
      const pens = decider?.penalties;
      if (pens) b.penalties++;
      const homeWon = score.home > score.away || (pens !== undefined && pens.home > pens.away);
      const awayWon = score.away > score.home || (pens !== undefined && pens.away > pens.home);
      if (homeWon) b.home++;
      else if (awayWon) b.away++;
      else b.draw++;
    }
    setBatch(b);
  }

  const row = (label: string, h: number, a: number) => (
    <div key={label} className="flex justify-between text-xs tabular-nums">
      <span className="text-white/70">{h.toFixed(2)}</span>
      <span className="text-white/40">{label}</span>
      <span className="text-white/70">{a.toFixed(2)}</span>
    </div>
  );

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded p-3 space-y-2 max-w-md">
      <div className="flex items-center gap-2">
        <button className="px-2 py-1 text-xs border border-white/10 rounded hover:bg-white/10" onClick={() => setLast(runOnce(knockout, familiarity, morale, temperament, pitchCondition, refereeStrictness))}>
          Simular 1
        </button>
        <button className="px-2 py-1 text-xs border border-white/10 rounded hover:bg-white/10" onClick={() => runBatch(500)}>
          Simular 500
        </button>
        <label className="flex items-center gap-1 text-xs text-white/70">
          <input type="checkbox" checked={knockout} onChange={(e) => setKnockout(e.target.checked)} />
          Mata-mata
        </label>
      </div>
      {last && (
        <div className="space-y-1">
          <div className="text-sm font-bold text-center">
            {HOME.name} {last.recording.score.home} × {last.recording.score.away} {AWAY.name}
            {last.recording.decider?.penalties &&
              ` (pên. ${last.recording.decider.penalties.home}–${last.recording.decider.penalties.away})`}
            {last.recording.decider && !last.recording.decider.penalties && " (prorr.)"}
          </div>
          {row("Ataque", last.breakdown.home.attack, last.breakdown.away.attack)}
          {row("Meio", last.breakdown.home.midfield, last.breakdown.away.midfield)}
          {row("Defesa", last.breakdown.home.defense, last.breakdown.away.defense)}
          {row("Goleiro", last.breakdown.home.goalkeeper, last.breakdown.away.goalkeeper)}
          {row("xG", last.breakdown.xgHome, last.breakdown.xgAway)}
        </div>
      )}
      {batch && (
        <div className="text-xs text-white/70 tabular-nums">
          {batch.n} jogos · {(batch.goals / batch.n).toFixed(2)} gols/jogo · casa {((batch.home / batch.n) * 100).toFixed(0)}% ·
          empate {((batch.draw / batch.n) * 100).toFixed(0)}% · fora {((batch.away / batch.n) * 100).toFixed(0)}%
          {knockout &&
            ` · prorr. ${((batch.extraTime / batch.n) * 100).toFixed(0)}% · pên. ${((batch.penalties / batch.n) * 100).toFixed(0)}%`}
        </div>
      )}
    </div>
  );
}
