// Calls a social route handler directly (no server). Tests only.
import { socialRoutes } from "@/backend/social/socialRoutes";

type Handler = (req: Request & { params: Record<string, string> }) => Response | Promise<Response>;

export interface CallResult {
  status: number;
  text: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
}

export async function callSocial(
  method: "GET" | "POST" | "PUT" | "DELETE",
  pattern: keyof typeof socialRoutes,
  token: string | null,
  opts: { body?: unknown; params?: Record<string, string>; query?: Record<string, string> } = {},
): Promise<CallResult> {
  const params = opts.params ?? {};
  let path: string = pattern;
  for (const [k, v] of Object.entries(params)) path = path.replace(`:${k}`, encodeURIComponent(v));
  const qs = opts.query ? `?${new URLSearchParams(opts.query).toString()}` : "";
  const headers: Record<string, string> = {};
  if (token) headers.cookie = `fs_session=${token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const req = new Request(`http://localhost:3000${path}${qs}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  }) as Request & { params: Record<string, string> };
  req.params = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, encodeURIComponent(v)]));
  const table = socialRoutes[pattern] as unknown as Record<string, Handler>;
  const handler = table[method];
  if (!handler) throw new Error(`no ${method} on ${pattern}`);
  const res = await handler(req);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, text, json };
}
