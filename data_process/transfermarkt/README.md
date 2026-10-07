# Transfermarkt (recalibração de notas e posições)

Pasta de entrada para a recalibração dos jogadores com dados do Transfermarkt, obtidos de uma cópia local da API não oficial
[felipeall/transfermarkt-api](https://github.com/felipeall/transfermarkt-api).

## Subir a API

1. Clonar em `C:/Projects/transfermarkt-api`.
2. Criar o venv: `py -3.12 -m venv .venv`.
3. Instalar as dependências do `pyproject.toml` com `.venv/Scripts/pip install ...`.
4. Rodar: `.venv/Scripts/python -m uvicorn app.main:app --port 8765`.

## Formato das respostas

- `GET /competitions/search/<nome>` → `{"results":[{"id":"GB1","name":"Premier League","country":"England"}]}` (paginado: `?page_number=N`, `lastPageNumber`).
- `GET /competitions/GB1/clubs?season_id=2026` → `{"id","seasonId","clubs":[{"id","name"}]}`.
- `GET /clubs/985/players?season_id=2026` → `{"id","players":[{"id","name","position","dateOfBirth","age","nationality":[...],"height","foot","marketValue"}]}`.
  `marketValue` é número (pode ser `null`), `height` em cm.

A temporada atual é `season_id=2026` (com 2025 `marketValue` e `age` vêm `null`).

## Arquivos

- `leagueMap.json`: `slug da nossa liga → id da competição no Transfermarkt` (`null` = sem cobertura confiável).
- `cache/`: respostas cruas da API (`comp-<id>-<S>.json`, `club-<id>-<S>.json`).
- `derived.json`: o único dado derivado que vai para o repositório.

## Regra

O cache e os valores de mercado **nunca** entram no repositório (a pasta `cache/` está no `.gitignore`); só o `derived.json`.
