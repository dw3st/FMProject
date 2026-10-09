import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { YouthCompAge } from "@/types/youthCompTypes";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { YouthCompView, type YouthCompData } from "@/GameInterface/Components/YouthCompView";

/** Slugs of a country's youth competitions (`GET /youth-comps?country=`). */
export type YouthSlugs = { u21: string | null; u19: string | null };

/** The Leagues screen "Youth" tab: under-21 / under-19 switch and the selected competition. */
export function YouthCompTab({ saveId, slugs, myClubId }: { saveId: string; slugs: YouthSlugs; myClubId: string }) {
  const { t } = useTranslation();
  const ages = (["u21", "u19"] as const).filter((a) => slugs[a]);
  const [age, setAge] = useState<YouthCompAge>(ages[0] ?? "u21");
  const slug = slugs[age] ?? slugs[ages[0] ?? "u21"];
  const [data, setData] = useState<YouthCompData | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setData(null);
    setMissing(false);
    setError(false);
    fetch(`/api/saves/${saveId}/youth-comps/${slug}`)
      .then((r) => {
        if (!r.ok) {
          if (!cancelled) setMissing(true);
          return null;
        }
        return r.json() as Promise<YouthCompData>;
      })
      .catch(() => {
        if (!cancelled) setError(true);
        return null;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      });
    return () => {
      cancelled = true;
    };
  }, [saveId, slug]);

  return (
    <div className="space-y-4">
      <SegmentedTabs
        compact
        tabs={ages.map((a) => ({ key: a, label: t(`youthComps.${a}`) }))}
        active={age}
        onChange={setAge}
      />
      {error ? (
        <p className="text-destructive text-sm p-6">{t("warnings.errors.loadFailed")}</p>
      ) : missing || !slug ? (
        <p className="text-muted-foreground text-sm p-6">{t("youthComps.none")}</p>
      ) : data ? (
        <YouthCompView key={slug} data={data} myClubId={myClubId} />
      ) : (
        <p className="text-muted-foreground text-sm p-6">{t("cups.loading")}</p>
      )}
    </div>
  );
}
