import {
  requestLoginCode,
  verifyLoginCode,
  deleteSession,
  devAutoLogin,
} from "@/backend/auth/AuthService";
import {
  setSessionCookieHeader,
  clearSessionCookieHeader,
  readSessionCookie,
} from "@/backend/auth/cookie";
import { getAuth } from "@/backend/auth/middleware";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DEV_LOGIN_EMAIL = "dev@localhost";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
const LOOPBACK_SOCKET_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** Narrow shape of Bun's `Server` we depend on — easy to stub in tests, structurally
 *  satisfied by the real `Server` Bun passes to every route handler. */
export interface RequestIPServer {
  requestIP(req: Request): { address: string } | null;
}

/**
 * Dev-only auto login is gated on FOUR independent conditions, all required:
 *  1. DEV_AUTO_LOGIN=1 (explicit opt-in)
 *  2. NODE_ENV === "development" (fail closed — anything else, including unset, refuses)
 *  3. the request's Host header resolves to a loopback hostname
 *  4. the actual socket the request arrived on is a loopback address
 * (3) alone is spoofable by any client setting its Host header; (4) is the real guarantee
 * that the request physically originated on this machine (relevant behind a reverse proxy
 * or in Docker, where a forwarded Host header could claim to be localhost).
 */
function isDevAutoLoginAllowed(req: Request, server: RequestIPServer): boolean {
  if (process.env.DEV_AUTO_LOGIN !== "1") return false;
  if (process.env.NODE_ENV !== "development") return false;

  let hostname: string;
  try {
    hostname = new URL(req.url).hostname;
  } catch {
    return false;
  }
  if (!LOCAL_HOSTNAMES.has(hostname)) return false;

  const socketAddress = server.requestIP(req)?.address;
  if (!socketAddress || !LOOPBACK_SOCKET_ADDRESSES.has(socketAddress)) return false;

  return true;
}

export const authRoutes = {
  "/api/auth/request-code": async (req: Request) => {
    if (req.method !== "POST")
      return Response.json({ error: "method not allowed" }, { status: 405 });
    let body: { email?: unknown };
    try {
      body = (await req.json()) as { email?: unknown };
    } catch {
      return Response.json({ error: "invalid body" }, { status: 400 });
    }
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!email || !EMAIL_RE.test(email))
      return Response.json({ error: "invalid email" }, { status: 400 });
    try {
      await requestLoginCode(email);
    } catch (e) {
      console.error("[auth] failed to send login code:", e);
      return Response.json(
        { error: "could not send login code, please try again" },
        { status: 502 },
      );
    }
    return Response.json({ ok: true });
  },

  "/api/auth/verify": async (req: Request) => {
    if (req.method !== "POST")
      return Response.json({ error: "method not allowed" }, { status: 405 });
    let body: { email?: unknown; code?: unknown };
    try {
      body = (await req.json()) as { email?: unknown; code?: unknown };
    } catch {
      return Response.json({ error: "invalid body" }, { status: 400 });
    }
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const code  = typeof body.code  === "string" ? body.code.trim()  : "";
    if (!email || !code)
      return Response.json({ error: "email and code required" }, { status: 400 });

    const result = verifyLoginCode(email, code);
    if (!result)
      return Response.json({ error: "invalid or expired code" }, { status: 401 });

    return Response.json(
      { user: { id: result.user.id, email: result.user.email } },
      {
        headers: {
          "Set-Cookie": setSessionCookieHeader(
            result.session.token,
            result.session.expiresAt,
          ),
        },
      },
    );
  },

  "/api/auth/me": async (req: Request) => {
    const auth = getAuth(req);
    if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });
    return Response.json({ id: auth.userId, email: auth.email });
  },

  "/api/auth/dev-login": async (req: Request, server: RequestIPServer) => {
    if (!isDevAutoLoginAllowed(req, server)) return new Response("Not Found", { status: 404 });

    const { session } = devAutoLogin(DEV_LOGIN_EMAIL);
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/start",
        "Set-Cookie": setSessionCookieHeader(session.token, session.expiresAt),
      },
    });
  },

  "/api/auth/logout": async (req: Request) => {
    if (req.method !== "POST")
      return Response.json({ error: "method not allowed" }, { status: 405 });
    const token = readSessionCookie(req);
    if (token) deleteSession(token);
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": clearSessionCookieHeader() } },
    );
  },
};
