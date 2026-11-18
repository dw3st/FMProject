import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { attrDisplay } from "@/Domain/attributes";
import { attributeText } from "@/GameInterface/attributeText";
import { formatGameDate } from "@/GameInterface/formatDate";
import type { DevHistoryPoint, DevLogEntry } from "@/types/playerTypes";

const W = 300;
const H = 90;

/** OVR (0..100 display) by week as a line, with the first and last week below. */
function OvrChart({ points, lang, aria }: { points: readonly DevHistoryPoint[]; lang: string; aria: string }) {
  const values = points.map((p) => attrDisplay(p.ovr));
  const lo = Math.min(...values) - 1;
  const hi = Math.max(...values) + 1;
  const x = (i: number) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * W);
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const path = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <div>
      <div className="flex items-start gap-3">
        <div className="flex flex-col justify-between h-[90px] text-sm text-muted-foreground tabular-nums shrink-0">
          <span>{Math.max(...values)}</span>
          <span>{Math.min(...values)}</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-[90px]" role="img" aria-label={aria}>
          <polyline points={path} fill="none" className="stroke-primary" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          {values.map((v, i) => (
            <circle key={i} cx={x(i)} cy={y(v)} r={2.5} className="fill-primary" />
          ))}
        </svg>
      </div>
      <div className="flex justify-between text-sm text-muted-foreground mt-1 pl-8">
        <span>{formatGameDate(points[0]!.date, lang, "dayMonth")}</span>
        <span>{formatGameDate(points.at(-1)!.date, lang, "dayMonth")}</span>
      </div>
    </div>
  );
}

export function DevHistoryPanel({ history, log }: { history?: readonly DevHistoryPoint[]; log?: readonly DevLogEntry[] }) {
  const { t, i18n } = useTranslation();
  const k = "developmentScreen.history";
  const points = history ?? [];
  const entries = [...(log ?? [])].reverse();
  const label = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0 mb-2";

  return (
    <div className="card-arcade rounded-md p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon name="activity" className="w-5 h-5 text-primary" />
        <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t(`${k}.title`)}</h3>
      </div>
      {points.length === 0 && entries.length === 0 ? (
        <p className="text-sm text-muted-foreground m-0">{t(`${k}.empty`)}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 phone:grid-cols-2 gap-6">
          <div>
            <p className={label}>{t(`${k}.ovrTitle`)}</p>
            {points.length > 0 ? (
              <OvrChart
                points={points}
                lang={i18n.language}
                aria={t(`${k}.chartAria`, {
                  from: formatGameDate(points[0]!.date, i18n.language, "dayMonth"),
                  to: formatGameDate(points.at(-1)!.date, i18n.language, "dayMonth"),
                })}
              />
            ) : (
              <p className="text-sm text-muted-foreground m-0">{t(`${k}.empty`)}</p>
            )}
          </div>
          <div>
            <p className={label}>{t(`${k}.changesTitle`)}</p>
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground m-0">{t(`${k}.noChanges`)}</p>
            ) : (
              <ul className="m-0 p-0 list-none max-h-56 overflow-y-auto divide-y divide-border/50">
                {entries.map((e, i) => {
                  const pts = Math.round(e.delta * 10);
                  return (
                    <li key={i} className="flex items-center gap-2 py-1.5 text-sm">
                      <span className={`font-bold tabular-nums w-10 shrink-0 ${pts > 0 ? "text-chart-2" : "text-destructive"}`}>
                        {pts > 0 ? `+${pts}` : `−${Math.abs(pts)}`}
                      </span>
                      <span className="flex-1 min-w-0 truncate text-foreground">{attributeText(t, e.stat).name}</span>
                      <span className="text-muted-foreground tabular-nums shrink-0">
                        {formatGameDate(e.date, i18n.language, "dayMonth")} · {t(`${k}.source.${e.source}`)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
