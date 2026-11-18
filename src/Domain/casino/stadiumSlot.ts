/** The stadium machine: 5 reels × 3 rows, 10 fixed lines, left-to-right wins of 3+, the crest is wild. */
export type StadiumSymbol = "crest" | "trophy" | "glove" | "boot" | "whistle" | "card" | "ball";

export const STADIUM_SYMBOLS: readonly StadiumSymbol[] = ["crest", "trophy", "glove", "boot", "whistle", "card", "ball"];
export const WILD: StadiumSymbol = "crest";

/** Stops of each symbol on every reel (32 per reel). */
export const STADIUM_WEIGHTS: Record<StadiumSymbol, number> = { crest: 1, trophy: 2, glove: 3, boot: 4, whistle: 5, card: 7, ball: 10 };

/** Pay of 3, 4 and 5 in a row, × the line bet (stake / 10). */
export const STADIUM_PAYS: Record<StadiumSymbol, [number, number, number]> = {
  crest: [60, 300, 1500],
  trophy: [35, 140, 700],
  glove: [20, 80, 350],
  boot: [14, 55, 200],
  whistle: [10, 35, 110],
  card: [7, 22, 75],
  ball: [4, 14, 40],
};

/** Row of each reel for the 10 lines (0 top, 1 middle, 2 bottom). */
export const STADIUM_LINES: readonly (readonly [number, number, number, number, number])[] = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 1, 1, 1, 0],
];

/** Reel strip built from the weights, symbols spread so equal ones rarely touch. */
function buildStrip(offset: number): StadiumSymbol[] {
  const pool: StadiumSymbol[] = [];
  const left = { ...STADIUM_WEIGHTS };
  const total = Object.values(left).reduce((a, b) => a + b, 0);
  for (let i = 0; i < total; i++) {
    const order = [...STADIUM_SYMBOLS].sort((a, b) => left[b] - left[a]);
    const pick = order.find((s) => left[s] > 0 && s !== pool[pool.length - 1]) ?? order.find((s) => left[s] > 0)!;
    pool.push(pick);
    left[pick]--;
  }
  return [...pool.slice(offset), ...pool.slice(0, offset)];
}

export const STADIUM_STRIPS: readonly (readonly StadiumSymbol[])[] = [0, 7, 13, 19, 25].map(buildStrip);
const STRIP_LEN = STADIUM_STRIPS[0]!.length;

export function stadiumAt(reel: number, stop: number, row: number): StadiumSymbol {
  const strip = STADIUM_STRIPS[reel]!;
  return strip[(((stop + row) % STRIP_LEN) + STRIP_LEN) % STRIP_LEN]!;
}

/** Pay of one line (× the line bet) and how many symbols from the left make it. */
export function linePay(symbols: readonly StadiumSymbol[]): { pay: number; count: number; symbol: StadiumSymbol } {
  let wildRun = 0;
  while (wildRun < symbols.length && symbols[wildRun] === WILD) wildRun++;
  const wildPay = wildRun >= 3 ? STADIUM_PAYS[WILD][wildRun - 3]! : 0;
  const target = symbols.find((s) => s !== WILD);
  let best = { pay: wildPay, count: wildPay > 0 ? wildRun : 0, symbol: WILD };
  if (target) {
    let run = 0;
    while (run < symbols.length && (symbols[run] === target || symbols[run] === WILD)) run++;
    const pay = run >= 3 ? STADIUM_PAYS[target][run - 3]! : 0;
    if (pay > best.pay) best = { pay, count: run, symbol: target };
  }
  return best;
}

export interface StadiumLineWin {
  line: number;
  count: number;
  symbol: StadiumSymbol;
  pay: number;
}

export interface StadiumSpin {
  stops: number[];
  wins: StadiumLineWin[];
  /** Total won × the stake. */
  multiplier: number;
}

export function evaluateStadium(stops: readonly number[]): StadiumSpin {
  const wins: StadiumLineWin[] = [];
  STADIUM_LINES.forEach((rows, line) => {
    const w = linePay(rows.map((row, reel) => stadiumAt(reel, stops[reel]!, row - 1)));
    if (w.pay > 0) wins.push({ line, ...w });
  });
  const lineBets = STADIUM_LINES.length;
  return { stops: [...stops], wins, multiplier: wins.reduce((s, w) => s + w.pay, 0) / lineBets };
}

export function spinStadium(rng: () => number): StadiumSpin {
  return evaluateStadium(STADIUM_STRIPS.map(() => Math.floor(rng() * STRIP_LEN)));
}

/**
 * Exact return to player. Every row of a reel is uniform over its strip and the reels are independent, so each
 * line has the same expected pay: the weighted sum over the 7⁵ symbol combinations.
 */
export function stadiumRtp(): number {
  const total = STRIP_LEN;
  let sum = 0;
  const combo: StadiumSymbol[] = [];
  const walk = (reel: number, p: number) => {
    if (reel === 5) { sum += p * linePay(combo).pay; return; }
    for (const s of STADIUM_SYMBOLS) {
      const w = STADIUM_STRIPS[reel]!.filter((x) => x === s).length;
      if (!w) continue;
      combo[reel] = s;
      walk(reel + 1, p * (w / total));
    }
  };
  walk(0, 1);
  return sum;
}
