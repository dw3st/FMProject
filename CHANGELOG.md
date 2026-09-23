# Changelog — TouchLines (homelab)

## [homelab-1.0.0] — 2026-09-21
### Adicionado
- Deploy no docker-host (192.168.18.52) na porta 9400, substituindo o AIL (Sports Manager Interativo).
- `docker-compose.yml` com serviço único `touchlines` (Bun), mapeando 9400→3000.
- Volume `./persistent` para saves e banco de login (`touchlines.db`), preservados entre rebuilds.
- `.env` sem SMTP2GO: o código de login é exibido no log do container.
- PostHog desativado (sem `POSTHOG_KEY`).

### Base
- Upstream: github.com/brenosss/touchlines @ 5c5c71a (2026-06-26), licença AGPL-3.0.
