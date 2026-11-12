import type { PressConferenceView, PressRecordView } from "@/types/pressTypes";

export interface PressResponse { pending: PressConferenceView | null; history: PressRecordView[] }

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

export async function answerPress(
  saveId: string,
  pressId: string,
  answers: Record<string, string>,
): Promise<{ ok: true; fine?: number; banned?: number } | { error: string }> {
  const res = await fetch(`/api/saves/${saveId}/press/${encodeURIComponent(pressId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(answersPayload(answers)),
  });
  const json = await res.json().catch(() => null);
  return res.ok ? { ok: true, ...(json ?? {}) } : ((json ?? { error: "unknown" }) as { error: string });
}

/** The director goes to the conference in the manager's place: no effect and no penalty. */
export async function sendDirectorToPress(saveId: string, pressId: string): Promise<boolean> {
  const res = await fetch(`/api/saves/${saveId}/press/${encodeURIComponent(pressId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ director: true }),
  });
  return res.ok;
}
