import type { PressConferenceView, PressRecord } from "@/types/pressTypes";

export interface PressResponse { pending: PressConferenceView | null; history: PressRecord[] }

export async function fetchPress(saveId: string): Promise<PressResponse> {
  const res = await fetch(`/api/saves/${saveId}/press`);
  if (!res.ok) throw new Error(`press ${res.status}`);
  return res.json();
}

/** Body of `POST /press/:pressId`: one entry per answered question. */
export function answersPayload(answers: Record<string, string>): { answers: { questionId: string; answerId: string }[] } {
  return { answers: Object.entries(answers).map(([questionId, answerId]) => ({ questionId, answerId })) };
}

/** Every question of the conference has an answer picked. */
export function allAnswered(c: Pick<PressConferenceView, "questions">, answers: Record<string, string>): boolean {
  return c.questions.every((q) => q.answers.some((a) => a.id === answers[q.id]));
}

/** Last day the invite can be answered: the conference expires at the START of `expires`. */
export function lastValidDay(expires: string): string {
  const d = new Date(`${expires}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function answerPress(
  saveId: string,
  pressId: string,
  answers: Record<string, string>,
): Promise<{ ok: true } | { error: string }> {
  const res = await fetch(`/api/saves/${saveId}/press/${encodeURIComponent(pressId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(answersPayload(answers)),
  });
  return res.ok ? { ok: true } : ((await res.json().catch(() => ({ error: "unknown" }))) as { error: string });
}
