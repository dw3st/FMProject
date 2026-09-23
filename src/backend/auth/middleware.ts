import { readSessionCookie } from "@/backend/auth/cookie";
import { getSessionByToken } from "@/backend/auth/AuthService";
import { isSaveOwner } from "@/backend/auth/saveOwnership";

export interface AuthContext { userId: string; email: string }

export function getAuth(req: Request): AuthContext | null {
  const token = readSessionCookie(req);
  if (!token) return null;
  const result = getSessionByToken(token);
  if (!result) return null;
  return { userId: result.user.id, email: result.user.email };
}

export function requireAuth(req: Request): AuthContext | Response {
  const auth = getAuth(req);
  if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });
  return auth;
}

export function requireSaveOwner(req: Request, saveId: string): AuthContext | Response {
  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;
  if (!isSaveOwner(saveId, auth.userId)) {
    return Response.json({ error: "save not found" }, { status: 404 });
  }
  return auth;
}
