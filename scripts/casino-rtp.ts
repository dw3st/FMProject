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
