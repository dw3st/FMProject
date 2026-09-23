import { simulateMatch } from '@/GameEngine/Domain/SimulateMatch';
import type { Squad } from '@/types/playerTypes';
import { DEFAULT_SIM_FORMATION_ID, formationForSimId } from '@/Domain/matchFormations';
import { autoLineupDefaultFormation } from '@/Domain/advanceDay/matchSimulationLineups';

const base = 'src/Data/saves/000b1533-6ace-4a5c-b590-bab87bc823e3/squads/brazil_serie_b';
const sqA = JSON.parse(await Bun.file(`${base}/123.json`).text()) as Squad;
const sqB = JSON.parse(await Bun.file(`${base}/2618.json`).text()) as Squad;

const form = formationForSimId(DEFAULT_SIM_FORMATION_ID);
const lineA = autoLineupDefaultFormation(sqA);
const lineB = autoLineupDefaultFormation(sqB);

const r = simulateMatch(sqA, sqB, form, form, lineA, lineB);
console.log('Score:', r.score);
console.log('Team A:', r.teamStats.A);
console.log('Team B:', r.teamStats.B);
console.log('Subs:', r.substitutions.length);
console.log('Duration:', r.durationMs.toFixed(0), 'ms');

// Min/max energy
const energies = r.players.map(p => ({ name: p.name, team: p.team, energy: p.energy }));
energies.sort((a, b) => a.energy - b.energy);
console.log('Min energy:', energies[0]);
console.log('Max energy:', energies[energies.length - 1]);
