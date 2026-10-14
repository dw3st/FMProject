/** A list of world news items grouped by day (newest first): crest or flag, headline, one line. */
import { useTranslation } from "react-i18next";
import type { NewsItem } from "@/types/newsTypes";
import type { LeagueData } from "@/types/playerTypes";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { Flag } from "@/GameInterface/Components/Flag";
import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";
import { newsHeadline, newsLine } from "@/GameInterface/News/newsText";

/** Crest of the first club, the flag of a national team, or nothing. */
export function NewsMark({ item }: { item: NewsItem }) {
  if (item.kind === "national") {
    const code = nationalityFlagCode(String(item.params.team ?? ""));
    return (
      <div className="w-8 h-8 shrink-0 flex items-center justify-center">
        {code && <Flag code={code} />}
      </div>
    );
  }
  const clubId = item.clubIds[0];
  if (!clubId) return <div className="w-8 h-8 shrink-0" aria-hidden />;
  return <ClubLogo logoUrl={squadLogoUrl(clubId)} />;
}

export function NewsRow({ item, leagues, withLine = true }: { item: NewsItem; leagues: LeagueData[]; withLine?: boolean }) {
  const { t, i18n } = useTranslation();
  const tf = (k: string, o?: Record<string, unknown>) => String(t(k, o ?? {}));
  const big = item.importance === 3;
  return (
    <li className={`flex items-start gap-3 py-2.5 ${big ? "border-l-2 border-primary pl-3" : ""}`}>
      <NewsMark item={item} />
      <div className="min-w-0 flex flex-col gap-0.5">
        <span className="font-semibold text-foreground">{newsHeadline(item, tf, leagues, i18n.language)}</span>
        {withLine && <span className="text-sm text-muted-foreground">{newsLine(item, tf, leagues, i18n.language)}</span>}
      </div>
    </li>
  );
}

function dayLabel(date: string, lang: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function NewsList({ items, leagues }: { items: NewsItem[]; leagues: LeagueData[] }) {
  const { i18n } = useTranslation();
  const days: { date: string; items: NewsItem[] }[] = [];
  for (const n of items) {
    const last = days[days.length - 1];
    if (last && last.date === n.date) last.items.push(n);
    else days.push({ date: n.date, items: [n] });
  }
  return (
    <div className="flex flex-col gap-6">
      {days.map((d) => (
        <section key={d.date} className="flex flex-col gap-1">
          <h3 className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
            {dayLabel(d.date, i18n.language)}
          </h3>
          <ul className="flex flex-col divide-y divide-border/50">
            {d.items.map((n) => <NewsRow key={n.id} item={n} leagues={leagues} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}
