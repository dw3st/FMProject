import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { badgeGroups, type BadgeGroup, type NavBadges } from "@/Domain/navBadges/navBadges";
import { Icon } from "@/GameInterface/Icons";

/**
 * What lights the Squad tab, on the Squad screen itself (report 8b435dc7: the badge only explained itself in the tab's
 * tooltip and was gone once the tab opened). Same items as the menu badge (`navBadges`), all of them, seen or not;
 * nothing when there is nothing to say. Own club only.
 */
export function SquadAttentionStrip({ saveId, currentDate, playerHref }: {
  saveId: string;
  currentDate: string;
  playerHref: (id: string) => string;
}) {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<BadgeGroup[]>([]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/saves/${saveId}/nav-badges`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { badges?: NavBadges } | null) => { if (alive && body) setGroups(badgeGroups(body.badges?.["/squad"])); })
      .catch(() => { /* offline: no strip */ });
    return () => { alive = false; };
  }, [saveId, currentDate]);

  if (groups.length === 0) return null;
  return (
    <div className="flex items-start gap-3 rounded-md border border-chart-4/40 bg-chart-4/10 px-4 py-2.5 text-sm">
      <Icon name="alert" size={16} className="text-chart-4 shrink-0 mt-0.5" />
      <ul className="flex flex-wrap gap-x-5 gap-y-1 m-0 p-0 list-none">
        {groups.map((g) => (
          <li key={g.kind}>
            <span className="font-semibold text-foreground tabular-nums">{t(`nav.badge.${g.kind}`, { count: g.entries.length })}</span>
            {g.entries.some((e) => e.name) && <span className="text-muted-foreground">: </span>}
            {g.entries.filter((e) => e.name).map((e, i) => (
              <span key={`${e.playerId ?? e.name}-${i}`}>
                {i > 0 && <span className="text-muted-foreground">, </span>}
                {e.playerId
                  ? <a href={playerHref(e.playerId)} className="text-foreground hover:text-primary underline-offset-2 hover:underline">{e.name}</a>
                  : <span className="text-foreground">{e.name}</span>}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
