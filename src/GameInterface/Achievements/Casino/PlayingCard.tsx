import { useTranslation } from "react-i18next";
import { gameArtUrl, newVisualOn } from "@/Domain/art/paintedFaces";
import { type Card, rankOf, suitOf } from "@/Domain/casino/cards";

const RANK = ["", "", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
/** Spades, hearts, diamonds, clubs (`cards.ts`). */
const SUIT_PATHS = [
  "M12 2 C8 7 3 10 3 14 a4 4 0 0 0 7 2.5 L9 21 h6 l-1-4.5 A4 4 0 0 0 21 14 C21 10 16 7 12 2Z",
  "M12 21 C7 16 2 12 2 7.5 A4.5 4.5 0 0 1 12 5 a4.5 4.5 0 0 1 10 2.5 C22 12 17 16 12 21Z",
  "M12 2 L20 12 L12 22 L4 12Z",
  "M12 3 a4 4 0 0 1 3.5 6 a4 4 0 1 1 0.5 7 L15 21 H9 l-1-5 a4 4 0 1 1 0.5-7 A4 4 0 0 1 12 3Z",
];
const RED = (s: number) => s === 1 || s === 2;

function Suit({ suit, className }: { suit: number; className?: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden className={className}><path d={SUIT_PATHS[suit]} fill="currentColor" /></svg>;
}

const SUIT_KEYS = ["spades", "hearts", "diamonds", "clubs"] as const;

/** A playing card (or its back), drawn in CSS and SVG. */
export function PlayingCard({ card, size = "md", dim }: { card: Card | null; size?: "sm" | "md"; dim?: boolean }) {
  const { t } = useTranslation();
  const box = size === "sm" ? "w-10 h-14" : "w-14 h-20";
  if (card === null) {
    return (
      <span className={`${box} inline-block rounded-md border-2 border-white/80 shadow-md bg-[repeating-linear-gradient(45deg,#7f1d1d_0_6px,#991b1b_6px_12px)]`} aria-label={t("casino.cards.back")} />
    );
  }
  const r = rankOf(card);
  const s = suitOf(card);
  return (
    <span
      className={`${box} relative inline-flex flex-col justify-between rounded-md bg-white shadow-md border border-black/15 px-1 py-0.5 ${RED(s) ? "text-red-600" : "text-zinc-900"} ${dim ? "opacity-45" : ""}`}
      aria-label={t("casino.cards.card", { rank: RANK[r], suit: t(`casino.cards.${SUIT_KEYS[s]}`) })}
    >
      <span className="font-display font-black leading-none text-sm">{RANK[r]}</span>
      <Suit suit={s} className={size === "sm" ? "w-5 h-5 self-center" : "w-7 h-7 self-center"} />
      <span className="font-display font-black leading-none text-sm self-end rotate-180">{RANK[r]}</span>
    </span>
  );
}

/** Felt behind the card games: the painted table with the new visual, else a green gradient. */
export function FeltTable({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const painted = newVisualOn();
  return (
    <div
      className={`relative rounded-[48px] overflow-hidden bg-[radial-gradient(ellipse_at_center,#1f7a4c_0%,#155e3a_60%,#0d3f27_100%)] border-[10px] border-[#6b3d1d] ${className}`}
      style={painted ? { backgroundImage: `url(${gameArtUrl("casino/table-felt-1.webp")})`, backgroundSize: "100% 100%", border: "none" } : undefined}
    >
      <div className={painted ? "px-[9%] py-[8%]" : "p-6"}>{children}</div>
    </div>
  );
}
