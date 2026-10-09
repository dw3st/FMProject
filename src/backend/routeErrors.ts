import { logError } from "@/Logger";

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

type Handler = (req: never, ...rest: never[]) => Response | Promise<Response>;

function routeName(req: unknown): string {
  try {
    const r = req as Request;
    return `${r.method} ${new URL(r.url).pathname}`;
  } catch {
    return "unknown route";
  }
}

/** One handler: a throw (sync or async) becomes a logged JSON 500, never Bun's plain-text error page. */
function guard<H extends Handler>(handler: H): H {
  const call = handler as unknown as (...args: unknown[]) => Response | Promise<Response>;
  const wrapped = async (...args: unknown[]): Promise<Response> => {
    try {
      return await call(...args);
    } catch (e) {
      logError("api", `unhandled error in ${routeName(args[0])}`, e instanceof Error ? (e.stack ?? e) : e);
      const message = e instanceof Error ? e.message : String(e);
      return Response.json({ error: `internal error: ${message}` }, { status: 500 });
    }
  };
  return wrapped as unknown as H;
}

/**
 * Wraps every API route handler (functions and `{ GET, POST… }` method objects) so an uncaught
 * exception answers `{ error }` with status 500 and is logged with its stack. Without it Bun answers
 * "Something went wrong!" in plain text and the screens' `res.json()` fails. Other values (HTML
 * bundles, static responses) pass through untouched.
 */
export function withJsonErrors<T extends Record<string, unknown>>(routes: T): T {
  const out: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(routes)) {
    if (typeof value === "function") {
      out[path] = guard(value as Handler);
    } else if (
      value && typeof value === "object" && !(value instanceof Response)
      && Object.keys(value).length > 0 && Object.keys(value).every((k) => HTTP_METHODS.has(k))
    ) {
      out[path] = Object.fromEntries(Object.entries(value).map(([m, h]) => [m, typeof h === "function" ? guard(h as Handler) : h]));
    } else {
      out[path] = value;
    }
  }
  return out as T;
}
