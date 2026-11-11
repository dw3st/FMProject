import type { TFunction } from "i18next";
import type { AutoBioParts } from "@/Domain/managers/autoBio";
import type { ManagerTitle } from "@/types/managerTypes";

interface BioDeps {
  t: TFunction;
  country: string | null;
  competition: (slug: string) => string;
  titleName: (kind: ManagerTitle["kind"], competition: string) => string;
  clubName: (squadId: string) => string | null;
}

/** The sentences of an automatic bio (`managerPage.bio.*`, 8.9.40). */
export function autoBioText(p: AutoBioParts, d: BioDeps): string {
  const { t } = d;
  const out: string[] = [];
  if (d.country) out.push(t("managerPage.bio.country", { country: d.country }));
  const { job } = p;
  if (job.kind === "free") out.push(job.year ? t("managerPage.bio.freeSince", { year: job.year }) : t("managerPage.bio.free"));
  else if (job.club) {
    const key = job.kind === "interim" ? "interim" : "club";
    out.push(job.year ? t(`managerPage.bio.${key}Since`, { club: job.club, year: job.year }) : t(`managerPage.bio.${key}`, { club: job.club }));
  }
  if (p.career.first) out.push(t("managerPage.bio.firstJob"));
  else out.push(`${t("managerPage.bio.seasons", { count: p.career.seasons })} ${t("managerPage.bio.clubs", { count: p.career.clubs })}`);
  if (p.titles.best) {
    out.push(t("managerPage.bio.titles", { count: p.titles.count, best: d.titleName(p.titles.best.kind, p.titles.best.competition) }));
  } else out.push(t("managerPage.bio.noTitles"));
  const h = p.highlight;
  if (h?.kind === "world") out.push(t("managerPage.bio.world", { year: h.year }));
  else if (h?.kind === "league") out.push(t("managerPage.bio.bestManager", { league: d.competition(h.competition), season: h.season }));
  else if (h?.kind === "promotion") {
    const club = d.clubName(h.squadId);
    if (club) out.push(t("managerPage.bio.promotion", { club, season: h.season }));
  }
  return out.join(" ");
}
