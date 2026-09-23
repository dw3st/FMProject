import { DEFAULT_TACTICAL_STYLE } from "@/types/tacticsTypes";
import type { TacticalStyle, TacticsSave } from "@/types/tacticsTypes";
import type { TrainingIntensity } from "@/types/developmentTypes";
import { DEFAULT_MIN_ENERGY_TO_TRAIN, DEFAULT_TRAINING_INTENSITY } from "@/types/developmentTypes";
import type { SaveMeta, SaveDatabase, SaveManager } from "@/backend/SaveService";

const STORAGE_KEY = "touchlines:session";

export interface GameSession {
  saveId: string;
  leagueSlug: string;
  leagueName: string;
  clubId: string;
  clubName: string;
  clubColors: [string, string];
  budget: number;
  database?: SaveDatabase;
  manager?:  SaveManager;
  /** Formation id (e.g. "4-3-3"). Persisted in save file. */
  formation: string;
  /** User-facing tactical style. */
  tactical_style: TacticalStyle;
  /** Current in-game date "YYYY-MM-DD". */
  currentDate?: string;
  min_energy_to_train?: number;
  training_intensity?: TrainingIntensity;
}

function sessionFromSave(save: Record<string, unknown>): GameSession {
  return {
    saveId: save.id as string,
    leagueSlug: save.leagueSlug as string,
    leagueName: save.leagueName as string,
    clubId: save.clubId as string,
    clubName: save.clubName as string,
    clubColors: save.clubColors as [string, string],
    budget: (save.budget as number) ?? 0,
    database: save.database as SaveDatabase | undefined,
    manager:  save.manager  as SaveManager  | undefined,
    formation: (save.formation as string) ?? "4-3-3",
    currentDate: save.currentDate as string | undefined,
    tactical_style: (save.tactical_style as TacticalStyle) ?? DEFAULT_TACTICAL_STYLE,
    min_energy_to_train:
      save.min_energy_to_train != null
        ? Math.min(100, Math.max(0, Number(save.min_energy_to_train)))
        : DEFAULT_MIN_ENERGY_TO_TRAIN,
    training_intensity:
      (save.training_intensity as TrainingIntensity | undefined) ?? DEFAULT_TRAINING_INTENSITY,
  };
}

export function saveSession(session: GameSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function loadSession(): GameSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed.saveId) return null;
    if (!parsed.formation) parsed.formation = "4-3-3";
    if (parsed.tactical_style == null) parsed.tactical_style = DEFAULT_TACTICAL_STYLE;
    if (parsed.min_energy_to_train == null) parsed.min_energy_to_train = DEFAULT_MIN_ENERGY_TO_TRAIN;
    if (parsed.training_intensity == null) parsed.training_intensity = DEFAULT_TRAINING_INTENSITY;
    // Migrate old sessions that stored clubMoney instead of budget
    if (parsed.budget == null) parsed.budget = (parsed as Record<string, unknown>).clubMoney ?? 0;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    return parsed as unknown as GameSession;
  } catch {
    return null;
  }
}

export function updateSessionCurrentDate(currentDate: string) {
  const session = loadSession();
  if (!session) return;
  saveSession({ ...session, currentDate });
}

export function updateSessionBudget(budget: number) {
  const session = loadSession();
  if (!session) return;
  saveSession({ ...session, budget });
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export function requireSession(): GameSession {
  const session = loadSession();
  if (!session) {
    window.location.href = "/start";
    throw new Error("No active game session");
  }
  return session;
}

export async function createGameSave(data: {
  leagueSlug: string;
  leagueName: string;
  clubId: string;
  clubName: string;
  clubColors: [string, string];
  budget: number;
  database?: SaveDatabase;
  manager?:  SaveManager;
}): Promise<GameSession> {
  const res = await fetch("/api/saves", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Failed to create save");
  }
  const save = await res.json();
  const session = sessionFromSave(save);
  saveSession(session);
  return session;
}

export async function loadGameSave(saveId: string): Promise<GameSession> {
  const res = await fetch(`/api/saves/${saveId}`);
  if (!res.ok) throw new Error("Save not found");
  const save = await res.json();
  const session = sessionFromSave(save);
  saveSession(session);
  return session;
}

/** Update formation in the tactics file and in the current session. */
export async function updateSaveFormation(saveId: string, formation: string): Promise<GameSession> {
  const res = await fetch(`/api/saves/${saveId}/tactics`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ formation }),
  });
  if (!res.ok) throw new Error("Failed to update formation");
  const tactics = await res.json() as TacticsSave;
  const session = loadSession();
  if (!session) throw new Error("No session");
  const updated = { ...session, formation: tactics.formation };
  saveSession(updated);
  return updated;
}

/** Update tactical style in the tactics file and in the current session. */
export async function updateSaveTacticalStyle(
  saveId: string,
  tactical_style: TacticalStyle,
): Promise<GameSession> {
  const res = await fetch(`/api/saves/${saveId}/tactics`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tactical_style }),
  });
  if (!res.ok) throw new Error("Failed to update tactics");
  const saved = await res.json() as TacticsSave;
  const session = loadSession();
  if (!session) throw new Error("No session");
  const updated: GameSession = {
    ...session,
    tactical_style: saved.tactical_style,
  };
  saveSession(updated);
  return updated;
}

/** Persist formation + tactical style + lineup to the tactics file and update session. */
export async function saveFormationAndTactics(
  saveId: string,
  config: { formation: string; tactical_style: TacticalStyle; lineup?: string[] },
): Promise<GameSession> {
  const res = await fetch(`/api/saves/${saveId}/tactics`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error("Failed to save");
  const saved = await res.json() as TacticsSave;
  const session = loadSession();
  if (!session) throw new Error("No session");
  const updated: GameSession = {
    ...session,
    formation:      saved.formation,
    tactical_style: saved.tactical_style,
  };
  saveSession(updated);
  return updated;
}

/** Persist current simulation date ("YYYY-MM-DD") to the save file. */
export async function updateSaveCurrentDate(saveId: string, currentDate: string): Promise<void> {
  await fetch(`/api/saves/${saveId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ currentDate }),
  });
}

/** Persist training policy (rest-day sessions for your club). */
export async function updateSaveDevelopmentTraining(
  saveId: string,
  patch: { min_energy_to_train?: number; training_intensity?: TrainingIntensity },
): Promise<Pick<SaveMeta, "min_energy_to_train" | "training_intensity">> {
  const res = await fetch(`/api/saves/${saveId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("Failed to save training settings");
  const meta = (await res.json()) as SaveMeta;
  return {
    min_energy_to_train: meta.min_energy_to_train ?? DEFAULT_MIN_ENERGY_TO_TRAIN,
    training_intensity: meta.training_intensity ?? DEFAULT_TRAINING_INTENSITY,
  };
}

export async function deleteGameSave(saveId: string): Promise<void> {
  await fetch(`/api/saves/${saveId}`, { method: "DELETE" });
  const current = loadSession();
  if (current?.saveId === saveId) {
    clearSession();
  }
}
