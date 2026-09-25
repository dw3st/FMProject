# Dev auto login

`GET /api/auth/dev-login` (`src/backend/auth/routes.ts`) skips the email-code flow during local
development. It behaves as 404 unless **all** of these hold:

- `DEV_AUTO_LOGIN=1` (exactly `"1"` — `"true"`, `"0"`, etc. all refuse)
- `NODE_ENV === "development"` (fails closed — unset, `"test"`, or anything else refuses, not
  just `"production"`)
- the request's `Host` resolves to `localhost`, `127.0.0.1` or `[::1]`
- **and** the socket the request actually arrived on is loopback
  (`server.requestIP(req)?.address` ∈ `{"127.0.0.1", "::1", "::ffff:127.0.0.1"}`)

The socket check exists because the `Host` header is just a string the client sends — it proves
nothing on its own. Checking the real socket address is what makes the route inert in Docker or
behind a reverse proxy, even if something forwards a `Host: localhost` header.

`AuthService.devAutoLogin` also refuses to run (throws) when `NODE_ENV === "production"`, as a
second, independent guard in case the route's own gate is ever changed or bypassed.

When allowed, it finds-or-creates the `dev@localhost` user, opens a session the same way
`verifyLoginCode` does, sets the same session cookie (`fs_session`), and redirects (302) to
`/start`.

## Usage

```bash
DEV_AUTO_LOGIN=1 bun run dev
```

`bun run dev` sets `NODE_ENV=development` for you (see `package.json`). Then open
`http://localhost:3000/api/auth/dev-login` in the browser — it logs you in and redirects to
`/start`. If you start the server another way, set `NODE_ENV=development` explicitly.

## Notes

- Inert in production (`NODE_ENV=production` — or anything but `development`) and inert in Docker
  or behind a proxy, because the deploy's socket address is never loopback there.
- It's a plain `GET` with no CSRF token. That's acceptable only because the route is unreachable
  except from a process running on your own machine — it grants a session to whoever loads that
  URL, so never make it reachable from anywhere else.
