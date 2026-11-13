import { useEffect, useMemo, useState } from "react";
import { DialogTitle } from "@headlessui/react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/GameInterface/Components/Modal";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { Icon } from "@/GameInterface/Icons";
import { groupByMonth } from "@/Domain/changelog/changelogMonths";
import { sortByTab, type ChangelogTab } from "@/Domain/changelog/changelogTabs";
import type { ChangelogEntry, ChangelogText } from "@/Domain/changelog/changelogData";

interface Props {
  open: boolean;
  onClose: () => void;
}

function localizedDate(iso: string, locale: string): string {
  const d = new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
}

function monthLabel(month: string, locale: string): string {
  const d = new Date(month + "-15T12:00:00");
  if (Number.isNaN(d.getTime())) return month;
  return d.toLocaleDateString(locale, { month: "long", year: "numeric" });
}

/** One colour per tab, so a release reads at a glance (tester report). */
const TAB_TONE: Record<ChangelogTab, string> = {
  match: "text-emerald-400",
  squad: "text-chart-2",
  formation: "text-sky-400",
  club: "text-chart-3",
  development: "text-primary",
  finances: "text-chart-4",
  staff: "text-violet-400",
  leagues: "text-amber-400",
  market: "text-chart-5",
  scout: "text-teal-300",
  stats: "text-indigo-300",
  manager: "text-rose-300",
  friends: "text-fuchsia-300",
  general: "text-muted-foreground",
};

/** An item's text with its tab in brackets before it. */
function ItemText({ item, lang }: { item: ChangelogText; lang: "pt" | "en" }) {
  const { t } = useTranslation();
  return (
    <>
      {item.tab && (
        <span className={`mr-1.5 font-display font-bold uppercase tracking-[0.08em] text-[13px] whitespace-nowrap ${TAB_TONE[item.tab]}`}>
          [{t(`changelog.tabs.${item.tab}`)}]
        </span>
      )}
      {item[lang]}
    </>
  );
}

/** "Novidades" / "What's new" — see .claude/rules/changelog.md. */
export function ChangelogModal({ open, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const lang: "pt" | "en" = i18n.language?.toLowerCase().startsWith("pt") ? "pt" : "en";
  const dateLocale = lang === "pt" ? "pt-BR" : "en-US";
  const [tab, setTab] = useState<"news" | "upcoming">("news");
  // Fetched when opened (the text is not in the page bundle).
  const [data, setData] = useState<{ changelog: ChangelogEntry[]; upcoming: ChangelogText[] } | null>(null);
  useEffect(() => {
    if (!open || data) return;
    let cancelled = false;
    fetch("/api/changelog")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setData(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, data]);
  const changelog = data?.changelog ?? [];
  const upcoming = data?.upcoming ?? [];
  const months = useMemo(() => groupByMonth(changelog), [data]);
  const [opened, setOpened] = useState<Record<string, boolean>>({});

  return (
    <Modal open={open} onClose={onClose} size="md">
      <div className="flex flex-col">
        <div className="px-6 py-4 border-b border-border bg-card/50">
          <DialogTitle
            as="h2"
            className="text-lg font-bold font-display text-foreground uppercase tracking-[0.08em] m-0"
          >
            {t("changelog.title")}
          </DialogTitle>
          <p className="text-sm text-muted-foreground m-0 mt-0.5">
            {t(tab === "news" ? "changelog.subtitle" : "changelog.upcomingSubtitle")}
          </p>
          <SegmentedTabs
            className="mt-3"
            tabs={[
              { key: "news", label: t("changelog.tabNews") },
              { key: "upcoming", label: t("changelog.tabUpcoming") },
            ]}
            active={tab}
            onChange={setTab}
          />
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {tab === "upcoming" && (
            <ul className="list-disc pl-5 space-y-1 text-sm text-foreground/90 m-0">
              {upcoming.map((item, i) => (
                <li key={i}>{item[lang]}</li>
              ))}
            </ul>
          )}
          {tab === "news" && months.map(({ month, entries }, index) => {
            // The current month is open; a click opens or closes any of them.
            const isOpen = opened[month] ?? index === 0;
            return (
              <div key={month}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpened((prev) => ({ ...prev, [month]: !isOpen }))}
                  className="w-full flex items-center justify-between gap-3 min-h-10 bg-transparent border-0 border-b border-border p-0 text-foreground cursor-pointer"
                >
                  <span className="font-display font-black uppercase text-xl leading-none">{monthLabel(month, dateLocale)}</span>
                  <span className="flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
                    {t("changelog.versions", { count: entries.length })}
                    <Icon name={isOpen ? "chevron-up" : "chevron-down"} size={16} />
                  </span>
                </button>
                {isOpen && (
                  <div className="mt-4 space-y-6">
                    {entries.map((entry) => (
                    <section key={entry.version}>
                      <div className="flex items-baseline gap-2 mb-2">
                        <h3 className="font-display font-black uppercase text-xl leading-none m-0">
                          {t("changelog.version", { version: entry.version })}
                        </h3>
                        <span className="text-[13px] text-muted-foreground uppercase tracking-[0.08em] font-display font-bold">
                          {localizedDate(entry.date, dateLocale)}{entry.time ? ` · ${entry.time}` : ""}
                        </span>
                      </div>

                      <ul className="list-disc pl-5 space-y-1 text-sm text-foreground/90">
                        {sortByTab(entry.items).map((item, i) => (
                          <li key={i}><ItemText item={item} lang={lang} /></li>
                        ))}
                      </ul>

                      {entry.fixes && entry.fixes.length > 0 && (
                        <div className="mt-2">
                          <span className="block text-[13px] font-bold uppercase tracking-[0.08em] font-display text-muted-foreground mb-1">
                            {t("changelog.fixes")}
                          </span>
                          <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                            {sortByTab(entry.fixes).map((fix, i) => (
                              <li key={i}><ItemText item={fix} lang={lang} /></li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </section>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
