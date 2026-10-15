// Calls an API route handler directly (no server). Tests only.
import { apiRoutes } from "@/backend/routes";

type Handler = (req: Request & { params: Record<string, string> }) => Response | Promise<Response>;

export interface CallResult {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
}

export async function callApi(
  method: "GET" | "POST" | "PUT" | "DELETE",
  pattern: string,
  token: string | null,
  opts: { params?: Record<string, string>; body?: unknown } = {},
): Promise<CallResult> {
  const params = opts.params ?? {};
  let path = pattern;
  for (const [k, v] of Object.entries(params)) path = path.replace(`:${k}`, encodeURIComponent(v));
  const headers: Record<string, string> = {};
  if (token) headers.cookie = `fs_session=${token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const req = Object.assign(
    new Request(`http://localhost:3000${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) }),
    { params },
  );
  const entry = (apiRoutes as Record<string, unknown>)[pattern];
  const handler = typeof entry === "function" ? (entry as Handler) : (entry as Record<string, Handler> | undefined)?.[method];
  if (!handler) throw new Error(`no ${method} on ${pattern}`);
  const res = await handler(req);
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json };
}

export const TEST_MANAGER = { name: "Ana Lima", nationalityIso: "br", backgroundId: "former-player" } as const;

/** A multiplayer world in `lobby` on Man Utd, created through `POST /api/saves`. */
export async function createMultiWorld(token: string): Promise<CallResult> {
  return callApi("POST", "/api/saves", token, {
    body: {
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Man Utd", clubColors: ["#da291c", "#ffffff"],
      manager: TEST_MANAGER, mode: "multi",
    },
  });
}
