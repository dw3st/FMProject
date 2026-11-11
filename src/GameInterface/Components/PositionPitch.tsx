import { useTranslation } from "react-i18next";
import ROLES from "@/Data/roles.json";
import { gameArtUrl, newVisualOn } from "@/Domain/art/paintedFaces";
import { DETAILED_ROLES, type Aptitude, type DetailedRole } from "@/Domain/positions/positionAptitude";

// Option A of the mock (tester report, 9.0.1): big coloured discs, dark abbreviation, white ring.
const FILL: Record<Aptitude, string> = {
  natural: "fill-star-green",
  apt: "fill-star-green/45",
  training: "fill-chart-4",
  unsuitable: "fill-white/25",
};

const LEGEND: { apt: Exclude<Aptitude, "unsuitable">; dot: string; key: string }[] = [
  { apt: "natural", dot: "bg-star-green", key: "roles.legendNatural" },
  { apt: "apt", dot: "bg-star-green/45", key: "roles.legendApt" },
  { apt: "training", dot: "bg-chart-4", key: "roles.legendTraining" },
];

type RolePos = Record<string, { position: { x: number; y: number } }>;

/** Little pitch that marks where a player fits: strong green natural, light green suited, amber needs training. */
export function PositionPitch({ aptitudes }: { aptitudes: Record<DetailedRole, Aptitude> }) {
  const { t } = useTranslation();
  const pos = ROLES as unknown as RolePos;
  const art = newVisualOn();
  return (
    <div>
      <p className="text-[13px] font-bold text-muted-foreground uppercase tracking-[0.08em] mb-3 m-0 font-display">
        {t("roles.aptitudeTitle")}
      </p>
      <svg viewBox="0 0 100 110" className="w-full max-w-[320px] mx-auto rounded-lg bg-[#2e7836] border border-border" role="img" aria-label={t("roles.aptitudeTitle")}>
        {art ? (
          <image href={gameArtUrl("pitch/position-pitch.webp")} x="0" y="0" width="100" height="110" preserveAspectRatio="none" />
        ) : (
          <g className="stroke-white/80 fill-none" strokeWidth="0.6">
            <rect x="4" y="4" width="92" height="102" />
            <line x1="4" y1="55" x2="96" y2="55" />
            <circle cx="50" cy="55" r="11.7" />
            <rect x="23" y="4" width="54" height="20" />
            <rect x="23" y="86" width="54" height="20" />
          </g>
        )}
        {DETAILED_ROLES.map((r) => {
          const p = pos[r]?.position;
          if (!p) return null;
          const a = aptitudes[r];
          return (
            <g key={r}>
              <title>{`${t(`roles.detailed.${r}` as never)}: ${t(`roles.aptitude.${a}` as never)}`}</title>
              {a === "unsuitable" ? (
                <circle cx={p.x} cy={p.y + 5} r={1.6} className={FILL[a]} />
              ) : (
                <>
                  <circle cx={p.x} cy={p.y + 5.6} r={6.2} className="fill-black/35" />
                  <circle cx={p.x} cy={p.y + 5} r={5.8} className={`${FILL[a]} stroke-white`} strokeWidth="0.7" />
                  <text x={p.x} y={p.y + 5.2} textAnchor="middle" dominantBaseline="middle" className="fill-[#0f1914] font-display font-bold" fontSize="3.9">
                    {t(`roles.detailedAbbr.${r}` as never)}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
      <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-3 p-0 list-none text-sm text-muted-foreground">
        {LEGEND.map((l) => (
          <li key={l.apt} className="inline-flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${l.dot}`} aria-hidden />
            {t(l.key as never)}
          </li>
        ))}
      </ul>
    </div>
  );
}
