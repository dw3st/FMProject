import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { identifyUser, resetAnalytics } from "@/analytics";

type GateState = "loading" | "authed" | "redirecting";

export interface CurrentUser { id: string; email: string; isTester?: boolean }

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
          setState("authed");
          const fetchedUser = (await res.json().catch(() => null)) as CurrentUser | null;
          if (fetchedUser?.id && !cancelled) {
            setUser(fetchedUser);
            void identifyUser(fetchedUser);
          }
        } else {
          setState("redirecting");
          window.location.replace("/login");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setState("redirecting");
        window.location.replace("/login");
      });
    return () => { cancelled = true; };
  }, []);

  if (state !== "authed") return null;
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
