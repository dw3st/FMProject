import { useState } from "react";
import { quickSimMatch, type QuickSimResult } from "@/Domain/advanceDay/quickSim";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { emptySeasonLog } from "@/types/playerTypes";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import playersJson from "@/Data/players.json";

function squadFrom(squadId: string, name: string): Squad {
  const players = (playersJson as unknown as RosterPlayer[])
    .filter((p) => p.squadId === squadId)
    .map((p) => ({ ...p, seasonLog: emptySeasonLog() }));
  return { id: squadId, name, colors: ["#3b82f6", "#ffffff"], money: 0, players };
}

const HOME = squadFrom("team_red", "Red");
const AWAY = squadFrom("team_blue", "Blue");

function runOnce(): QuickSimResult {
  return quickSimMatch({
    fixtureId: "test",
    home: HOME,
    away: AWAY,
    homeLineup: autoLineupDefaultFormation(HOME),
    awayLineup: autoLineupDefaultFormation(AWAY),
  });
}

interface Batch { n: number; goals: number; home: number; draw: number; away: number }

export function QuickSimPanel() {
  const [last, setLast] = useState<QuickSimResult | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);

  function runBatch(n: number) {
    const b: Batch = { n, goals: 0, home: 0, draw: 0, away: 0 };
    for (let i = 0; i < n; i++) {
      const { score } = runOnce().recording;
      b.goals += score.home + score.away;
      if (score.home > score.away) b.home++;
      else if (score.away > score.home) b.away++;
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
      <div className="flex gap-2">
        <button className="px-2 py-1 text-xs border border-white/10 rounded hover:bg-white/10" onClick={() => setLast(runOnce())}>
          Simular 1
        </button>
        <button className="px-2 py-1 text-xs border border-white/10 rounded hover:bg-white/10" onClick={() => runBatch(500)}>
          Simular 500
        </button>
      </div>
      {last && (
        <div className="space-y-1">
          <div className="text-sm font-bold text-center">
            {HOME.name} {last.recording.score.home} × {last.recording.score.away} {AWAY.name}
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
        </div>
      )}
    </div>
  );
}
