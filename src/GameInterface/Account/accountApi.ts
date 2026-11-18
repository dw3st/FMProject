import type { AccountProfileView, AccountTrackId } from "@/types/accountTypes";

export async function fetchAccountProfile(nickname?: string): Promise<AccountProfileView | null> {
  try {
    const qs = nickname ? `?nickname=${encodeURIComponent(nickname)}` : "";
    const r = await fetch(`/api/account/profile${qs}`);
    return r.ok ? ((await r.json()) as AccountProfileView) : null;
  } catch {
    return null;
  }
}

export async function saveAccountBadges(badges: AccountTrackId[]): Promise<AccountTrackId[] | null> {
  try {
    const r = await fetch("/api/account/badges", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ badges }),
    });
    return r.ok ? ((await r.json()) as { badges: AccountTrackId[] }).badges : null;
  } catch {
    return null;
  }
}
