import { useTranslation } from "react-i18next";
import { formationForSimId } from "@/Domain/matchFormations";
import { CUSTOM_FORMATION_ID } from "@/Domain/formation/zones";
import type { MatchSetupKnowledge } from "@/types/studyTypes";
import type { TacticalStyle } from "@/types/tacticsTypes";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { TitleParts } from "@/GameInterface/ui/TitleParts";
import { Button } from "@/GameInterface/ui/Button";
import { navigate } from "@/GameInterface/router/navigation";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0";

type Tone = { fill: string; bar: string; dim: string; text: string };
const THEM: Tone = { fill: "fill-chart-4", bar: "bg-chart-4", dim: "bg-chart-4/35", text: "text-chart-4" };
const YOU: Tone = { fill: "fill-primary", bar: "bg-primary", dim: "bg-primary/35", text: "text-primary" };

/** Mini pitch of a ready-made formation, attacking to the right; a free formation shows only the label. */
function ShapePitch({ formation, tone }: { formation: string; tone: Tone }) {
  if (formation === CUSTOM_FORMATION_ID) return null;
  const slots = formationForSimId(formation).attacking;
  return (
    <svg viewBox="0 0 115 74" className="w-40 h-[103px] shrink-0 rounded-md" aria-hidden="true">
      <rect x="0" y="0" width="115" height="74" className="fill-chart-2/15 stroke-border" strokeWidth="0.8" />
      <line x1="57.5" y1="0" x2="57.5" y2="74" className="stroke-border" strokeWidth="0.6" />
      <circle cx="57.5" cy="37" r="9" className="stroke-border fill-none" strokeWidth="0.6" />
      {slots.map((s, i) => (
        <circle key={i} cx={Math.min(111, Math.max(4, s.x))} cy={s.y} r="3.2" className={tone.fill} />
      ))}
    </svg>
  );
}

function Bar({ low, high, tone }: { low: number; high: number; tone: Tone }) {
  return (
    <div className="relative h-1.5 w-full min-w-16 rounded bg-border">
      {low === high
        ? <div className={`absolute inset-y-0 left-0 rounded ${tone.bar}`} style={{ width: `${high}%` }} />
        : <div className={`absolute inset-y-0 rounded ${tone.dim}`} style={{ left: `${low}%`, width: `${Math.max(2, high - low)}%` }} />}
    </div>
  );
}

function Row({ label, formation, style, low, high, tone, tag, tagClass, empty }: {
  label: string; formation?: string; style?: TacticalStyle; low?: number; high?: number; tone: Tone;
  tag?: string; tagClass?: string; empty?: string;
}) {
  const { t } = useTranslation();
  const plan = formation && style
    ? `${formation === CUSTOM_FORMATION_ID ? t("study.freeFormation") : formation} · ${t(`tactics.styles.${style}.label`)}`
    : null;
  return (
    <div className="flex items-center gap-4 rounded-md border border-border bg-secondary/20 p-3">
      {formation && <ShapePitch formation={formation} tone={tone} />}
      <div className="flex flex-col gap-2 min-w-0 flex-1">
        <p className={LABEL}>{label}</p>
        {plan === null || low === undefined || high === undefined ? (
          <p className="text-sm text-muted-foreground m-0">{empty}</p>
        ) : (
          <>
            <p className="font-display font-black uppercase text-xl leading-none m-0 text-foreground">{plan}</p>
            <div className="flex items-center gap-3">
              <Bar low={low} high={high} tone={tone} />
              <span className={`font-display font-bold tabular-nums text-2xl leading-none whitespace-nowrap ${tone.text}`}>
                {low === high ? `${high}%` : `${low}–${high}%`}
              </span>
            </div>
            {tag && <span className={`self-start rounded-full border px-2 py-0.5 text-sm ${tagClass}`}>{tag}</span>}
          </>
        )}
      </div>
    </div>
  );
}

/** Tactical knowledge of the match preview (tester report 6dcd454e): how well each side has read the other. */
export function TacticalKnowledgeCard({ knowledge, clubName }: { knowledge: MatchSetupKnowledge; clubName: string }) {
  const { t } = useTranslation();
  const theirs = knowledge.theirs;
  const yours = knowledge.yours;
  return (
    <div className="card-arcade rounded-md p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <SectionTitle><TitleParts accent={t("knowledge.titleAccent")}>{t("knowledge.title")}</TitleParts></SectionTitle>
          <p className="text-sm text-muted-foreground m-0">{t("knowledge.subtitle", { club: clubName })}</p>
        </div>
        <Button variant="secondary" onClick={() => { navigate("/formation"); }}>{t("knowledge.change")}</Button>
      </div>
      <Row
        label={t("knowledge.theirs", { club: clubName })}
        formation={theirs?.expected.formation}
        style={theirs?.expected.style}
        low={theirs?.now}
        high={theirs?.now}
        tone={THEM}
        tag={theirs ? (theirs.surprise ? t("knowledge.surprise", { read: theirs.read }) : t("knowledge.expected")) : undefined}
        tagClass={theirs?.surprise ? "border-star-green/50 text-star-green" : "border-chart-4/50 text-chart-4"}
        empty={t("knowledge.notStudied")}
      />
      <Row
        label={t("knowledge.yours", { club: clubName })}
        formation={yours?.expected.formation}
        style={yours?.expected.style}
        low={yours?.low}
        high={yours?.high}
        tone={YOU}
        tag={yours ? (yours.mayMiss ? t("knowledge.analystMayMiss", { stars: yours.analystStars }) : t("knowledge.analystExact")) : undefined}
        tagClass="border-border text-muted-foreground"
        empty={t("knowledge.noGames")}
      />
    </div>
  );
}
