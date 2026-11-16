import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { badgeCount, badgeReasons, type BadgeReason, type BadgeTab, type NavBadges } from "@/Domain/navBadges/navBadges";

const SEEN_MAX = 400;
const POLL_MS = 60_000;
const seenKey = (saveId: string) => `fm.nav.seen.${saveId}`;

function readSeen(saveId: string): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(seenKey(saveId)) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(-SEEN_MAX) : [];
  } catch {
    return [];
  }
}

function writeSeen(saveId: string, ids: string[]) {
  try { localStorage.setItem(seenKey(saveId), JSON.stringify(ids.slice(-SEEN_MAX))); } catch { /* no storage: this page only */ }
}

/**
 * The number on each menu tab (report 2026-11-16): problems plus news not seen yet. Reloaded on every day, every route
 * change and once a minute; opening a tab marks its news as seen.
 */
export interface TabBadgeView {
  count: number;
  /** One line per reason ("1 lesionado: B. Muniz"), for the tab's tooltip. */
  title: string;
}

const NAMED_ITEMS = new Set(["condemned", "facility"]);
const NAMED_ROLES = new Set(["staffVacant"]);

export function useNavBadges(saveId: string | undefined, currentDate: string, pathname: string): (tab: string) => TabBadgeView {
  const { t } = useTranslation();
  const [badges, setBadges] = useState<NavBadges>({});
  const [seen, setSeen] = useState<string[]>([]);

  useEffect(() => { setSeen(saveId ? readSeen(saveId) : []); }, [saveId]);

  useEffect(() => {
    if (!saveId) { setBadges({}); return; }
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`/api/saves/${saveId}/nav-badges`);
        if (!r.ok) return;
        const body = (await r.json()) as { badges?: NavBadges };
        if (alive) setBadges(body.badges ?? {});
      } catch { /* offline: keep the last numbers */ }
    };
    void load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [saveId, currentDate, pathname]);

  // The tab on screen: its news are seen.
  useEffect(() => {
    if (!saveId) return;
    const tab = (Object.keys(badges) as BadgeTab[]).find((k) => pathname.startsWith(k));
    const fresh = tab ? badges[tab]!.news.filter((id) => !seen.includes(id)) : [];
    if (fresh.length === 0) return;
    const next = [...seen, ...fresh];
    setSeen(next);
    writeSeen(saveId, next);
  }, [saveId, pathname, badges, seen]);

  return useMemo(() => {
    const set = new Set(seen);
    const line = (r: BadgeReason) => {
      const names = (r.names ?? []).map((n) => NAMED_ITEMS.has(r.kind) ? t(`facilities.item.${n}`) : NAMED_ROLES.has(r.kind) ? t(`staff.roles.${n}`) : n);
      const shown = names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3}` : "");
      const head = t(`nav.badge.${r.kind}`, { count: r.count });
      return shown ? `${head}: ${shown}` : head;
    };
    return (tab: string) => {
      const badge = badges[tab as BadgeTab];
      return { count: badgeCount(badge, set), title: badgeReasons(badge, set).map(line).join("\n") };
    };
  }, [badges, seen, t]);
}
