import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { identifyUser, resetAnalytics } from "@/analytics";
import { loginUrlFor } from "@/GameInterface/authRedirect";
import { NicknameSetupScreen } from "@/GameInterface/NicknameSetupScreen";

type GateState = "loading" | "authed" | "redirecting";

export interface CurrentUser {
  id: string;
  email: string;
  isTester?: boolean;
  /** Chosen on the first sign-in; null = not chosen yet (the gate shows `NicknameSetupScreen`). */
  nickname?: string | null;
}

const CurrentUserContext = createContext<CurrentUser | null>(null);

/**
 * The signed-in user, as already fetched by the nearest `AuthGate` from `/api/auth/me` — reuse
 * this instead of calling `fetchCurrentUser()` again for something an ancestor already knows
 * (e.g. `isTester`). Returns `null` outside an `AuthGate` (public pages) or before the gate's own
 * fetch resolves — same "not known yet" meaning as a fresh `fetchCurrentUser()` call would have
 * while in flight.
 */
export function useCurrentUser(): CurrentUser | null {
  return useContext(CurrentUserContext);
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>("loading");
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          // The user first, then "authed": the nickname check must see it on the first authed render.
          const fetchedUser = (await res.json().catch(() => null)) as CurrentUser | null;
          if (cancelled) return;
          if (fetchedUser?.id) {
            setUser(fetchedUser);
            void identifyUser(fetchedUser);
          }
          setState("authed");
        } else {
          setState("redirecting");
          window.location.replace(loginUrlFor(window.location.pathname, window.location.search));
        }
      })
      .catch(() => {
        if (cancelled) return;
        setState("redirecting");
        window.location.replace(loginUrlFor(window.location.pathname, window.location.search));
      });
    return () => { cancelled = true; };
  }, []);

  if (state !== "authed") return null;
  // A server without the field (older build) never blocks: only an explicit null asks for the nickname.
  if (user && user.nickname === null) {
    return <NicknameSetupScreen onDone={(nickname) => setUser({ ...user, nickname })} />;
  }
  return <CurrentUserContext.Provider value={user}>{children}</CurrentUserContext.Provider>;
}

export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  try {
    const res = await fetch("/api/auth/me");
    if (!res.ok) return null;
    return (await res.json()) as CurrentUser;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } finally {
    await resetAnalytics().catch(() => {});
    try {
      localStorage.removeItem("fmproject:session");
    } catch {}
    window.location.href = "/login";
  }
}
