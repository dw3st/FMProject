import { readSessionCookie } from "@/backend/auth/cookie";
import { getSessionByToken } from "@/backend/auth/AuthService";
import { memberOf } from "@/backend/auth/saveOwnership";
import type { MemberRole } from "@/types/seatTypes";

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

/** The authenticated user acting as his seat of a world (`.claude/rules/game/multiplayer.md`). */
export interface SeatAuth extends AuthContext {
  seatId: string;
  role: MemberRole;
}

/**
 * 401 without a session; 404 when the user is not a member of the world (the save "does not exist" for him).
 * Every route of the manager acts on `seatId`; the world's routes accept any member.
 */
export function requireSeat(req: Request, saveId: string): SeatAuth | Response {
  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;
  const member = memberOf(saveId, auth.userId);
  if (!member) return Response.json({ error: "save not found" }, { status: 404 });
  return { ...auth, seatId: member.seatId, role: member.role };
}
