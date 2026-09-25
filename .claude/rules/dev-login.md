# Dev auto login

`GET /api/auth/dev-login` (`src/backend/auth/routes.ts`) skips the email-code flow during local
development. It behaves as 404 unless **all** of these hold:

- `DEV_AUTO_LOGIN=1`
- `NODE_ENV !== "production"`
- the request host is `localhost` or `127.0.0.1`

When allowed, it finds-or-creates the `dev@localhost` user (`AuthService.devAutoLogin`), opens a
session the same way `verifyLoginCode` does, sets the same session cookie (`fs_session`), and
redirects (302) to `/start`.

## Usage

```bash
DEV_AUTO_LOGIN=1 bun src/index.ts
```

Then open `http://localhost:3000/api/auth/dev-login` in the browser — it logs you in and redirects
to `/start`. Never set `DEV_AUTO_LOGIN=1` in production; the route is host- and env-gated so it is
inert even if the variable leaks into a deployed environment.
