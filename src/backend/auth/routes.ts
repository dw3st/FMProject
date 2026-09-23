import {
  requestLoginCode,
  verifyLoginCode,
  deleteSession,
} from "@/backend/auth/AuthService";
import {
  setSessionCookieHeader,
  clearSessionCookieHeader,
  readSessionCookie,
} from "@/backend/auth/cookie";
import { getAuth } from "@/backend/auth/middleware";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
