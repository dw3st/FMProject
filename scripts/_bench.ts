import { simulateMatch } from '@/GameEngine/Domain/SimulateMatch';
import { emptySeasonLog } from '@/types/playerTypes';
import type { Formation } from '@/GameEngine/types';
import type { Squad, RosterPlayer } from '@/types/playerTypes';

const FORMATIONS_DIR = new URL('../src/Data/formations', import.meta.url).pathname;
const [fA, fB] = await Promise.all([
  Bun.file(`${FORMATIONS_DIR}/4-3-3.json`).json() as Promise<Formation>,
  Bun.file(`${FORMATIONS_DIR}/4-4-2.json`).json() as Promise<Formation>,
]);

const maxStats = { passing:10, vision:10, finishing:10, dribbling:10, speed:10, acceleration:10, tackling:10, pressing:10, stamina:10, heading:10, strength:10, reflex:10, jump:10 };
const roleSlots: Array<[string, string[]]> = [
  ['GK1',['GK']],['LB1',['LB']],['RB1',['RB']],['LWB1',['LWB']],['RWB1',['RWB']],
  ['CB1',['CB']],['CB2',['CB']],['CB3',['CB']],['CDM1',['CDM']],['CDM2',['CDM']],
  ['CM1',['CM']],['CM2',['CM']],['CM3',['CM']],['LM1',['LM']],['RM1',['RM']],['CAM1',['CAM']],
  ['LW1',['LW']],['RW1',['RW']],['ST1',['ST']],['ST2',['ST']],
];
const squad: Squad = {
  id:'perfect', name:'Perfect XI', colors:['#3b82f6','#ffffff'], money:0,
  players: roleSlots.map(([name, positions], i): RosterPlayer => ({
    id:`p${i}`, name, age:25, squadId:'perfect', preferredFoot:'right',
    positions, stats:{...maxStats}, profile:{summary:'',archetype:''}, seasonLog:emptySeasonLog(),
  })),
};

const N = parseInt(process.argv[2] ?? '30', 10);
const times: number[] = [];
const start = performance.now();
for (let m = 0; m < N; m++) {
  const t0 = performance.now();
  const r = simulateMatch(squad, squad, fA, fB);
  const dt = performance.now() - t0;
  times.push(dt);
  if ((m+1) % 5 === 0 || m+1 === N) {
    console.error(`[${m+1}/${N}] ${dt.toFixed(1)}ms (score ${r.score.A}-${r.score.B}, ratings: ${Object.values(r.playerRatings).length})`);
  }
}
const total = performance.now() - start;
console.error(`\nTotal: ${total.toFixed(0)}ms for ${N} matches = ${(total/N).toFixed(1)}ms/match`);
console.error(`Per-match min=${Math.min(...times).toFixed(0)} max=${Math.max(...times).toFixed(0)} median=${[...times].sort((a,b)=>a-b)[Math.floor(N/2)].toFixed(0)}`);
const slowest = times.map((t,i)=>[t,i]).sort((a,b)=>b[0]-a[0]).slice(0,5);
console.error(`Slowest 5 matches: ${slowest.map(([t,i])=>`#${i+1}=${Math.round(t as number)}ms`).join(', ')}`);
