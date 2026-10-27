/**
 * The other manager waiting in the match room (multiplayer part 7): kept per tab (`sessionStorage`) so the top bar
 * and the preview still know it after a page change. Readers always check it against today's game of the seat, so
 * a stale one (another day, another world) is never shown.
 */
export interface H2HInvite {
  saveId: string;
  fixtureId: string;
  /** The waiting manager (nickname, or his club). */
  from: string;
}

export const H2H_INVITE_KEY = "fm.h2h.invite.v1";

export function parseH2HInvite(raw: string | null): H2HInvite | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (!v || typeof v !== "object") return null;
    const { saveId, fixtureId, from } = v;
    if (typeof saveId !== "string" || typeof fixtureId !== "string" || typeof from !== "string") return null;
    if (!saveId || !fixtureId) return null;
    return { saveId, fixtureId, from };
  } catch {
    return null;
  }
}

/** The stored invite, only when it is for this world's game `fixtureId`. */
export function inviteFor(invite: H2HInvite | null, saveId: string | null | undefined, fixtureId: string | null | undefined): H2HInvite | null {
  if (!invite || !saveId || !fixtureId) return null;
  return invite.saveId === saveId && invite.fixtureId === fixtureId ? invite : null;
}

export function readH2HInvite(): H2HInvite | null {
  try {
    return parseH2HInvite(sessionStorage.getItem(H2H_INVITE_KEY));
  } catch {
    return null;
  }
}

export function writeH2HInvite(invite: H2HInvite | null): void {
  try {
    if (invite) sessionStorage.setItem(H2H_INVITE_KEY, JSON.stringify(invite));
    else sessionStorage.removeItem(H2H_INVITE_KEY);
  } catch {
    // private window or blocked storage: the invite lives only on this page
  }
}
