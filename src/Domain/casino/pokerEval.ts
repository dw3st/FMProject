/**
 * Texas Hold'em hand evaluator: the best 5-card hand of 5..7 cards as one comparable number.
 * Score = category × 16^5 + up to five ranks (16^4 .. 16^0), higher is better, equal is a tie.
 */
import { type Card } from "@/Domain/casino/cards";

export const HAND_NAMES = ["high", "pair", "twoPair", "trips", "straight", "flush", "fullHouse", "quads", "straightFlush"] as const;

const B5 = 1048576; // 16^5

function enc(cat: number, a = 0, b = 0, c = 0, d = 0, e = 0): number {
  return cat * B5 + a * 65536 + b * 4096 + c * 256 + d * 16 + e;
}

/** Category 0..8 of a score from `evaluate7`. */
export function handCategory(score: number): number {
  return Math.floor(score / B5);
}

/** High card of the best straight in a rank bitmask (bit r = rank r), 5 for the wheel, 0 for none. */
function straightHigh(mask: number): number {
  if (mask & (1 << 14)) mask |= 2; // ace also low (bit 1)
  for (let h = 14; h >= 5; h--) {
    const m = 31 << (h - 4);
    if ((mask & m) === m) return h;
  }
  return 0;
}

// Scratch counters, reset on every call (keeps the evaluator allocation-free).
const cnt = new Int32Array(15);

/** Best hand of 5..7 cards (see the module comment for the encoding). */
export function evaluate7(cards: readonly Card[]): number {
  cnt.fill(0);
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
  let c0 = 0, c1 = 0, c2 = 0, c3 = 0;
  let rankMask = 0;
  for (const c of cards) {
    const r = (c % 13) + 2;
    const s = (c / 13) | 0;
    cnt[r]!++;
    rankMask |= 1 << r;
    if (s === 0) { s0 |= 1 << r; c0++; }
    else if (s === 1) { s1 |= 1 << r; c1++; }
    else if (s === 2) { s2 |= 1 << r; c2++; }
    else { s3 |= 1 << r; c3++; }
  }
  const flushMask = c0 >= 5 ? s0 : c1 >= 5 ? s1 : c2 >= 5 ? s2 : c3 >= 5 ? s3 : 0;
  if (flushMask) {
    const sf = straightHigh(flushMask);
    if (sf) return enc(8, sf);
  }
  let quad = 0, trip1 = 0, trip2 = 0, pair1 = 0, pair2 = 0;
  for (let r = 14; r >= 2; r--) {
    const n = cnt[r]!;
    if (n === 4) quad = r;
    else if (n === 3) { if (!trip1) trip1 = r; else if (!trip2) trip2 = r; }
    else if (n === 2) { if (!pair1) pair1 = r; else if (!pair2) pair2 = r; }
  }
  if (quad) {
    let k = 0;
    for (let r = 14; r >= 2; r--) if (r !== quad && cnt[r]! > 0) { k = r; break; }
    return enc(7, quad, k);
  }
  if (trip1 && (trip2 || pair1)) return enc(6, trip1, Math.max(trip2, pair1));
  if (flushMask) {
    const top: number[] = [];
    for (let r = 14; r >= 2 && top.length < 5; r--) if (flushMask & (1 << r)) top.push(r);
    return enc(5, top[0], top[1], top[2], top[3], top[4]);
  }
  const st = straightHigh(rankMask);
  if (st) return enc(4, st);
  const kick = (skip: number[], n: number): number[] => {
    const out: number[] = [];
    for (let r = 14; r >= 2 && out.length < n; r--) if (cnt[r]! > 0 && !skip.includes(r)) out.push(r);
    return out;
  };
  if (trip1) {
    const k = kick([trip1], 2);
    return enc(3, trip1, k[0], k[1]);
  }
  if (pair1 && pair2) {
    const k = kick([pair1, pair2], 1);
    return enc(2, pair1, pair2, k[0]);
  }
  if (pair1) {
    const k = kick([pair1], 3);
    return enc(1, pair1, k[0], k[1], k[2]);
  }
  const k = kick([], 5);
  return enc(0, k[0], k[1], k[2], k[3], k[4]);
}
