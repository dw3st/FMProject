// Test helpers for the rivals routes. Never imported by production code.
import { apiRoutes } from "@/backend/routes";
import type { SeatResult } from "@/types/rivalsTypes";

type Handler = { GET?: (r: Request) => Promise<Response>; POST?: (r: Request) => Promise<Response> };
export const call = (path: string, method: "GET" | "POST", saveId: string, token: string, query = "", body?: unknown) => {
  const handler = apiRoutes[path as keyof typeof apiRoutes] as unknown as Handler;
  const url = `http://localhost${path.replace(":saveId", saveId)}${query}`;
  return handler[method]!(Object.assign(
    new Request(url, {
      method, headers: { cookie: `fs_session=${token}`, ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    { params: { saveId } },
  ));
};

export const result = (seatId: string, date: string, f: number, a: number): SeatResult => ({
  id: `${date}:premier_league:f-${seatId}:${seatId}`, date, seatId, nickname: seatId, clubId: `club-${seatId}`,
  clubName: `Club ${seatId}`, opponentId: "x", opponentName: "X", home: true, competition: "premier_league",
  score: { for: f, against: a }, goals: [], situations: [f > a ? "win" : f < a ? "loss" : "draw", ...(f < a ? ["home_loss" as const] : [])],
});
