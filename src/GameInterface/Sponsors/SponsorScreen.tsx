import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatEuros } from "@/Domain/money";
import { competitionName, nationalityDisplayName } from "@/Domain/world/labels";
import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { Flag } from "@/GameInterface/Components/Flag";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { formatGameDate } from "@/GameInterface/formatDate";
import { SponsorPlate } from "@/GameInterface/Sponsors/SponsorPlate";
import { SPONSORS_PANEL_HREF } from "@/GameInterface/Sponsors/sponsorLinks";
import { fetchSponsorCompany } from "@/GameInterface/Sponsors/sponsorsApi";
import { perSeason, sponsorGoalText, sponsorProgressText, sponsorProgressTone } from "@/GameInterface/Sponsors/sponsorText";
import { HumanBadge } from "@/GameInterface/World/HumanBadge";
import { useHumanClubs } from "@/GameInterface/World/useHumanClubs";
import { useLeagueCatalog } from "@/GameInterface/World/useLeagueCatalog";
import { followLinkOnly, navigate } from "@/GameInterface/router/navigation";
import { Button } from "@/GameInterface/ui/Button";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";
import { ScreenTitle } from "@/GameInterface/ui/ScreenTitle";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { TABLE_CELL, TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import type { SponsorClubRef, SponsorCompanyView, SponsorSlot } from "@/types/sponsorTypes";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0";
const CARD = "rounded-md border border-border bg-card p-5 flex flex-col gap-4 min-w-0";
const TONE = { met: "text-chart-2", missed: "text-destructive", unknown: "text-muted-foreground" } as const;
const SLOT_ORDER: readonly SponsorSlot[] = ["master", "kit", "board"];

const clubHref = (c: Pick<SponsorClubRef, "leagueSlug" | "squadId">) =>
  c.leagueSlug ? `/squad/${encodeURIComponent(c.leagueSlug)}/${encodeURIComponent(c.squadId)}` : null;

/** A club's crest and name, a link to its page; a club run by a person carries the manager's badge. */
function ClubLink({ club, nickname, mine, extra }: { club: SponsorClubRef; nickname?: string; mine: boolean; extra?: string }) {
  const { t } = useTranslation();
  const href = clubHref(club);
  return (
    <span className="flex items-center gap-2 min-w-0">
      <ClubLogo logoUrl={squadLogoUrl(club.squadId)} className={TABLE_STYLE.crest} imgClassName="w-full h-full object-contain" title={club.name} />
      {href
        ? <a href={href} onClick={followLinkOnly} className="font-semibold text-foreground no-underline hover:text-primary hover:underline truncate">{club.name}</a>
        : <span className="font-semibold text-foreground truncate">{club.name}</span>}
      {extra && <span className="text-sm text-muted-foreground tabular-nums whitespace-nowrap">{extra}</span>}
      {nickname ? <HumanBadge nickname={nickname} /> : mine ? <span className="text-sm text-primary whitespace-nowrap">{t("sponsors.page.yourClub")}</span> : null}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3">
      <p className={LABEL}>{label}</p>
      <p className="font-display font-bold text-3xl leading-none tabular-nums m-0 mt-1.5">{value}</p>
    </div>
  );
}

function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className={LABEL}>{label}</dt>
      <dd className="m-0 text-sm text-foreground tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * A sponsor's page (12.1, `.claude/rules/game/sponsors.md` → "Página do patrocinador"): the company and how it
 * behaves, the manager's own dealings with it, the clubs it sponsors today, what clubs did with it on the shirt and
 * its finished contracts with the clubs run by people.
 */
export function SponsorScreen({ companyId }: { companyId: string }) {
  const { t, i18n } = useTranslation();
  const { session } = useGameSave();
  const leagues = useLeagueCatalog();
  const humanClubs = useHumanClubs(session?.saveId, !!session?.groupAdvance);
  const [data, setData] = useState<SponsorCompanyView | null>(null);
  const [failed, setFailed] = useState<"notFound" | "load" | null>(null);
  const saveId = session?.saveId;
  const lang = i18n.language;

  useEffect(() => {
    if (!saveId) return;
    let alive = true;
    setData(null);
    setFailed(null);
    void fetchSponsorCompany(saveId, companyId, lang).then((r) => {
      if (!alive) return;
      if (r.ok) setData(r.view);
      else setFailed(r.status === 404 ? "notFound" : "load");
    });
    return () => { alive = false; };
  }, [saveId, companyId, lang]);

  if (failed || !data) {
    return (
      <ScreenContainer>
        <ScreenTitle accent={t("screenTitles.sponsor.accent")}>{t("screenTitles.sponsor.main")}</ScreenTitle>
        <p className="text-sm text-muted-foreground m-0">
          {failed === "notFound" ? t("sponsors.page.notFound") : failed ? t("sponsors.page.loadFailed") : t("sponsors.loading")}
        </p>
      </ScreenContainer>
    );
  }

  const { company, current, results, history, mine } = data;
  const myClubId = session?.clubId ?? "";
  const league = (slug: string) => competitionName(slug, leagues, lang);
  const day = (iso: string) => formatGameDate(iso, lang);
  const ordinal = (n: number) => t("sponsors.page.place", { count: n, ordinal: true });
  const flag = company.country ? nationalityFlagCode(company.country) : undefined;
  const sector = t(`sponsors.sector.${company.sector}`, { defaultValue: "" });
  const nowBy = new Map(results.now.map((n) => [n.squadId, n]));
  const sponsoring = SLOT_ORDER.reduce((n, s) => n + current[s].length, 0);
  const hasMine = !!mine && (mine.contract !== null || mine.offers.length > 0 || mine.history.length > 0);
  const resultText = (row: SponsorCompanyView["results"]["rows"][number]) => [
    ...row.titles.map((title) => t("sponsors.page.result.title", { competition: league(title.slice(title.indexOf(":") + 1)) })),
    ...(row.move ? [t(`sponsors.page.result.${row.move}`)] : []),
  ].join(" · ");

  return (
    <ScreenContainer>
      <ScreenTitle accent={company.name}>{t("screenTitles.sponsor.main")}</ScreenTitle>

      <div className="flex flex-wrap items-start gap-5">
        <SponsorPlate company={company} size="lg" className="max-w-full" />
        <div className="flex flex-col gap-2 min-w-0 flex-1 basis-80">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground m-0">
            {sector && <span className="text-foreground font-semibold">{sector}</span>}
            <span>{t(`sponsors.page.size.${company.size}`)}</span>
            {company.country && (
              <span className="inline-flex items-center gap-1.5">
                {flag && <Flag code={flag} />}
                {nationalityDisplayName(company.country, lang, t)}
              </span>
            )}
          </p>
          {company.bio && <p className="text-base text-foreground m-0 max-w-3xl">{company.bio}</p>}
          {company.trait !== "none" && (
            <p className="text-sm text-muted-foreground m-0 max-w-3xl">
              <span className={LABEL}>{t("sponsors.page.trait")}</span>{" "}
              <span className="font-semibold text-primary">{t(`sponsors.trait.${company.trait}.name`)}</span>
              {" · "}
              {t(`sponsors.trait.${company.trait}.hint`)}
            </p>
          )}
        </div>
      </div>

      {hasMine && mine && (
        <section className={CARD}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle>{t("sponsors.page.mine.title")}</SectionTitle>
            <Button variant="secondary" className="border border-border" onClick={() => { navigate(SPONSORS_PANEL_HREF); }}>{t("sponsors.page.mine.open")}</Button>
          </div>
          {mine.contract && (
            <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3 m-0">
              <Term label={t(`sponsors.slot.${mine.contract.slot}`)}>
                <span className="font-display font-bold text-lg text-primary">{perSeason(mine.contract.annual, t)}</span>
                <span className="block text-muted-foreground">{t("sponsors.seasons", { count: mine.contract.seasonsLeft })}{" "}{t("sponsors.page.mine.left")}</span>
              </Term>
              <Term label={t("sponsors.goalLabel")}>
                <span className="block">{sponsorGoalText(mine.contract.goal, t, lang)}</span>
                <span className={`block ${TONE[sponsorProgressTone(mine.contract.progress)]}`}>{sponsorProgressText(mine.contract.goal, mine.contract.progress, t, lang)}</span>
              </Term>
              <Term label={t("sponsors.page.mine.paid")}>
                <span className="block tabular-nums">{formatEuros(mine.contract.paid?.fixed ?? 0)}</span>
                <span className="block tabular-nums text-muted-foreground">{t("sponsors.page.mine.bonusPaid", { value: formatEuros(mine.contract.paid?.bonus ?? 0), bonus: formatEuros(mine.contract.bonus) })}</span>
              </Term>
              <Term label={t("sponsors.page.mine.goals")}>
                {t("sponsors.page.mine.goalsMet", { met: mine.contract.paid?.met ?? 0, total: (mine.contract.paid?.met ?? 0) + (mine.contract.paid?.missed ?? 0) })}
              </Term>
            </dl>
          )}
          {mine.offers.length > 0 && (
            <ul className="m-0 p-0 list-none flex flex-col gap-1">
              {mine.offers.map((o) => (
                <li key={o.id} className="text-sm text-foreground tabular-nums">
                  <span className="font-semibold">{t(o.renewal ? "sponsors.page.mine.renewal" : "sponsors.page.mine.offer")}</span>
                  <span className="text-muted-foreground">
                    {` · ${t(`sponsors.slot.${o.slot}`)} · ${perSeason(o.annual, t)} · ${t("sponsors.seasons", { count: o.years })} · ${t("sponsors.expires", { date: day(o.expires) })}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {mine.history.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className={LABEL}>{t("sponsors.page.mine.past")}</p>
              <ul className="m-0 p-0 list-none flex flex-col gap-1">
                {mine.history.map((h, i) => (
                  <li key={`${h.from}${h.slot}${i}`} className="text-sm text-foreground tabular-nums">
                    <span className="font-semibold">{t(`sponsors.slot.${h.slot}`)}</span>
                    <span className="text-muted-foreground">
                      {` · ${day(h.from)} – ${day(h.to)} · ${t("sponsors.page.mine.pastPaid", { fixed: formatEuros(h.fixedPaid), bonus: formatEuros(h.bonusPaid) })} · ${t("sponsors.page.mine.goalsMet", { met: h.goalsMet, total: h.goalsMet + h.goalsMissed })} · ${t(`sponsors.page.end.${h.end}`)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className={CARD}>
        <SectionTitle>{t("sponsors.page.current.title")}</SectionTitle>
        {sponsoring === 0 ? (
          <p className="text-sm text-muted-foreground m-0">{t("sponsors.page.current.none")}</p>
        ) : SLOT_ORDER.filter((slot) => current[slot].length > 0).map((slot) => (
          <div key={slot} className="flex flex-col gap-2">
            <p className={LABEL}>{t(`sponsors.slot.${slot}`)} · <span className="tabular-nums">{current[slot].length}</span></p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-2">
              {current[slot].map((club) => {
                const now = slot === "master" ? nowBy.get(club.squadId) : undefined;
                return (
                  <ClubLink
                    key={club.squadId} club={club} nickname={humanClubs.get(club.squadId)} mine={club.squadId === myClubId}
                    extra={now && now.position !== null ? t("sponsors.page.current.place", { place: ordinal(now.position), size: now.size }) : undefined}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-4">
        <SectionTitle>{t("sponsors.page.results.title")}</SectionTitle>
        {results.seasons === 0 ? (
          <p className="text-sm text-muted-foreground m-0">{t("sponsors.page.results.none")}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label={t("sponsors.page.results.seasons")} value={results.seasons} />
              <Stat label={t("sponsors.page.results.titles")} value={results.titles} />
              <Stat label={t("sponsors.page.results.promotions")} value={results.promotions} />
              <Stat label={t("sponsors.page.results.relegations")} value={results.relegations} />
            </div>
            <div className={TABLE_STYLE.shell}>
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className={TABLE_STYLE.head}>
                    <th className={TABLE_CELL.head}>{t("sponsors.page.col.season")}</th>
                    <th className={TABLE_CELL.head}>{t("sponsors.page.col.club")}</th>
                    <th className={TABLE_CELL.head}>{t("sponsors.page.col.league")}</th>
                    <th className={`${TABLE_CELL.head} text-center`}>{t("sponsors.page.col.position")}</th>
                    <th className={TABLE_CELL.head}>{t("sponsors.page.col.result")}</th>
                  </tr>
                </thead>
                <tbody className={TABLE_STYLE.body}>
                  {results.rows.map((row) => (
                    <tr key={`${row.squadId}${row.season}`} className={`${TABLE_STYLE.row} ${row.squadId === myClubId ? TABLE_STYLE.rowHighlight : ""}`}>
                      <td className={`${TABLE_CELL.body} text-sm text-muted-foreground tabular-nums whitespace-nowrap`}>{row.season}</td>
                      <td className={TABLE_CELL.body}><ClubLink club={row} nickname={humanClubs.get(row.squadId)} mine={false} /></td>
                      <td className={`${TABLE_CELL.body} text-sm text-muted-foreground`}>{league(row.league)}</td>
                      <td className={`${TABLE_CELL.body} ${TABLE_STYLE.key}`}>{row.position === null ? "—" : ordinal(row.position)}</td>
                      <td className={`${TABLE_CELL.body} text-sm text-foreground`}>{resultText(row) || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <SectionTitle>{t("sponsors.page.history.title")}</SectionTitle>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground m-0">{t("sponsors.page.history.none")}</p>
        ) : (
          <div className={TABLE_STYLE.shell}>
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className={TABLE_STYLE.head}>
                  <th className={TABLE_CELL.head}>{t("sponsors.page.col.club")}</th>
                  <th className={TABLE_CELL.head}>{t("sponsors.page.col.slot")}</th>
                  <th className={TABLE_CELL.head}>{t("sponsors.page.col.period")}</th>
                  <th className={`${TABLE_CELL.head} text-center`}>{t("sponsors.page.col.seasons")}</th>
                  <th className={TABLE_CELL.head}>{t("sponsors.page.col.end")}</th>
                </tr>
              </thead>
              <tbody className={TABLE_STYLE.body}>
                {history.map((h, i) => (
                  <tr key={`${h.squadId}${h.from}${h.slot}${i}`} className={`${TABLE_STYLE.row} ${h.squadId === myClubId ? TABLE_STYLE.rowHighlight : ""}`}>
                    <td className={TABLE_CELL.body}><ClubLink club={h} nickname={humanClubs.get(h.squadId)} mine={false} /></td>
                    <td className={`${TABLE_CELL.body} text-sm text-foreground`}>{t(`sponsors.slot.${h.slot}`)}</td>
                    <td className={`${TABLE_CELL.body} text-sm text-muted-foreground tabular-nums whitespace-nowrap`}>{`${day(h.from)} – ${day(h.to)}`}</td>
                    <td className={`${TABLE_CELL.body} ${TABLE_STYLE.number}`}>{h.seasons}</td>
                    <td className={`${TABLE_CELL.body} text-sm text-foreground`}>{t(`sponsors.page.end.${h.end}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </ScreenContainer>
  );
}
