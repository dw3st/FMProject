import { useTranslation } from "react-i18next";
import { Chip } from "@/GameInterface/ui/Chip";
import { DECOR_PALETTES, MOSAIC_PATTERNS, decorColors } from "@/Domain/achievements/decorStyle";
import type { StadiumDecor } from "@/types/achievementTypes";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";

function Swatch({ colors }: { colors: [string, string] }) {
  return (
    <span className="inline-flex shrink-0" aria-hidden="true">
      <span className="w-3 h-4" style={{ background: colors[0] }} />
      <span className="w-3 h-4" style={{ background: colors[1] }} />
    </span>
  );
}

/** Colours of the decorations and the mosaic's pixel-art design (tester report, 8.9.10). */
export function DecorStylePicker({ decor, clubColor, onChange }: {
  decor: StadiumDecor;
  clubColor: string;
  onChange: (patch: Partial<StadiumDecor>) => void;
}) {
  const { t } = useTranslation();
  const palette = decor.palette ?? "club";
  const custom = decor.colors ?? decorColors({ palette: "club" }, clubColor);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className={LABEL}>{t("achievements.decorStyle.colors")}</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {DECOR_PALETTES.map((p) => (
            <Chip
              key={p}
              selected={palette === p}
              onClick={() => onChange(p === "custom" ? { palette: p, colors: custom } : { palette: p })}
            >
              <Swatch colors={p === "custom" ? custom : decorColors({ palette: p }, clubColor)} />
              {t(`achievements.decorStyle.palette.${p}`)}
            </Chip>
          ))}
        </div>
        {palette === "custom" && (
          <div className="flex items-center gap-3">
            {([0, 1] as const).map((i) => (
              <label key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                {t(i === 0 ? "achievements.decorStyle.main" : "achievements.decorStyle.second")}
                <input
                  type="color"
                  value={custom[i]}
                  onChange={(e) => {
                    const next: [string, string] = [...custom];
                    next[i] = e.target.value;
                    onChange({ palette: "custom", colors: next });
                  }}
                  className="h-8 w-12 rounded border border-border bg-transparent cursor-pointer"
                />
              </label>
            ))}
          </div>
        )}
      </div>
      {decor.mosaic && (
        <div className="flex flex-col gap-1.5">
          <span className={LABEL}>{t("achievements.decorStyle.pattern")}</span>
          <div className="flex flex-wrap gap-1.5">
            {MOSAIC_PATTERNS.map((p) => (
              <Chip key={p} selected={(decor.pattern ?? "stripes") === p} onClick={() => onChange({ pattern: p })}>
                {t(`achievements.decorStyle.patterns.${p}`)}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
