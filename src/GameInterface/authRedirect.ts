/** Where the auth gate sends a signed-out user: the login, with the page to come back to. */
export function loginUrlFor(pathname: string, search: string): string {
  const here = `${pathname}${search}`;
  return here === "/" || pathname === "/login" ? "/login" : `/login?next=${encodeURIComponent(here)}`;
}

/** The page to open after the login: a same-site path from `?next=`, never the login itself; `/start` otherwise. */
export function safeNextPath(search: string): string {
  const next = new URLSearchParams(search).get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || next.startsWith("/login")) return "/start";
  return next;
}
