import { useEffect, useState, type ReactNode } from "react";
import { identifyUser, resetAnalytics } from "@/analytics";

type GateState = "loading" | "authed" | "redirecting";

export interface CurrentUser { id: string; email: string; isTester?: boolean }

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>("loading");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          setState("authed");
          const user = (await res.json().catch(() => null)) as CurrentUser | null;
          if (user?.id && !cancelled) void identifyUser(user);
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
  return <>{children}</>;
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
