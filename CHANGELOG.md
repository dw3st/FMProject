# Changelog — FMProject (homelab)

## [homelab-1.1.0] — 2026-09-24
### Alterado
- Nome do jogo: TouchLines → **FMProject** em toda a interface (logo, títulos das abas, landing, e-mail de login, FAQ). O rodapé credita o TouchLines original (AGPL-3.0) e o link do código aponta para `dw3st/FMProject`.
- Nomes internos: banco de login `touchlines.db` → `fmproject.db`; serviço, imagem e container Docker `touchlines` → `fmproject`; chaves do `localStorage` `touchlines:*` → `fmproject:*` (todo mundo precisa entrar de novo); servidor MCP `touchlines-engine` → `fmproject-engine`.
- **Ao atualizar o deploy:** renomeie `persistent/touchlines.db` para `persistent/fmproject.db` antes de subir, senão os logins começam do zero. O container antigo `touchlines` precisa ser removido (`docker compose down` antes do pull).

### Removido
- Seção de vídeo demo da landing, botão "Ver trailer" e o projeto Remotion `promo-video/`.

## [homelab-1.0.0] — 2026-09-21
### Adicionado
- Deploy no docker-host (192.168.18.52) na porta 9400, substituindo o AIL (Sports Manager Interativo).
- `docker-compose.yml` com serviço único `touchlines` (Bun), mapeando 9400→3000.
- Volume `./persistent` para saves e banco de login (`touchlines.db`), preservados entre rebuilds.
- `.env` sem SMTP2GO: o código de login é exibido no log do container.
- PostHog desativado (sem `POSTHOG_KEY`).

### Base
- Upstream: github.com/brenosss/touchlines @ 5c5c71a (2026-06-26), licença AGPL-3.0.
