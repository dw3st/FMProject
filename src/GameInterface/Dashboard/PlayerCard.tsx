import { useTranslation } from "react-i18next";
import type { DisplayPlayer } from "@/GameInterface/playerHelpers";
import type { PlayerStatsRecord } from "@/types/playerTypes";
import { ATTRIBUTE_LABELS } from "@/GameInterface/AttributeLabels";
import type { AttributeId } from "@/GameInterface/AttributeLabels";
import { getMainRole, MAIN_ROLE_ABBR, MAIN_ROLE_BADGE_CLASSES } from "@/GameInterface/positionHelpers";
import { StatHoverPopover } from "@/GameInterface/Components/StatHoverPopover";
import { ratingBarFillClass10, ratingRingStrokeHex10, ratingTextClass10 } from "@/GameInterface/scoreColors";

const STAT_ABBR: Partial<Record<keyof PlayerStatsRecord, string>> = {
  finishing:    "FIN",
  strength:     "STR",
  dribbling:    "DRB",
  speed:        "SPD",
  acceleration: "ACC",
  stamina:      "STA",
  passing:      "PAS",
  vision:       "VIS",
  pressing:     "PRS",
  tackling:     "TAC",
  reflex:       "REF",
  jump:         "JMP",
};

function StatBar({
  statKey,
  value,
  wide,
}: {
  statKey: keyof PlayerStatsRecord;
  value: number;
  wide?: boolean;
}) {
  const pct = (value / 10) * 100;
  const color = ratingBarFillClass10(value);
  const attr = ATTRIBUTE_LABELS[statKey as AttributeId];
  return (
    <div className="relative flex items-center gap-2 group/stat">
      <span
        className={`font-black text-muted-foreground uppercase tracking-wider shrink-0 cursor-default ${
          wide ? "text-[10px] w-8" : "text-[9px] w-7"
        }`}
      >
        {STAT_ABBR[statKey]}
      </span>
      <div className={`flex-1 bg-muted/30 rounded-full overflow-hidden ${wide ? "h-2" : "h-1.5"}`}>
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`font-black w-4 text-right ${wide ? "text-xs" : "text-[10px]"} ${ratingTextClass10(value)}`}>{value}</span>

      <StatHoverPopover label={attr.label} description={attr.description} />
    </div>
  );
}

