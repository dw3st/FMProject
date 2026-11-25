/** Monte Carlo of the casino's machines and crash game (`.claude/rules/game/casino.md`). bun scripts/casino-rtp.ts [spins] */
import { crashPoint, settleUnclaimed } from "@/Domain/casino/crash";
import { classicRtp, spinClassic } from "@/Domain/casino/classicSlot";
import { spinStadium, stadiumRtp } from "@/Domain/casino/stadiumSlot";
import { mulberry32 } from "@/Domain/rng";

const n = Number(process.argv[2] ?? 1_000_000);
const rng = mulberry32(20261118);
let classic = 0, stadium = 0, hits = 0;
for (let i = 0; i < n; i++) classic += spinClassic(rng).multiplier;
for (let i = 0; i < n; i++) { const m = spinStadium(rng).multiplier; stadium += m; if (m > 0) hits++; }
const crash: Record<string, number> = {};
for (const auto of [1.5, 2, 5, 10]) {
  let sum = 0;
  for (let i = 0; i < n; i++) { const o = settleUnclaimed(crashPoint(rng()), auto); sum += o.won ? o.multiplier : 0; }
  crash[`auto ${auto}`] = sum / n;
}
console.log(`spins ${n}`);
console.log(`classic  exact ${classicRtp().toFixed(4)}  sampled ${(classic / n).toFixed(4)}`);
console.log(`stadium  exact ${stadiumRtp().toFixed(4)}  sampled ${(stadium / n).toFixed(4)}  hit rate ${(hits / n).toFixed(3)}`);
for (const [k, v] of Object.entries(crash)) console.log(`crash ${k}  ${v.toFixed(4)}`);

// Games hall: race (16 race cards), bingo (one card), blackjack (basic strategy).
{
  const { raceCard, raceRtp } = await import("@/Domain/casino/race");
  const { playBingo } = await import("@/Domain/casino/bingo");
  const bj = await import("@/Domain/casino/blackjack");
  let win = 0, top3 = 0;
  for (let i = 0; i < 16; i++) { const r = raceRtp(raceCard("rtp", i)); win += r.win; top3 += r.top3; }
  console.log(`race     win ${(win / 16).toFixed(4)}  top 3 ${(top3 / 16).toFixed(4)}`);
  let bingo = 0;
  for (let i = 0; i < n; i++) bingo += playBingo(1, rng).cards[0]!.multiplier;
  console.log(`bingo    sampled ${(bingo / n).toFixed(4)}`);
  let staked = 0, back = 0;
  for (let i = 0; i < n; i++) {
    let r = bj.dealRound("x", "d", 1000, rng);
    if (!bj.settlesAtOnce(r)) while (!bj.playerDone(r)) r = bj.applyAction(r, bj.basicStrategy(r));
    const s = bj.settle(r).settlement;
    staked += 1000; back += s.payout - s.staked + 1000;
  }
  console.log(`blackjack basic strategy ${(back / staked).toFixed(4)}`);
}
