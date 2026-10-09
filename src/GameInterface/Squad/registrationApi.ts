import type { RegistrationCompView } from "@/types/registrationTypes";

/** Client of the registration routes (`.claude/rules/game/registration.md` → Rotas). */
export class RegistrationApiError extends Error {
  constructor(public code: string, public kind?: string) {
    super(code);
  }
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new RegistrationApiError(String(body.error ?? res.status), typeof body.kind === "string" ? body.kind : undefined);
  return body as T;
}

export async function fetchRegistration(saveId: string): Promise<{ date: string; competitions: RegistrationCompView[] }> {
  return json(await fetch(`/api/saves/${saveId}/registration`));
}

export async function saveRegistration(saveId: string, competition: string, ids: string[]): Promise<RegistrationCompView> {
  return json(await fetch(`/api/saves/${saveId}/registration/${encodeURIComponent(competition)}`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }),
  }));
}

export async function resetRegistration(saveId: string, competition: string): Promise<RegistrationCompView> {
  return json(await fetch(`/api/saves/${saveId}/registration/${encodeURIComponent(competition)}/auto`, { method: "POST" }));
}

/** i18n key of a route error. */
export function registrationErrorKey(e: unknown): string {
  if (e instanceof RegistrationApiError) {
    if (e.code === "registrationClosed") return "registration.errors.closed";
    if (e.code === "ruleViolation") return `registration.reason.${e.kind ?? "listFull"}`;
    if (e.code === "notYourPlayer") return "registration.errors.notYourPlayer";
  }
  return "registration.errors.failed";
}