function AvgRing({ value, size = "sm" }: { value: number; size?: "sm" | "lg" }) {
  const dim = size === "lg" ? 96 : 56;
  const r = size === "lg" ? 40 : 22;
  const cx = dim / 2;
  const cy = dim / 2;
  const circ = 2 * Math.PI * r;
  const fill = (value / 10) * circ;
  const color = ratingRingStrokeHex10(value);
  const fs = size === "lg" ? 22 : 13;
  const ty = size === "lg" ? cy + 8 : cy + 5;
  return (
    <svg width={dim} height={dim} className="shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={size === "lg" ? 5 : 4} />
      <circle
        cx={cx} cy={cy} r={r} fill="none"
        stroke={color} strokeWidth={size === "lg" ? 5 : 4}
        strokeDasharray={`${fill} ${circ - fill}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x={cx} y={ty} textAnchor="middle" fontSize={fs} fontWeight="900" fill={color} fontFamily="monospace">
        {Math.round(value * 10)}
      </text>
    </svg>
  );
}

export function PlayerCard({
  player,
  layout = "narrow",
}: {
  player: DisplayPlayer;
  layout?: "narrow" | "wide";
}) {
  const { t } = useTranslation();
  const mainRole = getMainRole(player.pos);
  const posColor = MAIN_ROLE_BADGE_CLASSES[mainRole] ?? "bg-muted/20 text-muted-foreground border-border";

  const STAT_GROUPS: { label: string; keys: (keyof PlayerStatsRecord)[] }[] = [
    { label: t("dashboard.playerCard.attack"),  keys: ["finishing", "strength", "dribbling"] },
    { label: t("dashboard.playerCard.speed"),   keys: ["speed", "acceleration", "stamina"] },
    { label: t("dashboard.playerCard.passing"), keys: ["passing", "vision"] },
    { label: t("dashboard.playerCard.defense"), keys: ["pressing", "tackling"] },
  ];

  const GK_STAT_GROUPS: { label: string; keys: (keyof PlayerStatsRecord)[] }[] = [
    { label: t("dashboard.playerCard.goalkeeping"), keys: ["reflex", "jump", "passing"] },
  ];

  const statGroups = mainRole === "GK" ? GK_STAT_GROUPS : STAT_GROUPS;
  const paceStat = mainRole === "GK" ? player.stats.reflex : player.stats.speed;
  const heroTint = paceStat >= 7 ? "rgba(163,230,53,0.14)" : "rgba(96,165,250,0.14)";
  const narrowHeroTint = paceStat >= 7 ? "rgba(163,230,53,0.12)" : "rgba(96,165,250,0.12)";

  if (layout === "wide") {
    return (
      <div className="card-arcade rounded-xl overflow-hidden">
        {/* Hero — uses horizontal space */}
        <div
          className="relative px-6 py-8 md:px-10 md:py-10 flex flex-col sm:flex-row items-center gap-6 md:gap-10 rounded-t-xl overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${heroTint} 0%, rgba(255,255,255,0.03) 55%, rgba(255,255,255,0.02) 100%)`,
          }}
        >
          <div className="w-24 h-24 md:w-28 md:h-28 rounded-full border-2 border-primary/40 bg-muted/30 flex items-center justify-center shrink-0 shadow-lg shadow-primary/5">
            <span className="text-4xl md:text-5xl font-black text-primary font-display">
              {player.name.charAt(0)}
            </span>
          </div>

          <div className="flex-1 min-w-0 text-center sm:text-left">
            <h2 className="text-2xl md:text-3xl font-black text-foreground font-display tracking-tight m-0 leading-tight">
              {player.name}
            </h2>
            <p className="text-sm text-muted-foreground mt-1 m-0">{player.club}</p>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3">
              <span className={`text-[10px] font-black px-2 py-1 rounded-md border uppercase tracking-wider ${posColor}`}>
                {MAIN_ROLE_ABBR[mainRole]}
              </span>
              <span className="text-xs text-muted-foreground">
                {player.preferredFoot === "right" ? t("dashboard.playerCard.rightFoot") : t("dashboard.playerCard.leftFoot")} {t("common.foot")} · {player.age} {t("dashboard.playerCard.yearsOld")}
              </span>
            </div>
          </div>

          <AvgRing value={player.avg} size="lg" />
        </div>

        {/* Two columns: story | stats grid */}
        <div className="grid lg:grid-cols-2 border-t border-border/50">
          <div className="p-6 md:p-8 space-y-6 border-b lg:border-b-0 lg:border-r border-border/50">
            <div className="grid grid-cols-3 gap-4">
              <div className="card-arcade rounded-xl p-4 text-center border border-border/50">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 m-0">{t("dashboard.playerCard.value")}</p>
                <p className={`text-lg md:text-xl font-black font-display m-0 ${ratingTextClass10(player.avg)}`}>{player.value}</p>
              </div>
              <div className="card-arcade rounded-xl p-4 text-center border border-border/50">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 m-0">{t("dashboard.playerCard.salary")}</p>
                <p className="text-lg md:text-xl font-black text-foreground font-display m-0">{player.salary}</p>
              </div>
              <div className="card-arcade rounded-xl p-4 text-center border border-border/50">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 m-0">{t("dashboard.playerCard.energy")}</p>
                <p className="text-lg md:text-xl font-black text-foreground font-display m-0">{player.energy}%</p>
              </div>
            </div>
          </div>

          <div className="p-6 md:p-8">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-4">{t("dashboard.playerCard.attributes")}</p>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-6">
              {statGroups.map((group) => (
                <div key={group.label}>
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
                    {group.label}
                  </p>
                  <div className="space-y-2">
                    {group.keys.map((key) => (
                      <StatBar key={key} statKey={key} value={player.stats[key]} wide />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card-arcade rounded-xl">
      {/* Header */}
      <div
        className="relative p-4 flex items-center gap-3 rounded-t-xl overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${narrowHeroTint} 0%, rgba(255,255,255,0.03) 100%)`,
        }}
      >
        {/* Avatar */}
        <div className="w-12 h-12 rounded-full border-2 border-primary/40 bg-muted/30 flex items-center justify-center shrink-0">
          <span className="text-lg font-black text-primary font-display">
            {player.name.charAt(0)}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-foreground truncate leading-tight">{player.name}</p>
          <p className="text-[10px] text-muted-foreground truncate">{player.club}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase tracking-wider ${posColor}`}>
              {MAIN_ROLE_ABBR[mainRole]}
            </span>
            <span className="text-[9px] text-muted-foreground">
              {player.preferredFoot === "right" ? t("dashboard.playerCard.rightFoot") : t("dashboard.playerCard.leftFoot")} · {player.age}y
            </span>
          </div>
        </div>

        <AvgRing value={player.avg} />

      </div>

      {/* Stats */}
      <div className="px-4 pb-3 space-y-3 border-t border-border/50 pt-3">
        {statGroups.map(group => (
          <div key={group.label}>
            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.keys.map(key => (
                <StatBar
                  key={key}
                  statKey={key}
                  value={player.stats[key]}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer: value / salary / energy */}
      <div className="px-4 pb-4 border-t border-border/50 pt-3 grid grid-cols-3 gap-2">
        <div className="text-center">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">{t("dashboard.playerCard.value")}</p>
          <p className={`text-xs font-black font-display ${ratingTextClass10(player.avg)}`}>{player.value}</p>
        </div>
        <div className="text-center">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">{t("dashboard.playerCard.salary")}</p>
          <p className="text-xs font-black text-foreground font-display">{player.salary}</p>
        </div>
        <div className="text-center">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">{t("dashboard.playerCard.energy")}</p>
          <p className="text-xs font-black text-foreground font-display">{player.energy}%</p>
        </div>
      </div>
    </div>
  );
}
