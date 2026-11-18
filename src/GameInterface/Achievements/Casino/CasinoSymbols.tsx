import type { ClassicSymbol } from "@/Domain/casino/classicSlot";
import type { StadiumSymbol } from "@/Domain/casino/stadiumSlot";

/** Vector symbols of the casino machines (viewBox 64 × 64, theme colours only, no text). */
const OUTLINE = "stroke-background";

function Svg({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className ?? "w-full h-full"} aria-hidden="true">
      {children}
    </svg>
  );
}

export function ClassicSymbolArt({ symbol, className }: { symbol: ClassicSymbol; className?: string }) {
  switch (symbol) {
    case "seven":
      return (
        <Svg className={className}>
          <path d="M14 12h37v8L35 54H23l15-33H14z" className={`fill-destructive ${OUTLINE}`} strokeWidth="3" strokeLinejoin="round" />
          <path d="M18 15h28" className="stroke-foreground/40" strokeWidth="2" strokeLinecap="round" />
        </Svg>
      );
    case "bar":
      return (
        <Svg className={className}>
          {[16, 28, 40].map((y) => (
            <rect key={y} x="10" y={y} width="44" height="9" rx="2.5" className={`fill-foreground ${OUTLINE}`} strokeWidth="2" />
          ))}
          {[16, 28, 40].map((y) => <rect key={`s${y}`} x="14" y={y + 2} width="36" height="2" rx="1" className="fill-background/40" />)}
        </Svg>
      );
    case "bell":
      return (
        <Svg className={className}>
          <path d="M32 10c-10 0-15 8-15 17v9l-5 8h40l-5-8v-9c0-9-5-17-15-17z" className={`fill-star-gold ${OUTLINE}`} strokeWidth="3" strokeLinejoin="round" />
          <circle cx="32" cy="50" r="5" className={`fill-star-gold ${OUTLINE}`} strokeWidth="3" />
          <path d="M24 22c1-4 3-6 6-7" className="stroke-background/50" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </Svg>
      );
    case "lemon":
      return (
        <Svg className={className}>
          <ellipse cx="32" cy="34" rx="21" ry="15" className={`fill-card-yellow ${OUTLINE}`} strokeWidth="3" />
          <path d="M11 34l-4-2M53 34l4-2" className="stroke-card-yellow" strokeWidth="4" strokeLinecap="round" />
          <path d="M34 20c4-6 10-8 14-6-2 5-8 8-14 6z" className={`fill-star-green ${OUTLINE}`} strokeWidth="2" />
          <path d="M22 30c2-3 5-5 9-5" className="stroke-background/40" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </Svg>
      );
    case "cherry":
      return (
        <Svg className={className}>
          <path d="M22 40C24 26 30 16 42 10M42 40C40 28 40 18 42 10" className="stroke-star-green" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M42 10c5 0 10 3 11 7-5 1-9-2-11-7z" className="fill-star-green" />
          <circle cx="21" cy="44" r="10" className={`fill-destructive ${OUTLINE}`} strokeWidth="3" />
          <circle cx="43" cy="45" r="10" className={`fill-destructive ${OUTLINE}`} strokeWidth="3" />
          <circle cx="18" cy="40" r="2.5" className="fill-foreground/60" />
          <circle cx="40" cy="41" r="2.5" className="fill-foreground/60" />
        </Svg>
      );
    default:
      return (
        <Svg className={className}>
          <circle cx="32" cy="32" r="3" className="fill-muted-foreground/30" />
        </Svg>
      );
  }
}

