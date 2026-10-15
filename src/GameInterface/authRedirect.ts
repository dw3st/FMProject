/** Where the auth gate sends a signed-out user: the login, with the page to come back to. */
export function loginUrlFor(pathname: string, search: string): string {
  const here = `${pathname}${search}`;
  return here === "/" || pathname === "/login" ? "/login" : `/login?next=${encodeURIComponent(here)}`;
}

/** The page to open after the login: a same-site path from `?next=`, never the login itself; `/start` otherwise. */
export function safeNextPath(search: string): string {
  const next = new URLSearchParams(search).get("next");
  // Any control character (tab, newline…) or backslash is dropped by browsers inside URLs: reject outright.
  // eslint-disable-next-line no-control-regex
  if (!next || !next.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(next)) return "/start";
  let url: URL;
  try {
    url = new URL(next, "https://x.invalid");
  } catch {
    return "/start";
  }
  if (url.origin !== "https://x.invalid" || url.pathname.toLowerCase().startsWith("/login")) return "/start";
  return `${url.pathname}${url.search}${url.hash}`;
}
