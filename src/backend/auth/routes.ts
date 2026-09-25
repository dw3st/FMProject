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
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

function isDevAutoLoginAllowed(req: Request): boolean {
  if (process.env.DEV_AUTO_LOGIN !== "1") return false;
  if (process.env.NODE_ENV === "production") return false;
  let hostname: string;
  try {
    hostname = new URL(req.url).hostname;
  } catch {
    return false;
  }
  return LOCAL_HOSTNAMES.has(hostname);
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

  "/api/auth/dev-login": async (req: Request) => {
    if (!isDevAutoLoginAllowed(req)) return new Response("Not Found", { status: 404 });

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
