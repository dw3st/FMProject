import { useTranslation } from "react-i18next";
import ROLES from "@/Data/roles.json";
import { DETAILED_ROLES, type Aptitude, type DetailedRole } from "@/Domain/positions/positionAptitude";

const FILL: Record<Aptitude, string> = {
  natural: "fill-emerald-500",
  apt: "fill-emerald-300",
  training: "fill-amber-400",
  unsuitable: "fill-white/10",
};

const LEGEND: { apt: Exclude<Aptitude, "unsuitable">; dot: string; key: string }[] = [
  { apt: "natural", dot: "bg-emerald-500", key: "roles.legendNatural" },
  { apt: "apt", dot: "bg-emerald-300", key: "roles.legendApt" },
  { apt: "training", dot: "bg-amber-400", key: "roles.legendTraining" },
];

type RolePos = Record<string, { position: { x: number; y: number } }>;

/** Little pitch that marks where a player fits: strong green natural, light green suited, amber needs training. */
export function PositionPitch({ aptitudes }: { aptitudes: Record<DetailedRole, Aptitude> }) {
  const { t } = useTranslation();
  const pos = ROLES as unknown as RolePos;
  return (
    <div>
      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 m-0">
        {t("roles.aptitudeTitle")}
      </p>
      <svg viewBox="0 0 100 110" className="w-full max-w-[220px] mx-auto rounded-lg bg-emerald-950/50 border border-emerald-800/50" role="img" aria-label={t("roles.aptitudeTitle")}>
        <rect x="4" y="4" width="92" height="102" className="fill-none stroke-white/20" strokeWidth="0.5" />
        <line x1="4" y1="55" x2="96" y2="55" className="stroke-white/20" strokeWidth="0.5" />
        <circle cx="50" cy="55" r="10" className="fill-none stroke-white/20" strokeWidth="0.5" />
        <rect x="26" y="4" width="48" height="16" className="fill-none stroke-white/20" strokeWidth="0.5" />
        <rect x="26" y="90" width="48" height="16" className="fill-none stroke-white/20" strokeWidth="0.5" />
        {DETAILED_ROLES.map((r) => {
          const p = pos[r]?.position;
          if (!p) return null;
          const a = aptitudes[r];
          return (
            <g key={r}>
              <title>{`${t(`roles.detailed.${r}` as never)}: ${t(`roles.aptitude.${a}` as never)}`}</title>
              <circle cx={p.x} cy={p.y + 5} r={a === "unsuitable" ? 2 : 4.2} className={FILL[a]} />
              {a !== "unsuitable" && (
                <text x={p.x} y={p.y + 5.1} textAnchor="middle" dominantBaseline="middle" className="fill-emerald-950 font-sans font-bold" fontSize="3.4">
                  {t(`roles.detailedAbbr.${r}` as never)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-3 p-0 list-none text-[10px] text-muted-foreground">
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