export function StadiumSymbolArt({ symbol, className }: { symbol: StadiumSymbol; className?: string }) {
  switch (symbol) {
    case "crest":
      return (
        <Svg className={className}>
          <path d="M32 6l22 7v16c0 15-10 24-22 29C20 53 10 44 10 29V13z" className={`fill-star-gold ${OUTLINE}`} strokeWidth="3" strokeLinejoin="round" />
          <path d="M32 13l15 5v11c0 10-7 17-15 21-8-4-15-11-15-21V18z" className="fill-destructive" />
          <path d="M32 22l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" className="fill-star-gold" />
        </Svg>
      );
    case "trophy":
      return (
        <Svg className={className}>
          <path d="M20 10h24v12c0 9-5 15-12 15s-12-6-12-15z" className={`fill-star-gold ${OUTLINE}`} strokeWidth="3" strokeLinejoin="round" />
          <path d="M20 14h-7c0 8 3 12 8 13M44 14h7c0 8-3 12-8 13" className="stroke-star-gold" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <rect x="29" y="36" width="6" height="9" className="fill-star-gold" />
          <rect x="19" y="45" width="26" height="9" rx="2" className={`fill-foreground ${OUTLINE}`} strokeWidth="2.5" />
          <path d="M25 15v8" className="stroke-background/40" strokeWidth="2.5" strokeLinecap="round" />
        </Svg>
      );
    case "glove":
      return (
        <Svg className={className}>
          {[17, 25, 33, 41].map((x, i) => (
            <rect key={x} x={x} y={i === 0 || i === 3 ? 13 : 8} width="7" height="26" rx="3.5" className={`fill-star-green ${OUTLINE}`} strokeWidth="2.5" />
          ))}
          <ellipse cx="13" cy="35" rx="5" ry="10" transform="rotate(-25 13 35)" className={`fill-star-green ${OUTLINE}`} strokeWidth="2.5" />
          <rect x="15" y="26" width="35" height="22" rx="7" className={`fill-star-green ${OUTLINE}`} strokeWidth="2.5" />
          <rect x="17" y="46" width="31" height="10" rx="2" className={`fill-foreground ${OUTLINE}`} strokeWidth="2.5" />
          <path d="M22 34h22" className="stroke-background/40" strokeWidth="2.5" strokeLinecap="round" />
        </Svg>
      );
    case "boot":
      return (
        <Svg className={className}>
          <path d="M12 14h18v18c6 2 16 4 20 8 3 3 3 7 0 8H12z" className={`fill-star-blue ${OUTLINE}`} strokeWidth="3" strokeLinejoin="round" />
          <path d="M12 41h39" className="stroke-background/60" strokeWidth="2.5" />
          <path d="M18 22l8 4M18 28l8 4" className="stroke-foreground" strokeWidth="2.5" strokeLinecap="round" />
          {[18, 28, 38, 46].map((x) => <rect key={x} x={x} y="48" width="4" height="5" className="fill-foreground" />)}
        </Svg>
      );
    case "whistle":
      return (
        <Svg className={className}>
          <rect x="24" y="20" width="32" height="12" rx="3" className={`fill-foreground ${OUTLINE}`} strokeWidth="2.5" />
          <circle cx="24" cy="38" r="15" className={`fill-foreground ${OUTLINE}`} strokeWidth="2.5" />
          <circle cx="24" cy="38" r="6" className="fill-muted-foreground/60" />
          <rect x="30" y="17" width="8" height="5" rx="1.5" className="fill-background" />
          <path d="M11 30C6 24 7 16 14 13" className="stroke-destructive" strokeWidth="3" fill="none" strokeLinecap="round" />
        </Svg>
      );
    case "card":
      return (
        <Svg className={className}>
          <rect x="18" y="10" width="26" height="38" rx="3" transform="rotate(-10 31 29)" className={`fill-destructive ${OUTLINE}`} strokeWidth="2.5" />
          <rect x="22" y="14" width="26" height="38" rx="3" transform="rotate(8 35 33)" className={`fill-card-yellow ${OUTLINE}`} strokeWidth="2.5" />
        </Svg>
      );
    default:
      return (
        <Svg className={className}>
          <circle cx="32" cy="32" r="22" className={`fill-foreground ${OUTLINE}`} strokeWidth="3" />
          <path d="M32 21l9 6-3 10H26l-3-10z" className="fill-background" />
          <path d="M32 21v-11M41 27l10-4M38 37l7 9M26 37l-7 9M23 27l-10-4" className="stroke-background" strokeWidth="2.5" />
        </Svg>
      );
  }
}

/** A small airplane seen from the side, nose to the right. */
export function PlaneArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 40" className={className} aria-hidden="true">
      <path d="M6 22c0-3 3-5 7-5h44c8 0 15 3 17 5-2 2-9 5-17 5H13c-4 0-7-2-7-5z" className="fill-foreground stroke-background" strokeWidth="2" />
      <path d="M34 18L22 4h7l17 14zM34 26L24 38h7l13-12z" className="fill-destructive stroke-background" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 18L4 8h6l8 10z" className="fill-destructive stroke-background" strokeWidth="2" strokeLinejoin="round" />
      {[44, 50, 56].map((x) => <circle key={x} cx={x} cy="21" r="1.8" className="fill-star-blue" />)}
      <path d="M66 19c3 0 5 1 6 3" className="stroke-star-blue" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}
