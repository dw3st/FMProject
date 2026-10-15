# Multiplayer parte 2 (liga de amigos) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** um técnico cria uma liga de amigos no novo jogo ("Com amigos"), convida amigos por link com código ou pela
lista de amigos, até 8 técnicos escolhem clubes numa sala de espera (`lobby`), o dono começa o mundo (`running`), e
membros podem sair, ser tirados, passar a posse e apagar o mundo — o clube de quem sai volta à IA.

**Spec:** `docs/superpowers/specs/2026-10-15-multiplayer-world-design.md`. A parte 3
(`docs/superpowers/specs/2026-10-15-multiplayer-group-advance-design.md`, avanço em grupo) tem plano próprio: aqui só
deixamos prontos `WorldState.deadlineHours`, a rota `PUT /api/worlds/:saveId/settings`, a lista de mundos por código
(`listWorldCodeIds`) e o evento de socket `world_members`, que ela vai usar.

**Architecture:**
- **Estado do mundo.** `SaveMeta.world?: WorldState` (`phase`, `inviteCode`, `deadlineHours`, `createdBy`), só em
  `mode: "multi"`. O solo não ganha nada. Duas tabelas novas no SQLite (só acrescentam): `world_codes` (código →
  mundo, sem abrir metas) e `world_invites` (convites pela lista de amigos). A posse continua em `save_members`.
- **Assentos.** `addSeat` (parte 1) ganha erros tipados (`SeatError`), o teto de 8 conferido dentro do lock e
  `sackingEnabled`. `removeSeat` (novo, `src/backend/seats.ts`) devolve o clube à IA como uma demissão
  (`releaseHumanClub` + `sackHumanManager` com `left: "left_world"` + vaga), apaga a pasta do assento
  (`ISaveDAL.deleteSeat`, bufferizado) e a linha de `save_members`.
- **Rotas.** `src/backend/worlds/worldRoutes.ts` (`/api/worlds/...`): visão do mundo, por código, entrar, convites,
  trocar código, prazo, começar, tirar, sair, passar a posse. `src/backend/worlds/worldLifecycle.ts` concentra o que as
  rotas compartilham (criar o estado, visão, apagar o mundo, anúncio de entrada/saída na caixa, nas notícias e no
  socket). `POST /api/saves` aceita `mode: "multi"` (sem `/presimulate`); `DELETE /api/saves/:id` avisa os membros.
  O corpo do `/presimulate` vira `presimulateWorld` (exportado), chamado também por `POST /api/worlds/:saveId/start`.
- **Socket.** Cinco `ServerEvent` novos (`world_invite`, `world_started`, `world_removed`, `world_deleted`,
  `world_members`), entregues por `notifyUser` (`realtime.ts`) só a membros (ou ao convidado).
- **Telas.** Passo "Sozinho / Com amigos" no `NewGameWizard`; o mesmo assistente em modo "entrar" na página
  `/join/:code`; tela `/world` ("SUA **LIGA**") dentro do `Layout`, com redirecionamento de todas as telas do jogo para
  ela enquanto o mundo está em `lobby`; ícone de liga na barra superior (só multi); selos, papel e "Sair da liga" no
  `/start`; convites para ligas no painel de Amigos; o `AuthGate` volta para a página pedida depois do login.

**Tech Stack:** TypeScript, Bun (`bun test`, `bun:sqlite`), React 19 + Tailwind v4, i18next.

## Convenções (valem para todas as tarefas)

- Imports sempre `@/…` (nunca relativos).
- Sem migração de save (protótipo). Sem versão nova nem changelog nesta branch (saem na release conjunta com a parte 3).
- Arquivos `.ts`/`.tsx` existentes estão em CRLF: edite com a ferramenta Edit (preserva o fim de linha). Nunca `sed -i`,
  nunca `Set-Content` do PowerShell. Os JSON de locale estão em LF; também com Edit.
- i18n sempre em `en.json` e `pt-BR.json`.
- UI pelo `.claude/rules/ui-standard.md`: `ScreenContainer`, `ScreenTitle` com `accent`, `OptionChips`, `SegmentedTabs`,
  `TABLE_STYLE`, texto ≥ 13px; `bun run ui:audit --hard` limpo.
- Testes de rota chamam os handlers de `apiRoutes` direto (helper `callApi`, Tarefa 10), como
  `src/backend/seats.review.test.ts`.
- Commits terminam com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `tsc`: `bunx tsc --noEmit` só pode acusar o erro antigo em `src/GameEngine/Domain/DecisionTree.ts:750`.

## Mapa de arquivos

| Arquivo | Ação | Papel |
|---|---|---|
| `src/types/multiplayerTypes.ts` | novo | `WorldState`, `WorldPhase`, `WorldDeadline`, visões e códigos de erro |
| `src/Domain/multiplayer/worldConfig.ts` (+ teste) | novo | `WORLD` (8 membros, 20 convites, prazos), `isWorldDeadline` |
| `src/Domain/multiplayer/worldCode.ts` (+ teste) | novo | `generateWorldCode`, `normalizeWorldCode` |
| `src/Domain/multiplayer/seatManager.ts` (+ teste) | novo | `parseSeatManager` (técnico do `join`) |
| `src/Domain/multiplayer/worldMessages.ts` (+ teste) | novo | Inbox `world` e notícia `world_member` |
| `src/backend/SaveService.ts` | editar | `SaveMeta.world`, `deleteSeat` |
| `src/backend/db.ts` (+ `db.world.test.ts`) | editar | `migrateWorldSchema` (`world_codes`, `world_invites`) |
| `src/backend/worlds/worldStore.ts` (+ teste) | novo | Códigos e convites no SQLite |
| `src/backend/auth/saveOwnership.ts` (+ `saveMembers.test.ts`) | editar | `memberBySeat`, `removeSaveMember`, `transferOwnership` |
| `src/types/managerTypes.ts`, `src/Domain/jobs/jobs.ts` (+ teste) | editar | `left: "left_world"` |
| `src/backend/dal/ISaveDAL.ts`, `FileSystemDAL.ts`, `BufferingSaveDAL.ts` (+ `seats.dal.test.ts`) | editar | `deleteSeat` |
| `src/backend/seats.ts` (+ `seats.addSeat.test.ts`, `seats.removeSeat.test.ts`) | editar | `SeatError`, teto, `sackingEnabled`, `removeSeat` |
| `src/backend/managerRoutes.ts` | editar | escopo "Livres" inclui o técnico que saiu do mundo |
| `src/types/inboxTypes.ts`, `src/Domain/inbox/inboxTopics.ts`, `inboxThemes.ts`, `src/GameInterface/InboxScreen.tsx` | editar | Categoria `world` |
| `src/types/newsTypes.ts`, `src/GameInterface/News/newsText.ts`, `src/i18n/news.keys.test.ts` | editar | Notícia `world_member` |
| `src/types/socialTypes.ts`, `src/GameInterface/Social/socialState.ts` (+ teste) | editar | Eventos `world_*` |
| `src/backend/worlds/worldNotify.ts` (+ teste) | novo | `notifyWorld` |
| `src/backend/worlds/worldLifecycle.ts` | novo | `createWorldState`, `worldView`, `deleteWorld`, `announceMemberChange` |
| `src/backend/worlds/worldTestUtils.ts` | novo | `callApi`, `createMultiWorld`, `TEST_MANAGER` (só testes) |
| `src/backend/saves.ts` (+ `src/backend/worlds/savesMulti.test.ts`) | editar | `mode: "multi"`, contagem de membros, `DELETE` |
| `src/backend/advanceDay.ts`, `src/backend/advanceUntil.ts` (+ `worldLobby.test.ts`) | editar | `presimulateWorld`, guarda de `lobby` |
| `src/backend/worlds/worldRoutes.ts` (+ testes) | novo | `/api/worlds/...` |
| `src/backend/routes.ts` | editar | monta `worldRoutes` |
| `src/backend/worlds/worldFlow.test.ts` | novo | Fluxo completo |
| `src/GameInterface/authRedirect.ts` (+ teste), `AuthGate.tsx`, `LoginScreen.tsx` | novo/editar | Volta para a página depois do login |
| `src/GameInterface/World/worldApi.ts`, `worldNav.ts` (+ teste) | novo | Cliente e navegação |
| `src/GameInterface/gameSession.ts`, `Social/useSocial.tsx`, `Social/FriendsPanel.tsx`, `Social/FriendsButton.tsx` | editar | Eventos e convites no cliente |
| `src/GameInterface/NewGameWizard.tsx` | editar | Passo "Sozinho/Com amigos" e modo "entrar" |
| `src/GameInterface/World/JoinScreen.tsx`, `src/pages/join/*` | novo | `/join/:code` |
| `src/GameInterface/World/WorldScreen.tsx`, `InviteFriendsModal.tsx`, `src/pages/world/*` | novo | `/world` |
| `src/GameInterface/Components/Layout.tsx`, `TopNavigation.tsx` | editar | Redirecionamento em `lobby`, ícone de liga |
| `src/GameInterface/StartScreen.tsx` | editar | Selos, papel, sair |
| `src/index.ts` | editar | Páginas `/world`, `/join/:code` |
| `scripts/ui-audit.ts` | editar | `JoinScreen` como tela de entrada |
| `src/i18n/locales/en.json`, `pt-BR.json`, `src/i18n/world.keys.test.ts` | editar/novo | `world.*` e chaves soltas |
| `.claude/rules/game/multiplayer.md` | editar | Seção parte 2 |

---

### Task 1: Tipos e regras puras do mundo

**Files:**
- Create: `src/types/multiplayerTypes.ts`
- Create: `src/Domain/multiplayer/worldConfig.ts`, `src/Domain/multiplayer/worldConfig.test.ts`
- Create: `src/Domain/multiplayer/worldCode.ts`, `src/Domain/multiplayer/worldCode.test.ts`
- Create: `src/Domain/multiplayer/seatManager.ts`, `src/Domain/multiplayer/seatManager.test.ts`
- Modify: `src/backend/SaveService.ts` (interface `SaveMeta`)

- [ ] **Step 1: Escrever os testes que falham**

`src/Domain/multiplayer/worldConfig.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { WORLD, isWorldDeadline } from "@/Domain/multiplayer/worldConfig";

describe("world config", () => {
  test("8 managers, 20 pending invites, 24 h by default", () => {
    expect(WORLD.MAX_MEMBERS).toBe(8);
    expect(WORLD.MAX_PENDING_INVITES).toBe(20);
    expect(WORLD.DEFAULT_DEADLINE).toBe(24);
  });

  test("deadline: 12, 24, 48 or none", () => {
    for (const v of [12, 24, 48, null]) expect(isWorldDeadline(v)).toBe(true);
    for (const v of [0, 6, 36, "24", undefined, 24.5]) expect(isWorldDeadline(v)).toBe(false);
  });
});
```

`src/Domain/multiplayer/worldCode.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { WORLD_CODE_LENGTH, generateWorldCode, normalizeWorldCode } from "@/Domain/multiplayer/worldCode";
import { FRIEND_CODE_ALPHABET } from "@/Domain/social/nickname";

describe("world invite code", () => {
  test("10 characters of the friend-code alphabet (no 0/1/I/O)", () => {
    let i = 0;
    const code = generateWorldCode(() => i++);
    expect(code).toHaveLength(WORLD_CODE_LENGTH);
    for (const c of code) expect(FRIEND_CODE_ALPHABET.includes(c)).toBe(true);
    expect(code).toBe("23456789AB");
  });

  test("normalize: case, spaces and dashes; anything else is null", () => {
    expect(normalizeWorldCode(" 2345-6789ab ")).toBe("23456789AB");
    expect(normalizeWorldCode("23456789A")).toBeNull();
    expect(normalizeWorldCode("23456789A0")).toBeNull();
    expect(normalizeWorldCode("23456789AI")).toBeNull();
    expect(normalizeWorldCode("23456789ABC")).toBeNull();
  });
});
```

`src/Domain/multiplayer/seatManager.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { parseSeatManager } from "@/Domain/multiplayer/seatManager";

describe("parseSeatManager", () => {
  test("a valid manager, trimmed", () => {
    expect(parseSeatManager({ name: "  Ana Lima ", nationalityIso: "br", backgroundId: "former-player" }))
      .toEqual({ name: "Ana Lima", nationalityIso: "br", backgroundId: "former-player" });
  });

  test("the avatar is validated", () => {
    expect(parseSeatManager({ name: "Ana", nationalityIso: "br", backgroundId: "analyst", face: { seed: 12 } }))
      .toEqual({ name: "Ana", nationalityIso: "br", backgroundId: "analyst", face: { seed: 12 } });
    expect(parseSeatManager({ name: "Ana", nationalityIso: "br", backgroundId: "analyst", face: { seed: "x" } })).toBeNull();
  });

  test("short or long name, unknown nationality or background, wrong shape", () => {
    expect(parseSeatManager({ name: "A", nationalityIso: "br", backgroundId: "analyst" })).toBeNull();
    expect(parseSeatManager({ name: "x".repeat(41), nationalityIso: "br", backgroundId: "analyst" })).toBeNull();
    expect(parseSeatManager({ name: "Ana", nationalityIso: "zz", backgroundId: "analyst" })).toBeNull();
    expect(parseSeatManager({ name: "Ana", nationalityIso: "br", backgroundId: "wizard" })).toBeNull();
    expect(parseSeatManager(null)).toBeNull();
    expect(parseSeatManager([])).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/Domain/multiplayer`
Expected: FAIL (módulos não existem).

- [ ] **Step 3: Implementar**

`src/types/multiplayerTypes.ts`:

```ts
// Multiplayer part 2: the world of friends (`.claude/rules/game/multiplayer.md`). Nothing here carries an e-mail or
// a user id: the client only sees nicknames and manager names.
import type { MemberRole } from "@/types/seatTypes";
import type { ManagerFace } from "@/Domain/faces/managerFace";

export type WorldPhase = "lobby" | "running";
/** Real hours each manager has at a stop of the group advance (part 3); null = no deadline. */
export type WorldDeadline = 12 | 24 | 48 | null;

/** `SaveMeta.world` (only in `mode: "multi"`). */
export interface WorldState {
  phase: WorldPhase;
  /** 10 characters of base32 without 0/1/I/O, unique among the worlds (`world_codes`). */
  inviteCode: string;
  deadlineHours: WorldDeadline;
  /** userId of the creator (audit only; ownership lives in `save_members`). */
  createdBy: string;
}

export interface WorldMemberView {
  seatId: string;
  role: MemberRole;
  nickname: string | null;
  managerName: string;
  face: ManagerFace | null;
  nationalityIso: string | null;
  clubId: string;
  clubName: string;
  clubColors: [string, string];
  leagueSlug: string;
  leagueName: string;
  unemployed: boolean;
}

/** `GET /api/worlds/:saveId`. */
export interface WorldView {
  saveId: string;
  name: string;
  phase: WorldPhase;
  inviteCode: string;
  deadlineHours: WorldDeadline;
  max: number;
  currentDate: string | null;
  myRole: MemberRole;
  mySeatId: string;
  members: WorldMemberView[];
}

/** `GET /api/worlds/by-code/:code`. */
export interface WorldByCode {
  saveId: string;
  name: string;
  /** Owner's nickname, or his manager's name. */
  owner: string;
  members: number;
  max: number;
  phase: WorldPhase;
  /** Clubs with a human manager: not pickable. */
  takenClubs: string[];
}

/** An invite through the friends list (`GET /api/worlds/invites`, socket `world_invite`). */
export interface WorldInviteView {
  saveId: string;
  name: string;
  /** Owner's nickname. */
  from: string;
  code: string;
}

export type WorldErrorCode =
  | "notFound" | "full" | "alreadyMember" | "clubTaken" | "invalidManager" | "invalidClub" | "invalidBody"
  | "ownerOnly" | "transferFirst" | "alreadyStarted" | "notMulti" | "inviteLimit" | "noNickname" | "useLeave"
  | "notMember";
```

`src/Domain/multiplayer/worldConfig.ts`:

```ts
import type { WorldDeadline } from "@/types/multiplayerTypes";

/** Multiplayer part 2 (`.claude/rules/game/multiplayer.md`). */
export const WORLD = {
  /** Managers (seats) of a world. */
  MAX_MEMBERS: 8,
  /** Pending friend-list invites of a world. */
  MAX_PENDING_INVITES: 20,
  /** Deadline a new world starts with (used by the group advance, part 3). */
  DEFAULT_DEADLINE: 24 as WorldDeadline,
  DEADLINES: [12, 24, 48] as const,
} as const;

export function isWorldDeadline(v: unknown): v is WorldDeadline {
  return v === null || v === 12 || v === 24 || v === 48;
}
```

`src/Domain/multiplayer/worldCode.ts`:

```ts
import { FRIEND_CODE_ALPHABET } from "@/Domain/social/nickname";

export const WORLD_CODE_LENGTH = 10;

/** A world invite code; `pick(n)` returns an integer in [0, n) (crypto `randomInt` on the server). */
export function generateWorldCode(pick: (n: number) => number): string {
  let s = "";
  for (let i = 0; i < WORLD_CODE_LENGTH; i++) s += FRIEND_CODE_ALPHABET[pick(FRIEND_CODE_ALPHABET.length) % FRIEND_CODE_ALPHABET.length];
  return s;
}

/** Upper case without spaces and dashes; null unless it is 10 characters of the alphabet. */
export function normalizeWorldCode(raw: string): string | null {
  const s = raw.trim().toUpperCase().replace(/[\s-]/g, "");
  if (s.length !== WORLD_CODE_LENGTH) return null;
  for (const c of s) if (!FRIEND_CODE_ALPHABET.includes(c)) return null;
  return s;
}
```

`src/Domain/multiplayer/seatManager.ts`:

```ts
import type { SaveManager } from "@/types/seatTypes";
import { parseManagerFace } from "@/Domain/faces/managerFace";
import { MANAGER_BACKGROUNDS, MANAGER_NATIONALITIES } from "@/Data/managerBackgrounds";

const NAME_MIN = 2;
const NAME_MAX = 40;

/** The manager of a `join` (the same fields as the new game); null when anything is off. */
export function parseSeatManager(raw: unknown): SaveManager | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== "string" || typeof r.nationalityIso !== "string" || typeof r.backgroundId !== "string") return null;
  const name = r.name.trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) return null;
  if (!MANAGER_NATIONALITIES.some((n) => n.id === r.nationalityIso)) return null;
  if (!MANAGER_BACKGROUNDS.some((b) => b.id === r.backgroundId)) return null;
  const face = parseManagerFace(r.face);
  if (face === null) return null;
  return { name, nationalityIso: r.nationalityIso, backgroundId: r.backgroundId, ...(face ? { face } : {}) };
}
```

Em `src/backend/SaveService.ts`, dentro de `interface SaveMeta`, depois de `managerVacancies?: …;` acrescentar:

```ts
  /** The world of friends (`mode: "multi"`, multiplayer part 2): phase, invite code, deadline. Absent in a solo save. */
  world?: WorldState;
```

e no topo do arquivo, junto dos outros `import type`:

```ts
import type { WorldState } from "@/types/multiplayerTypes";
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/Domain/multiplayer`
Expected: PASS (3 arquivos).

- [ ] **Step 5: Commit**

```bash
git add src/types/multiplayerTypes.ts src/Domain/multiplayer src/backend/SaveService.ts
git commit -m "feat(world): tipos, código de convite e técnico da liga de amigos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Tabelas `world_codes` e `world_invites`

**Files:**
- Modify: `src/backend/db.ts`
- Create: `src/backend/db.world.test.ts`
- Create: `src/backend/worlds/worldStore.ts`, `src/backend/worlds/worldStore.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

`src/backend/db.world.test.ts`:

```ts
import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { migrateWorldSchema } from "@/backend/db";

test("world_codes and world_invites are created and the migration runs twice", () => {
  const d = new Database(":memory:");
  migrateWorldSchema(d);
  migrateWorldSchema(d);
  const tables = (d.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name);
  expect(tables).toEqual(expect.arrayContaining(["world_codes", "world_invites"]));
  d.prepare("INSERT INTO world_codes (code, save_id) VALUES ('AAAAAAAAAA', 's1')").run();
  expect(() => d.prepare("INSERT INTO world_codes (code, save_id) VALUES ('AAAAAAAAAA', 's2')").run()).toThrow();
  expect(() => d.prepare("INSERT INTO world_codes (code, save_id) VALUES ('BBBBBBBBBB', 's1')").run()).toThrow();
  d.prepare("INSERT INTO world_invites (save_id, user_id, from_user, created_at) VALUES ('s1', 'u1', 'u0', 1)").run();
  expect(() => d.prepare("INSERT INTO world_invites (save_id, user_id, from_user, created_at) VALUES ('s1', 'u1', 'u0', 2)").run()).toThrow();
});
```

`src/backend/worlds/worldStore.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import {
  addWorldInvite, deleteWorldCode, deleteWorldInvite, deleteWorldInvites, hasWorldInvite, listWorldCodeIds,
  listWorldInvitesFor, newWorldCode, pendingInviteCount, setWorldCode, worldCodeOf, worldIdByCode,
} from "@/backend/worlds/worldStore";

describe("world codes", () => {
  test("a world has one code; a new one replaces it; deleting forgets it", () => {
    const saveId = `w-${randomUUID()}`;
    const first = newWorldCode();
    setWorldCode(saveId, first);
    expect(worldIdByCode(first)).toBe(saveId);
    expect(worldCodeOf(saveId)).toBe(first);
    expect(listWorldCodeIds()).toContain(saveId);
    const second = newWorldCode();
    setWorldCode(saveId, second);
    expect(worldIdByCode(first)).toBeNull();
    expect(worldIdByCode(second)).toBe(saveId);
    deleteWorldCode(saveId);
    expect(worldCodeOf(saveId)).toBeNull();
  });

  test("newWorldCode never returns a code in use", () => {
    const saveId = `w-${randomUUID()}`;
    let calls = 0;
    // The first draw collides with an existing code, the second is free.
    setWorldCode(saveId, "2222222222");
    const code = newWorldCode(() => (calls++ < 10 ? 0 : 1));
    expect(code).toBe("3333333333");
    deleteWorldCode(saveId);
  });
});

describe("world invites", () => {
  test("add (replace), list, count, decline, delete the world's", () => {
    const saveId = `w-${randomUUID()}`;
    const u1 = `u-${randomUUID()}`;
    const u2 = `u-${randomUUID()}`;
    addWorldInvite(saveId, u1, "owner", 10);
    addWorldInvite(saveId, u1, "owner", 20);
    addWorldInvite(saveId, u2, "owner", 30);
    expect(pendingInviteCount(saveId)).toBe(2);
    expect(hasWorldInvite(saveId, u1)).toBe(true);
    expect(listWorldInvitesFor(u1)).toEqual([{ saveId, fromUser: "owner", createdAt: 20 }]);
    expect(deleteWorldInvite(saveId, u1)).toBe(true);
    expect(deleteWorldInvite(saveId, u1)).toBe(false);
    deleteWorldInvites(saveId);
    expect(pendingInviteCount(saveId)).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/backend/db.world.test.ts src/backend/worlds/worldStore.test.ts`
Expected: FAIL (`migrateWorldSchema` e `worldStore` não existem).

- [ ] **Step 3: Implementar**

Em `src/backend/db.ts`, antes da linha final `migrateSocialSchema(db);` acrescentar a função, e depois dela a chamada:

```ts
/**
 * Multiplayer part 2 (`.claude/rules/game/multiplayer.md`): the invite code of each world (one per world, found
 * without opening metas) and the invites sent through the friends list. Only adds.
 */
export function migrateWorldSchema(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS world_codes (
      code    TEXT PRIMARY KEY,
      save_id TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_world_codes_save ON world_codes(save_id);

    CREATE TABLE IF NOT EXISTS world_invites (
      save_id    TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      from_user  TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (save_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_world_invites_user ON world_invites(user_id);
  `);
}
```

e no fim do arquivo, depois de `migrateSocialSchema(db);`:

```ts
migrateWorldSchema(db);
```

`src/backend/worlds/worldStore.ts`:

```ts
import { randomInt } from "crypto";
import { db } from "@/backend/db";
import { generateWorldCode } from "@/Domain/multiplayer/worldCode";

// ── Codes (`world_codes`) ────────────────────────────────────────────────────

/** The world's code; a previous code of the same world stops working. */
export function setWorldCode(saveId: string, code: string): void {
  db.transaction(() => {
    db.prepare("DELETE FROM world_codes WHERE save_id = ?").run(saveId);
    db.prepare("INSERT INTO world_codes (code, save_id) VALUES (?, ?)").run(code, saveId);
  })();
}

export function worldIdByCode(code: string): string | null {
  const row = db.prepare("SELECT save_id AS saveId FROM world_codes WHERE code = ?").get(code) as { saveId: string } | null;
  return row?.saveId ?? null;
}

export function worldCodeOf(saveId: string): string | null {
  const row = db.prepare("SELECT code FROM world_codes WHERE save_id = ?").get(saveId) as { code: string } | null;
  return row?.code ?? null;
}

export function deleteWorldCode(saveId: string): void {
  db.prepare("DELETE FROM world_codes WHERE save_id = ?").run(saveId);
}

/** Every multiplayer world (the group advance's clock walks this list, part 3). */
export function listWorldCodeIds(): string[] {
  return (db.prepare("SELECT save_id AS saveId FROM world_codes ORDER BY save_id").all() as { saveId: string }[]).map((r) => r.saveId);
}

/** A code no world uses. */
export function newWorldCode(pick: (n: number) => number = (n) => randomInt(n)): string {
  for (;;) {
    const code = generateWorldCode(pick);
    if (!worldIdByCode(code)) return code;
  }
}

// ── Invites (`world_invites`) ────────────────────────────────────────────────

/** One pending invite per world and user; inviting again refreshes it. */
export function addWorldInvite(saveId: string, userId: string, fromUser: string, now: number): void {
  db.prepare(
    "INSERT OR REPLACE INTO world_invites (save_id, user_id, from_user, created_at) VALUES (?, ?, ?, ?)",
  ).run(saveId, userId, fromUser, now);
}

export function hasWorldInvite(saveId: string, userId: string): boolean {
  return db.prepare("SELECT 1 FROM world_invites WHERE save_id = ? AND user_id = ?").get(saveId, userId) != null;
}

export function pendingInviteCount(saveId: string): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM world_invites WHERE save_id = ?").get(saveId) as { n: number }).n;
}

export function listWorldInvitesFor(userId: string): { saveId: string; fromUser: string; createdAt: number }[] {
  return db
    .prepare("SELECT save_id AS saveId, from_user AS fromUser, created_at AS createdAt FROM world_invites WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId) as { saveId: string; fromUser: string; createdAt: number }[];
}

export function deleteWorldInvite(saveId: string, userId: string): boolean {
  return db.prepare("DELETE FROM world_invites WHERE save_id = ? AND user_id = ?").run(saveId, userId).changes > 0;
}

export function deleteWorldInvites(saveId: string): void {
  db.prepare("DELETE FROM world_invites WHERE save_id = ?").run(saveId);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/backend/db.world.test.ts src/backend/worlds/worldStore.test.ts src/backend/db.social.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/db.ts src/backend/db.world.test.ts src/backend/worlds/worldStore.ts src/backend/worlds/worldStore.test.ts
git commit -m "feat(world): códigos de convite e convites por amigo no SQLite

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `save_members` — membro por assento, remover, passar a posse

**Files:**
- Modify: `src/backend/auth/saveOwnership.ts`
- Modify: `src/backend/auth/saveMembers.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

No fim de `src/backend/auth/saveMembers.test.ts` (dentro do `describe("save_members", …)`), acrescentar e ampliar o
import com `memberBySeat, removeSaveMember, transferOwnership`:

```ts
  test("member by seat, removal and ownership transfer", () => {
    const saveId = `w-${randomUUID()}`;
    const a = devAutoLogin(`a-${randomUUID()}@test.local`).user;
    const b = devAutoLogin(`b-${randomUUID()}@test.local`).user;
    addSaveMember(saveId, a.id, "seat-a", "owner");
    addSaveMember(saveId, b.id, "seat-b", "member");
    expect(memberBySeat(saveId, "seat-b")).toMatchObject({ userId: b.id, role: "member" });
    expect(memberBySeat(saveId, "seat-z")).toBeNull();

    transferOwnership(saveId, a.id, b.id);
    expect(memberOf(saveId, a.id)?.role).toBe("member");
    expect(memberOf(saveId, b.id)?.role).toBe("owner");
    expect(countOwnedSaves(a.id)).toBe(0);

    removeSaveMember(saveId, "seat-a");
    expect(memberOf(saveId, a.id)).toBeNull();
    expect(listSaveMembers(saveId).map((m) => m.seatId)).toEqual(["seat-b"]);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/backend/auth/saveMembers.test.ts`
Expected: FAIL (funções não exportadas).

- [ ] **Step 3: Implementar** — no fim de `src/backend/auth/saveOwnership.ts`:

```ts
export function memberBySeat(saveId: string, seatId: string): SaveMember | null {
  const row = db
    .prepare(`SELECT ${MEMBER_COLUMNS} FROM save_members WHERE save_id = ? AND seat_id = ?`)
    .get(saveId, seatId) as MemberRow | null;
  return row ?? null;
}

/** The seat's user leaves the world (`removeSeat`). */
export function removeSaveMember(saveId: string, seatId: string): void {
  db.prepare("DELETE FROM save_members WHERE save_id = ? AND seat_id = ?").run(saveId, seatId);
}

/** The owner passes the ownership: `to` becomes the owner, `from` a member (one transaction). */
export function transferOwnership(saveId: string, fromUserId: string, toUserId: string): void {
  db.transaction(() => {
    db.prepare("UPDATE save_members SET role = 'owner' WHERE save_id = ? AND user_id = ?").run(saveId, toUserId);
    db.prepare("UPDATE save_members SET role = 'member' WHERE save_id = ? AND user_id = ?").run(saveId, fromUserId);
  })();
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/backend/auth/saveMembers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/auth/saveOwnership.ts src/backend/auth/saveMembers.test.ts
git commit -m "feat(world): membro por assento, remoção e troca de dono em save_members

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Motivo de saída `left_world`

**Files:**
- Modify: `src/types/managerTypes.ts`
- Modify: `src/Domain/jobs/jobs.ts` (`sackHumanManager`)
- Test: `src/Domain/jobs/jobs.leftWorld.test.ts` (novo)
- Modify: `src/i18n/locales/en.json`, `src/i18n/locales/pt-BR.json`

- [ ] **Step 1: Escrever o teste que falha**

`src/Domain/jobs/jobs.leftWorld.test.ts`:

```ts
import { expect, test } from "bun:test";
import { sackHumanManager } from "@/Domain/jobs/jobs";
import type { ManagerRecord } from "@/types/managerTypes";

test("a manager who leaves the world is free, with the passage closed as left_world, and an interim takes over", () => {
  const me: ManagerRecord = {
    id: "seat:s1", seatId: "s1", name: "Ana", squadId: "33", points: 0, seasons: 0, titles: [],
    clubs: [{ squadId: "33", from: "2026-08-15" }],
  };
  const out = sackHumanManager([me], { seatId: "s1", date: "2026-10-01", clubName: "Man Utd", left: "left_world" });
  const after = out.find((m) => m.seatId === "s1")!;
  expect(after.squadId).toBe("");
  expect(after.freeSince).toBe("2026-10-01");
  expect(after.clubs).toEqual([{ squadId: "33", from: "2026-08-15", to: "2026-10-01", left: "left_world" }]);
  expect(out.filter((m) => m.squadId === "33" && m.interim)).toHaveLength(1);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/Domain/jobs/jobs.leftWorld.test.ts`
Expected: FAIL no `tsc`/teste (`"left_world"` não é aceito pelo tipo; o `bun test` roda mesmo assim, então confira com `bunx tsc --noEmit` que acusa o tipo).

- [ ] **Step 3: Implementar**

`src/types/managerTypes.ts`:

```ts
/** Why a manager left a club (Etapa 25); `left_world`: a human manager left the world of friends (part 2). */
export type ManagerLeftReason = "sacked" | "moved" | "contract" | "interim" | "left_world";
```

`src/Domain/jobs/jobs.ts`, assinatura de `sackHumanManager`:

```ts
export function sackHumanManager(
  managers: ManagerRecord[],
  args: { seatId: string; date: string; clubName: string; left?: "sacked" | "contract" | "left_world" },
): ManagerRecord[] {
```

i18n — em `statsScreen.managers.leftReason` (o bloco com `"interim": "interim spell"`), acrescentar depois de
`"interim"`:
- `en.json`: `"left_world": "left the league"`
- `pt-BR.json`: `"left_world": "saiu da liga"`

(Lembre a vírgula depois da linha `"interim": …`.)

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/Domain/jobs` e `bunx tsc --noEmit`
Expected: PASS; o `tsc` só com o erro antigo do `DecisionTree.ts:750`.

- [ ] **Step 5: Commit**

```bash
git add src/types/managerTypes.ts src/Domain/jobs/jobs.ts src/Domain/jobs/jobs.leftWorld.test.ts src/i18n/locales/en.json src/i18n/locales/pt-BR.json
git commit -m "feat(world): motivo de saída left_world na passagem do técnico

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `ISaveDAL.deleteSeat` e `SaveService.deleteSeat`

**Files:**
- Modify: `src/backend/dal/ISaveDAL.ts`, `src/backend/dal/FileSystemDAL.ts`, `src/backend/dal/BufferingSaveDAL.ts`
- Modify: `src/backend/SaveService.ts`
- Modify: `src/backend/dal/seats.dal.test.ts`

- [ ] **Step 1: Escrever os testes que falham** — no fim de `src/backend/dal/seats.dal.test.ts` (o arquivo já importa
`FileSystemDAL`, `BufferingSaveDAL`, `RUNTIME_DATA_DIR`, `randomUUID`, `seat`, `msg`):

```ts
import { SaveService, type SaveMeta } from "@/backend/SaveService";

describe("deleteSeat", () => {
  test("FileSystemDAL removes the seat folder only", async () => {
    const saveId = `test-seatdel-${randomUUID()}`;
    created.push(saveId);
    const a = randomUUID();
    const b = randomUUID();
    await dal.writeSeat(saveId, a, seat);
    await dal.writeSeat(saveId, b, seat);
    await dal.writeSeatInbox(saveId, b, [msg("m1")]);
    await dal.deleteSeat(saveId, b);
    expect(await dal.readSeat(saveId, a)).toEqual(seat);
    expect(await dal.readSeat(saveId, b)).toBeNull();
    expect(await Bun.file(`${RUNTIME_DATA_DIR}/saves/${saveId}/seats/${b}/inbox.json`).exists()).toBe(false);
  });

  test("BufferingSaveDAL drops the seat's buffered writes and deletes on flush", async () => {
    const saveId = `test-seatdel-buf-${randomUUID()}`;
    created.push(saveId);
    const s = randomUUID();
    await dal.writeSeat(saveId, s, seat);
    const buffer = new BufferingSaveDAL(dal);
    await buffer.writeSeatInbox(saveId, s, [msg("late")]);
    await buffer.deleteSeat(saveId, s);
    expect(await buffer.readSeat(saveId, s)).toBeNull();
    expect(await dal.readSeat(saveId, s)).toEqual(seat);
    await buffer.flush();
    expect(await dal.readSeat(saveId, s)).toBeNull();
    expect(await Bun.file(`${RUNTIME_DATA_DIR}/saves/${saveId}/seats/${s}/inbox.json`).exists()).toBe(false);
  });

  test("SaveService.deleteSeat removes the seat from the world", async () => {
    const saveId = `test-seatdel-svc-${randomUUID()}`;
    created.push(saveId);
    const a = randomUUID();
    const b = randomUUID();
    const now = new Date().toISOString();
    const world: SaveMeta = { id: saveId, name: "W", createdAt: now, updatedAt: now, mode: "multi", seats: [a, b] };
    await dal.writeMeta(world);
    await dal.writeSeat(saveId, a, seat);
    await dal.writeSeat(saveId, b, seat);
    await new SaveService(dal).deleteSeat(saveId, b);
    expect((await dal.readMeta(saveId))!.seats).toEqual([a]);
    expect(await dal.readSeat(saveId, b)).toBeNull();
  });
});
```

(Ponha o `import { SaveService, type SaveMeta }` junto dos outros imports no topo.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/backend/dal/seats.dal.test.ts`
Expected: FAIL (`deleteSeat` não existe).

- [ ] **Step 3: Implementar**

`src/backend/dal/ISaveDAL.ts`, logo depois de `writeSeatMarket(...)`:

```ts
  /** Removes the seat's folder (`seats/{seatId}/`): every file of that manager. */
  deleteSeat(saveId: string, seatId: string): Promise<void>;
```

`src/backend/dal/FileSystemDAL.ts`, junto dos métodos de assento (depois de `writeSeatMarket`):

```ts
  async deleteSeat(saveId: string, seatId: string): Promise<void> {
    await rm(seatDir(saveId, seatId), { recursive: true, force: true });
  }
```

`src/backend/dal/BufferingSaveDAL.ts`, depois de `writeSeatMarket(...)`:

```ts
  /**
   * Forgets every buffered write of the seat (seat, tactics, achievements, scouting, inbox, ledger, market) and
   * removes its folder in the delete phase of `flush` (after the writes, before the meta, like a squad tombstone).
   */
  async deleteSeat(saveId: string, seatId: string): Promise<void> {
    const tag = `:${saveId}:${seatId}`;
    const ofSeat = (key: string) => key.startsWith("seat") && (key.endsWith(tag) || key.includes(`${tag}:`));
    for (const key of [...this.cache.keys()]) if (ofSeat(key)) this.cache.delete(key);
    for (const key of [...this.pending.keys()]) if (ofSeat(key)) this.pending.delete(key);
    this.cache.set(`seat${tag}`, null);
    const run = () => this.inner.deleteSeat(saveId, seatId);
    this.deleteThunks.add(run);
    this.pending.set(`seatDelete${tag}`, run);
  }
```

`src/backend/SaveService.ts`, logo depois de `insertSeat(...)`:

```ts
  /** Removes a seat's files and takes it out of the world (`removeSeat` does the rest). */
  async deleteSeat(saveId: string, seatId: string): Promise<void> {
    const world = await this.dal.readMeta(saveId);
    if (!world) throw new Error(`Save not found: ${saveId}`);
    await this.dal.deleteSeat(saveId, seatId);
    await this.dal.writeMeta({ ...world, seats: world.seats.filter((s) => s !== seatId), updatedAt: new Date().toISOString() });
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/backend/dal`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/dal src/backend/SaveService.ts
git commit -m "feat(world): apagar a pasta de um assento (DAL e SaveService)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `addSeat` — erros tipados, teto de 8 e `sackingEnabled`

**Files:**
- Modify: `src/backend/seats.ts`
- Modify: `src/backend/seats.addSeat.test.ts`

- [ ] **Step 1: Escrever o teste que falha** — em `src/backend/seats.addSeat.test.ts`, ampliar o import com
`SeatError` (`import { addSeat, SeatError } from "@/backend/seats";`) e acrescentar dentro do `describe`:

```ts
  test("typed errors: already a member, club taken, unknown club, full; sacking choice kept", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    const owner = devAutoLogin("addseat-err-owner@test.local");
    await ownSolo(meta.id, owner.user.id);
    const premier = (await saveService.getSquadIndex(meta.id)).inLeague("premier_league").filter((e) => e.squadId !== "33");
    const mgr = { name: "Err", nationalityIso: "br", backgroundId: "former-player" };
    const code = async (p: Promise<unknown>) => { try { await p; return "ok"; } catch (e) { return e instanceof SeatError ? e.code : String(e); } };

    expect(await code(addSeat(meta.id, { userId: owner.user.id, clubId: premier[0]!.squadId, manager: mgr }))).toBe("alreadyMember");
    expect(await code(addSeat(meta.id, { userId: devAutoLogin("addseat-err-1@test.local").user.id, clubId: "33", manager: mgr }))).toBe("clubTaken");
    expect(await code(addSeat(meta.id, { userId: devAutoLogin("addseat-err-2@test.local").user.id, clubId: "no-such-club", manager: mgr }))).toBe("clubNotFound");
    expect(await code(addSeat(meta.id, { userId: devAutoLogin("addseat-err-3@test.local").user.id, clubId: premier[0]!.squadId, manager: mgr, maxSeats: 1 }))).toBe("full");

    const b = await addSeat(meta.id, {
      userId: devAutoLogin("addseat-err-4@test.local").user.id, clubId: premier[1]!.squadId, manager: mgr, sackingEnabled: false, maxSeats: 8,
    });
    expect(b.seat.sackingEnabled).toBe(false);
  }, 300_000);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/backend/seats.addSeat.test.ts`
Expected: FAIL (`SeatError` não existe).

- [ ] **Step 3: Implementar** — em `src/backend/seats.ts`:

Acima de `addSeat`:

```ts
export type SeatErrorCode = "notFound" | "alreadyMember" | "clubTaken" | "clubNotFound" | "full";

/** A seat could not be added or removed; the routes turn `code` into the response. */
export class SeatError extends Error {
  constructor(readonly code: SeatErrorCode, message: string) {
    super(message);
    this.name = "SeatError";
  }
}
```

Assinatura (o `args` ganha dois campos):

```ts
export async function addSeat(
  saveId: string,
  args: {
    userId: string; clubId: string; manager: SaveManager; role?: MemberRole;
    /** The board may sack the manager (`.claude/rules/game/board-fans.md`); default true. */
    sackingEnabled?: boolean;
    /** Seats the world may have; checked inside the lock (the join route passes `WORLD.MAX_MEMBERS`). */
    maxSeats?: number;
  },
  service: SaveService = defaultService,
): Promise<SeatContext> {
```

As quatro checagens no começo do lock passam a ser:

```ts
    const world = await service.getMeta(saveId);
    if (!world?.currentDate) throw new SeatError("notFound", `addSeat: save ${saveId} not found or without a date`);
    if (memberOf(saveId, args.userId)) throw new SeatError("alreadyMember", `addSeat: user ${args.userId} already has a seat in ${saveId}`);
    if (args.maxSeats !== undefined && world.seats.length >= args.maxSeats) throw new SeatError("full", `addSeat: save ${saveId} is full`);
    if ((await service.humanClubIds(saveId)).has(args.clubId)) throw new SeatError("clubTaken", `addSeat: club ${args.clubId} already has a seat`);
    const index = await service.getSquadIndex(saveId);
    const entry = index.byId(args.clubId);
    if (!entry) throw new SeatError("clubNotFound", `addSeat: club ${args.clubId} is not in save ${saveId}`);
```

E no `seat` montado, trocar `sackingEnabled: true,` por:

```ts
      sackingEnabled: args.sackingEnabled !== false,
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/backend/seats.addSeat.test.ts`
Expected: PASS (o teste antigo `.rejects.toThrow("already has a seat")` continua valendo).

- [ ] **Step 5: Commit**

```bash
git add src/backend/seats.ts src/backend/seats.addSeat.test.ts
git commit -m "feat(world): addSeat com erros tipados, teto de assentos e opção de demissão

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Caixa `world` e notícia `world_member`

**Files:**
- Modify: `src/types/inboxTypes.ts`, `src/Domain/inbox/inboxTopics.ts`, `src/Domain/inbox/inboxThemes.ts`
- Modify: `src/types/newsTypes.ts`, `src/GameInterface/News/newsText.ts`, `src/i18n/news.keys.test.ts`
- Create: `src/Domain/multiplayer/worldMessages.ts`, `src/Domain/multiplayer/worldMessages.test.ts`
- Modify: `src/GameInterface/InboxScreen.tsx`
- Modify: `src/i18n/locales/en.json`, `src/i18n/locales/pt-BR.json`

- [ ] **Step 1: Escrever os testes que falham**

`src/Domain/multiplayer/worldMessages.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { buildWorldMemberMessage, worldMemberNews, type MemberChange } from "@/Domain/multiplayer/worldMessages";
import { inboxTopicOf } from "@/Domain/inbox/inboxTopics";

const joined: MemberChange = {
  seatId: "s2", event: "joined", managerName: "Bia", clubId: "40", clubName: "Liverpool", leagueSlug: "premier_league",
};

describe("world member messages", () => {
  test("inbox: one message per change, competitions topic", () => {
    const m = buildWorldMemberMessage("2026-09-01", joined);
    expect(m).toMatchObject({ category: "world", kind: "member_joined", managerName: "Bia", clubName: "Liverpool", date: "2026-09-01" });
    expect(m.id).toBe("world-joined-s2-2026-09-01");
    expect(inboxTopicOf(m)).toBe("competitions");
    expect(buildWorldMemberMessage("2026-09-01", { ...joined, event: "removed" }).kind).toBe("member_removed");
  });

  test("news: importance 3, the club and the league", () => {
    const n = worldMemberNews("2026-09-01", joined);
    expect(n).toEqual({
      id: "2026-09-01:world_member:s2:joined", date: "2026-09-01", kind: "world_member", importance: 3,
      league: "premier_league", clubIds: ["40"], playerIds: [],
      params: { manager: "Bia", club: "Liverpool", event: "joined" },
    });
  });
});
```

Em `src/i18n/news.keys.test.ts`, acrescentar `world_member: true` ao `KINDS` e, na lista `keys`, as entradas
`"news.world_member_left.title", "news.world_member_left.text"`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/Domain/multiplayer/worldMessages.test.ts src/i18n/news.keys.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/types/inboxTypes.ts`: acrescentar `| "world"` ao fim do `InboxCategory`, a interface e o membro da união
`InboxMessage`:

```ts
/** A manager joined or left the world of friends (multiplayer part 2; part 3 adds `auto_advanced`). */
export interface WorldInboxMessage extends InboxMessageBase {
  category:    "world";
  kind:        "member_joined" | "member_left" | "member_removed";
  managerName: string;
  clubName:    string;
}
```

(`| WorldInboxMessage` no fim de `export type InboxMessage = …`.)

`src/Domain/inbox/inboxTopics.ts`, no `CATEGORY_TOPIC`, depois de `national_coach: "competitions",`:

```ts
  // The world of friends: a manager joined or left (multiplayer part 2).
  world: "competitions",
```

`src/Domain/inbox/inboxThemes.ts`, no `THEME_OF`, depois de `national: "competitions",`:

```ts
  world: "competitions",
```

`src/types/newsTypes.ts`: acrescentar `| "world_member"` ao `NewsKind` (depois de `"press_promise_broken"`).

`src/Domain/multiplayer/worldMessages.ts`:

```ts
import type { WorldInboxMessage } from "@/types/inboxTypes";
import type { NewsItem } from "@/types/newsTypes";

/** A manager joined (`joined`), left on his own (`left`) or was removed by the owner (`removed`). */
export interface MemberChange {
  seatId: string;
  event: "joined" | "left" | "removed";
  managerName: string;
  clubId: string;
  clubName: string;
  leagueSlug: string;
}

const KIND = { joined: "member_joined", left: "member_left", removed: "member_removed" } as const;

/** Inbox of every other seat of the world. The screen translates it (`world.inbox.*`). */
export function buildWorldMemberMessage(date: string, c: MemberChange): WorldInboxMessage {
  return {
    id: `world-${c.event}-${c.seatId}-${date}`,
    date,
    createdAt: date,
    read: false,
    category: "world",
    kind: KIND[c.event],
    subject: c.event === "joined" ? `${c.managerName} joins the league` : `${c.managerName} leaves the league`,
    preview: c.clubName,
    managerName: c.managerName,
    clubName: c.clubName,
  };
}

/** World news (`world_member`, importance 3, only written in a multiplayer world). */
export function worldMemberNews(date: string, c: MemberChange): NewsItem {
  return {
    id: `${date}:world_member:${c.seatId}:${c.event}`,
    date,
    kind: "world_member",
    importance: 3,
    league: c.leagueSlug,
    clubIds: c.clubId ? [c.clubId] : [],
    playerIds: [],
    params: { manager: c.managerName, club: c.clubName, event: c.event },
  };
}
```

`src/GameInterface/News/newsText.ts`, na função `newsKey`, antes do `return` final:

```ts
  if (item.kind === "world_member" && item.params.event !== "joined") return "news.world_member_left";
```

`src/GameInterface/InboxScreen.tsx`:
- junto dos `iconOf(...)` do topo: `const UsersIcon = iconOf("users");`
- em `CATEGORY_META`, depois do bloco `national_coach`:

```ts
  world: {
    labelKey: "inbox.categories.world",
    color: "text-chart-2",
    bg: "bg-chart-2/15",
    border: "border-chart-2/30",
    Icon: UsersIcon,
  },
```

- na função que devolve `{ subject, preview }` (a do ramo `if (message.category === "schedule")`), antes desse ramo:

```ts
  if (message.category === "world") {
    const vars = { manager: message.managerName, club: message.clubName };
    return { subject: t(`world.inbox.${message.kind}.subject`, vars), preview: message.clubName };
  }
```

- no corpo (junto da linha `{message.category === "schedule" && <ScheduleBody … />}`):

```tsx
        {message.category === "world" && (
          <p className="text-sm text-foreground m-0">
            {t(`world.inbox.${message.kind}.body`, { manager: message.managerName, club: message.clubName })}
          </p>
        )}
```

i18n:
- `inbox.categories` (bloco com `"press": "Press"`, linha ~1502): `en` `"world": "League"`, `pt-BR` `"world": "Liga"`.
- `news` (o bloco de topo `"news": {`), acrescentar no fim do objeto (antes do `}` que fecha `news`):

`en.json`:

```json
    "world_member": {
      "0": { "title": "{{manager}} takes over {{club}}", "text": "A new manager joins the league." },
      "1": { "title": "{{club}} have a new manager: {{manager}}", "text": "One more friend in the league." },
      "2": { "title": "{{manager}} arrives at {{club}}", "text": "The league grows by one manager." }
    },
    "world_member_left": {
      "title": "{{manager}} leaves {{club}}",
      "text": "The club goes back to its board's choice of manager."
    }
```

`pt-BR.json`:

```json
    "world_member": {
      "0": { "title": "{{manager}} assume o {{club}}", "text": "Um novo técnico entra na liga." },
      "1": { "title": "{{club}} tem novo técnico: {{manager}}", "text": "Mais um amigo na liga." },
      "2": { "title": "{{manager}} chega ao {{club}}", "text": "A liga ganha mais um técnico." }
    },
    "world_member_left": {
      "title": "{{manager}} deixa o {{club}}",
      "text": "O clube volta a escolher o técnico pela diretoria."
    }
```

(As chaves `world.inbox.*` entram na Tarefa 22, junto do resto de `world.*`.)

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/Domain/multiplayer src/Domain/inbox src/i18n/news.keys.test.ts`
Expected: PASS. `bunx tsc --noEmit`: só o erro antigo.

- [ ] **Step 5: Commit**

```bash
git add src/types/inboxTypes.ts src/types/newsTypes.ts src/Domain/inbox src/Domain/multiplayer/worldMessages.ts src/Domain/multiplayer/worldMessages.test.ts src/GameInterface/InboxScreen.tsx src/GameInterface/News/newsText.ts src/i18n
git commit -m "feat(world): caixa world e notícia world_member

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `removeSeat` — o clube volta à IA

**Files:**
- Modify: `src/backend/seats.ts`
- Modify: `src/backend/managerRoutes.ts`
- Create: `src/backend/seats.removeSeat.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

`src/backend/seats.removeSeat.test.ts`:

```ts
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { memberOf } from "@/backend/auth/saveOwnership";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { addSeat, removeSeat, SeatError } from "@/backend/seats";
import { seatManagerId } from "@/Domain/seats/seats";
import { RUNTIME_DATA_DIR } from "@/backend/runtimeDir";

describe("removeSeat", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await saveService.deleteSave(id); }, 120_000);

  test("the club goes back to the AI with an interim and a vacancy; the seat's files and member row go", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    await ownSolo(meta.id, devAutoLogin("rmseat-owner@test.local").user.id);
    const friend = devAutoLogin("rmseat-friend@test.local");
    const clubB = (await saveService.getSquadIndex(meta.id)).inLeague("premier_league").find((e) => e.squadId !== "33")!.squadId;
    const b = await addSeat(meta.id, { userId: friend.user.id, clubId: clubB, manager: { name: "Bia", nationalityIso: "br", backgroundId: "analyst" } });

    const removed = await removeSeat(meta.id, b.seatId);
    expect(removed).toMatchObject({ userId: friend.user.id, managerName: "Bia", clubId: clubB, leagueSlug: "premier_league" });

    const world = (await saveService.getMeta(meta.id))!;
    expect(world.seats).toEqual([meta.seatId]);
    expect(world.mode).toBe("multi");
    expect(world.managerVacancies?.[clubB]?.since).toBe(world.currentDate);
    expect(memberOf(meta.id, friend.user.id)).toBeNull();
    expect(await Bun.file(`${RUNTIME_DATA_DIR}/saves/${meta.id}/seats/${b.seatId}/seat.json`).exists()).toBe(false);
    expect([...(await saveService.humanClubIds(meta.id))]).toEqual(["33"]);

    const squad = (await saveService.getSquadById(meta.id, clubB))!;
    expect(squad.staff).toBeUndefined();
    expect(squad.financialTier).toBeDefined();

    const managers = await saveService.getManagers(meta.id);
    const me = managers.find((m) => m.id === seatManagerId(b.seatId))!;
    expect(me.squadId).toBe("");
    expect(me.clubs?.at(-1)).toMatchObject({ squadId: clubB, left: "left_world" });
    expect(managers.filter((m) => m.squadId === clubB).map((m) => !!m.interim)).toEqual([true]);

    let err: unknown = null;
    try { await removeSeat(meta.id, b.seatId); } catch (e) { err = e; }
    expect(err instanceof SeatError && err.code).toBe("notFound");
  }, 300_000);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/backend/seats.removeSeat.test.ts`
Expected: FAIL (`removeSeat` não existe).

- [ ] **Step 3: Implementar** — em `src/backend/seats.ts`, novos imports:

```ts
import { SaveService } from "@/backend/SaveService";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import { memberBySeat, removeSaveMember } from "@/backend/auth/saveOwnership";
import { releaseHumanClub } from "@/backend/jobWorld";
import { resignNationalTeam } from "@/backend/nationalCoachWorld";
import { sackHumanManager } from "@/Domain/jobs/jobs";
import { vacancyHireOn } from "@/Domain/managers/aiManagers";
import { mulberry32, seedFrom } from "@/Domain/rng";
```

(A linha de import já existente `import { saveService as defaultService, type SaveService } from "@/backend/SaveService";`
vira `import { saveService as defaultService, SaveService } from "@/backend/SaveService";` — o `SaveService` passa a
ser usado como valor; não duplique o import acima. Junte `memberBySeat, removeSaveMember` ao import já existente de
`@/backend/auth/saveOwnership`, e `releaseHumanClub` ao de `@/backend/jobWorld`.)

No fim do arquivo:

```ts
/** What `removeSeat` hands back to the routes (the announcement and the socket). */
export interface RemovedSeat {
  userId: string | null;
  managerName: string;
  clubId: string;
  clubName: string;
  leagueSlug: string;
}

/**
 * A manager leaves the world (`.claude/rules/game/multiplayer.md`, part 2): his club goes back to the AI as after a
 * sacking (`releaseHumanClub`, interim + vacancy), his manager stays in the ranking as free (`left: "left_world"`),
 * a national team he coaches gets an interim, and his seat's files and `save_members` row go. One buffered unit,
 * flushed with the meta last.
 */
export async function removeSeat(saveId: string, seatId: string): Promise<RemovedSeat> {
  return withSaveLock(saveId, async () => {
    const buffer = new BufferingSaveDAL(new FileSystemDAL());
    const service = new SaveService(buffer);
    const world = await service.getMeta(saveId);
    const seat = world?.seats.includes(seatId) ? await service.getSeat(saveId, seatId) : null;
    if (!world?.currentDate || !seat) throw new SeatError("notFound", `removeSeat: seat ${seatId} not in save ${saveId}`);
    const date = world.currentDate;
    const member = memberBySeat(saveId, seatId);
    const managerName = seat.manager?.name?.trim() || seat.clubName;

    // A national team he coaches (Etapa 41b) gets an interim and a vacancy; nothing when he coaches none.
    await resignNationalTeam(service, saveId, seatId, date);

    if (seat.clubId && !seat.unemployed) {
      await releaseHumanClub(service, saveId, seatId, { squadId: seat.clubId, date });
      await service.writeManagers(saveId, sackHumanManager(await service.getManagers(saveId), {
        seatId, date, clubName: seat.clubName, left: "left_world",
      }));
      const meta = (await service.getMeta(saveId))!;
      const rng = mulberry32(seedFrom(`${saveId}:${seat.clubId}:${date}:vacancy`));
      await service.updateMeta(saveId, {
        managerVacancies: { ...(meta.managerVacancies ?? {}), [seat.clubId]: { since: date, hireOn: vacancyHireOn(date, rng) } },
      });
    }
    await service.deleteSeat(saveId, seatId);
    await buffer.flush();
    removeSaveMember(saveId, seatId);
    return {
      userId: member?.userId ?? null,
      managerName,
      clubId: seat.unemployed ? "" : seat.clubId,
      clubName: seat.clubName,
      leagueSlug: seat.leagueSlug,
    };
  });
}
```

`src/backend/managerRoutes.ts` — o técnico que saiu do mundo aparece no escopo "Livres" (o filtro hoje tira todo
registro com `seatId`). Logo depois de `const meta = await saveService.getSeatMeta(...)` / `if (!meta) …`:

```ts
    // A manager who left the world keeps his seat id but no seat (part 2): he counts as free.
    const liveSeats = new Set((await saveService.getMeta(saveId))?.seats ?? []);
```

e o filtro `scope === "free"` vira:

```ts
        : scope === "free" ? (m) => !m.squadId && (!m.seatId || !liveSeats.has(m.seatId))
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/backend/seats.removeSeat.test.ts src/backend/managers.routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/seats.ts src/backend/seats.removeSeat.test.ts src/backend/managerRoutes.ts
git commit -m "feat(world): removeSeat devolve o clube à IA e apaga o assento

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Eventos de socket `world_*`

**Files:**
- Modify: `src/types/socialTypes.ts`
- Create: `src/backend/worlds/worldNotify.ts`, `src/backend/worlds/worldNotify.test.ts`
- Modify: `src/GameInterface/Social/socialState.ts`, `src/GameInterface/Social/socialState.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

`src/backend/worlds/worldNotify.test.ts`:

```ts
import { beforeEach, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { addSaveMember } from "@/backend/auth/saveOwnership";
import { onSocketOpen, resetRealtime, type SocialSocket } from "@/backend/social/realtime";
import { notifyWorld } from "@/backend/worlds/worldNotify";
import type { ServerEvent } from "@/types/socialTypes";

type FakeSocket = SocialSocket & { events: ServerEvent[] };
function fakeSocket(userId: string): FakeSocket {
  const events: ServerEvent[] = [];
  return { data: { userId, session: "s", saveId: null, clubName: null }, events, send(m: string) { events.push(JSON.parse(m)); }, close() {} } as FakeSocket;
}

beforeEach(() => resetRealtime());

test("notifyWorld reaches every member but the one left out, and nobody else", () => {
  const saveId = `w-${randomUUID()}`;
  const a = devAutoLogin(`wn-a-${randomUUID()}@test.local`).user;
  const b = devAutoLogin(`wn-b-${randomUUID()}@test.local`).user;
  const c = devAutoLogin(`wn-c-${randomUUID()}@test.local`).user;
  addSaveMember(saveId, a.id, "seat-a", "owner");
  addSaveMember(saveId, b.id, "seat-b", "member");
  const [wa, wb, wc] = [fakeSocket(a.id), fakeSocket(b.id), fakeSocket(c.id)];
  for (const w of [wa, wb, wc]) onSocketOpen(w);
  notifyWorld(saveId, { type: "world_members", saveId }, a.id);
  expect(wa.events).toEqual([]);
  expect(wb.events).toEqual([{ type: "world_members", saveId }]);
  expect(wc.events).toEqual([]);
});
```

Em `src/GameInterface/Social/socialState.test.ts`, dentro do `describe("parseServerEvent", …)`:

```ts
  test("world events", () => {
    expect(parseServerEvent(JSON.stringify({ type: "world_invite", saveId: "s", name: "Liga", from: "ana", code: "23456789AB" })))
      .toEqual({ type: "world_invite", saveId: "s", name: "Liga", from: "ana", code: "23456789AB" });
    for (const type of ["world_started", "world_removed", "world_deleted", "world_members"] as const) {
      expect(parseServerEvent(JSON.stringify({ type, saveId: "s" }))).toEqual({ type, saveId: "s" });
      expect(parseServerEvent(JSON.stringify({ type }))).toBeNull();
    }
    expect(parseServerEvent(JSON.stringify({ type: "world_invite", saveId: "s" }))).toBeNull();
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/backend/worlds/worldNotify.test.ts src/GameInterface/Social/socialState.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/types/socialTypes.ts`, ao fim da união `ServerEvent`:

```ts
  // Multiplayer part 2 (`.claude/rules/game/multiplayer.md`): only members of the world (or the invited user).
  | { type: "world_invite"; saveId: string; name: string; from: string; code: string }
  | { type: "world_started"; saveId: string }
  | { type: "world_removed"; saveId: string }
  | { type: "world_deleted"; saveId: string }
  | { type: "world_members"; saveId: string };
```

(Tire o `;` da linha `| { type: "pong"; online: number };` antes de colar.)

`src/backend/worlds/worldNotify.ts`:

```ts
import { listSaveMembers } from "@/backend/auth/saveOwnership";
import { notifyUser } from "@/backend/social/realtime";
import type { ServerEvent } from "@/types/socialTypes";

/** Sends `event` to every member of the world (`save_members`) but `exceptUserId`. */
export function notifyWorld(saveId: string, event: ServerEvent, exceptUserId?: string): void {
  for (const m of listSaveMembers(saveId)) if (m.userId !== exceptUserId) notifyUser(m.userId, event);
}
```

`src/GameInterface/Social/socialState.ts`, no `switch (e.type)` de `parseServerEvent`, antes do `default`:

```ts
    case "world_invite":
      return str(e.saveId) && str(e.name) && str(e.from) && str(e.code)
        ? { type: "world_invite", saveId: e.saveId, name: e.name, from: e.from, code: e.code }
        : null;
    case "world_started":
    case "world_removed":
    case "world_deleted":
    case "world_members":
      return str(e.saveId) ? { type: e.type, saveId: e.saveId } : null;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/backend/worlds/worldNotify.test.ts src/GameInterface/Social src/backend/social`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/socialTypes.ts src/backend/worlds/worldNotify.ts src/backend/worlds/worldNotify.test.ts src/GameInterface/Social/socialState.ts src/GameInterface/Social/socialState.test.ts
git commit -m "feat(world): eventos de socket da liga de amigos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Ciclo de vida do mundo e helper de teste

**Files:**
- Create: `src/backend/worlds/worldLifecycle.ts`
- Create: `src/backend/worlds/worldTestUtils.ts`
- Create: `src/backend/worlds/worldLifecycle.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

`src/backend/worlds/worldLifecycle.test.ts`:

```ts
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { listSaveMembers } from "@/backend/auth/saveOwnership";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { addSeat } from "@/backend/seats";
import { announceMemberChange, createWorldState, deleteWorld, worldView } from "@/backend/worlds/worldLifecycle";
import { worldCodeOf, worldIdByCode } from "@/backend/worlds/worldStore";

describe("world lifecycle", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await saveService.deleteSave(id); }, 120_000);

  test("state, view, announcement and deletion", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Man Utd", clubColors: ["#da291c", "#ffffff"],
      manager: { name: "Ana", nationalityIso: "br", backgroundId: "analyst" },
    });
    created.push(meta.id);
    const owner = devAutoLogin("wl-owner@test.local");
    await ownSolo(meta.id, owner.user.id);
    const world = await createWorldState(meta.id, owner.user.id);
    expect(world).toMatchObject({ phase: "lobby", deadlineHours: 24, createdBy: owner.user.id });
    expect(worldIdByCode(world.inviteCode)).toBe(meta.id);
    expect((await saveService.getMeta(meta.id))?.mode).toBe("multi");

    const clubB = (await saveService.getSquadIndex(meta.id)).inLeague("premier_league").find((e) => e.squadId !== "33")!;
    const b = await addSeat(meta.id, { userId: devAutoLogin("wl-friend@test.local").user.id, clubId: clubB.squadId, manager: { name: "Bia", nationalityIso: "es", backgroundId: "analyst" } });
    await announceMemberChange(meta.id, {
      seatId: b.seatId, event: "joined", managerName: "Bia", clubId: clubB.squadId, clubName: b.seat.clubName, leagueSlug: "premier_league",
    });
    const ownerInbox = await saveService.getInbox(meta.id, meta.seatId);
    expect(ownerInbox.some((m) => m.category === "world" && m.kind === "member_joined")).toBe(true);
    const friendInbox = await saveService.getInbox(meta.id, b.seatId);
    expect(friendInbox.some((m) => m.category === "world")).toBe(false);
    const news = await saveService.getNewsMonth(meta.id, meta.currentDate!.slice(0, 7));
    expect(news.some((n) => n.kind === "world_member")).toBe(true);

    const view = (await worldView(meta.id, { seatId: meta.seatId, role: "owner" }))!;
    expect(view).toMatchObject({ phase: "lobby", max: 8, myRole: "owner", mySeatId: meta.seatId });
    expect(view.members.map((m) => [m.managerName, m.role])).toEqual([["Ana", "owner"], ["Bia", "member"]]);

    await deleteWorld(meta.id, owner.user.id);
    expect(await saveService.getMeta(meta.id)).toBeNull();
    expect(listSaveMembers(meta.id)).toEqual([]);
    expect(worldCodeOf(meta.id)).toBeNull();
  }, 300_000);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/backend/worlds/worldLifecycle.test.ts`
Expected: FAIL (`worldLifecycle` não existe).

- [ ] **Step 3: Implementar**

`src/backend/worlds/worldLifecycle.ts`:

```ts
import { saveService as defaultService, type SaveService } from "@/backend/SaveService";
import { deleteSaveMembers, listSaveMembers } from "@/backend/auth/saveOwnership";
import { getSocialUser } from "@/backend/social/socialStore";
import { notifyUser } from "@/backend/social/realtime";
import { notifyWorld } from "@/backend/worlds/worldNotify";
import { deleteWorldCode, deleteWorldInvites, newWorldCode, setWorldCode } from "@/backend/worlds/worldStore";
import { WORLD } from "@/Domain/multiplayer/worldConfig";
import { buildWorldMemberMessage, worldMemberNews, type MemberChange } from "@/Domain/multiplayer/worldMessages";
import { emitInboxMessage } from "@/Domain/inbox/inboxEvents";
import type { MemberRole } from "@/types/seatTypes";
import type { WorldMemberView, WorldState, WorldView } from "@/types/multiplayerTypes";

/** A new world of friends: `lobby`, a fresh invite code, the default deadline (`POST /api/saves` with `mode: "multi"`). */
export async function createWorldState(saveId: string, userId: string, service: SaveService = defaultService): Promise<WorldState> {
  const inviteCode = newWorldCode();
  const world: WorldState = { phase: "lobby", inviteCode, deadlineHours: WORLD.DEFAULT_DEADLINE, createdBy: userId };
  setWorldCode(saveId, inviteCode);
  await service.updateMeta(saveId, { mode: "multi", world });
  return world;
}

/** The world's screen (`GET /api/worlds/:saveId`); null for a solo save. */
export async function worldView(
  saveId: string, me: { seatId: string; role: MemberRole }, service: SaveService = defaultService,
): Promise<WorldView | null> {
  const meta = await service.getMeta(saveId);
  if (!meta?.world || meta.mode !== "multi") return null;
  const bySeat = new Map(listSaveMembers(saveId).map((m) => [m.seatId, m]));
  const members: WorldMemberView[] = [];
  for (const { seatId, seat } of await service.listSeats(saveId)) {
    const m = bySeat.get(seatId);
    if (!m) continue;
    members.push({
      seatId,
      role: m.role,
      nickname: getSocialUser(m.userId)?.nickname ?? null,
      managerName: seat.manager?.name ?? "",
      face: seat.manager?.face ?? null,
      nationalityIso: seat.manager?.nationalityIso ?? null,
      clubId: seat.clubId,
      clubName: seat.clubName,
      clubColors: seat.clubColors,
      leagueSlug: seat.leagueSlug,
      leagueName: seat.leagueName,
      unemployed: !!seat.unemployed,
    });
  }
  return {
    saveId, name: meta.name, phase: meta.world.phase, inviteCode: meta.world.inviteCode,
    deadlineHours: meta.world.deadlineHours, max: WORLD.MAX_MEMBERS, currentDate: meta.currentDate ?? null,
    myRole: me.role, mySeatId: me.seatId, members,
  };
}

/** Deletes the world for everyone; the other members get `world_deleted`. */
export async function deleteWorld(saveId: string, actorUserId: string, service: SaveService = defaultService): Promise<void> {
  const others = listSaveMembers(saveId).map((m) => m.userId).filter((u) => u !== actorUserId);
  await service.deleteSave(saveId);
  deleteSaveMembers(saveId);
  deleteWorldCode(saveId);
  deleteWorldInvites(saveId);
  for (const u of others) notifyUser(u, { type: "world_deleted", saveId });
}

/**
 * A manager joined or left: a message in every other seat's inbox, a world news item and `world_members` on the
 * socket (the world screen reloads).
 */
export async function announceMemberChange(saveId: string, change: MemberChange, service: SaveService = defaultService): Promise<void> {
  const meta = await service.getMeta(saveId);
  const date = meta?.currentDate;
  if (!date) return;
  for (const { seatId } of await service.listSeats(saveId)) {
    if (seatId === change.seatId) continue;
    await emitInboxMessage(saveId, buildWorldMemberMessage(date, change), service, seatId);
  }
  await service.appendNews(saveId, [worldMemberNews(date, change)]);
  notifyWorld(saveId, { type: "world_members", saveId });
}
```

`src/backend/worlds/worldTestUtils.ts` (só testes):

```ts
// Calls an API route handler directly (no server). Tests only.
import { apiRoutes } from "@/backend/routes";

type Handler = (req: Request & { params: Record<string, string> }) => Response | Promise<Response>;

export interface CallResult {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
}

export async function callApi(
  method: "GET" | "POST" | "PUT" | "DELETE",
  pattern: string,
  token: string | null,
  opts: { params?: Record<string, string>; body?: unknown } = {},
): Promise<CallResult> {
  const params = opts.params ?? {};
  let path = pattern;
  for (const [k, v] of Object.entries(params)) path = path.replace(`:${k}`, encodeURIComponent(v));
  const headers: Record<string, string> = {};
  if (token) headers.cookie = `fs_session=${token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const req = Object.assign(
    new Request(`http://localhost:3000${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) }),
    { params },
  );
  const entry = (apiRoutes as Record<string, unknown>)[pattern];
  const handler = typeof entry === "function" ? (entry as Handler) : (entry as Record<string, Handler> | undefined)?.[method];
  if (!handler) throw new Error(`no ${method} on ${pattern}`);
  const res = await handler(req);
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json };
}

export const TEST_MANAGER = { name: "Ana Lima", nationalityIso: "br", backgroundId: "former-player" } as const;

/** A multiplayer world in `lobby` on Man Utd, created through `POST /api/saves`. */
export async function createMultiWorld(token: string): Promise<CallResult> {
  return callApi("POST", "/api/saves", token, {
    body: {
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Man Utd", clubColors: ["#da291c", "#ffffff"],
      manager: TEST_MANAGER, mode: "multi",
    },
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/backend/worlds/worldLifecycle.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/worlds/worldLifecycle.ts src/backend/worlds/worldLifecycle.test.ts src/backend/worlds/worldTestUtils.ts
git commit -m "feat(world): estado, visão, anúncio e exclusão do mundo de amigos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: `POST /api/saves` multi, lista com membros e `DELETE` que avisa

**Files:**
- Modify: `src/backend/saves.ts`
- Create: `src/backend/worlds/savesMulti.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

`src/backend/worlds/savesMulti.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { onSocketOpen, resetRealtime, type SocialSocket } from "@/backend/social/realtime";
import { addSeat } from "@/backend/seats";
import { callApi, createMultiWorld } from "@/backend/worlds/worldTestUtils";
import { worldCodeOf } from "@/backend/worlds/worldStore";
import type { ServerEvent } from "@/types/socialTypes";

beforeEach(() => resetRealtime());

describe("multiplayer saves", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await saveService.deleteSave(id).catch(() => {}); }, 120_000);

  test("mode multi: lobby, invite code, not presimulated; the list shows members; delete warns the others", async () => {
    const owner = devAutoLogin("sm-owner@test.local");
    const res = await createMultiWorld(owner.session.token);
    expect(res.status).toBe(201);
    const saveId = res.json.id as string;
    created.push(saveId);
    expect(res.json.mode).toBe("multi");
    expect(res.json.world).toMatchObject({ phase: "lobby", deadlineHours: 24 });
    expect(worldCodeOf(saveId)).toBe(res.json.world.inviteCode);
    expect((await saveService.getMeta(saveId))?.presimulated).toBeUndefined();

    expect((await callApi("POST", "/api/saves", owner.session.token, { body: { ...res.json, mode: "duo" } })).status).toBe(400);

    const friend = devAutoLogin("sm-friend@test.local");
    const clubB = (await saveService.getSquadIndex(saveId)).inLeague("premier_league").find((e) => e.squadId !== "33")!.squadId;
    await addSeat(saveId, { userId: friend.user.id, clubId: clubB, manager: { name: "Bia", nationalityIso: "es", backgroundId: "analyst" } });
    const list = await callApi("GET", "/api/saves", friend.session.token);
    expect(list.json.find((s: { id: string }) => s.id === saveId)).toMatchObject({ mode: "multi", role: "member", members: 2 });

    const events: ServerEvent[] = [];
    onSocketOpen({ data: { userId: friend.user.id, session: "s", saveId: null, clubName: null }, send: (m: string) => events.push(JSON.parse(m)), close() {} } as SocialSocket);
    expect((await callApi("DELETE", "/api/saves/:id", friend.session.token, { params: { id: saveId } })).status).toBe(403);
    expect((await callApi("DELETE", "/api/saves/:id", owner.session.token, { params: { id: saveId } })).status).toBe(200);
    expect(events).toContainEqual({ type: "world_deleted", saveId });
    expect(worldCodeOf(saveId)).toBeNull();
  }, 600_000);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/backend/worlds/savesMulti.test.ts`
Expected: FAIL (sem `world`, 201 para `mode: "duo"`, sem `members`).

- [ ] **Step 3: Implementar** — em `src/backend/saves.ts`:

Imports novos:

```ts
import { createWorldState, deleteWorld } from "@/backend/worlds/worldLifecycle";
```

e acrescentar `listSaveMembers` ao import de `@/backend/auth/saveOwnership` (o `deleteSaveMembers` deixa de ser usado
aqui — tire-o do import).

`GET /api/saves`, a linha do `push` vira:

```ts
        if (meta && member) {
          metas.push({
            ...meta, role: member.role, compatible: saveCompatibility(meta.gameVersion) === "ok",
            ...(meta.mode === "multi" ? { members: listSaveMembers(id).length } : {}),
          });
        }
```

`POST /api/saves`, logo depois do bloco que valida `manager.face`:

```ts
      // A world of friends (multiplayer part 2) starts in the lobby: no `/presimulate` until the owner starts it.
      const mode = body.mode;
      if (mode !== undefined && mode !== "solo" && mode !== "multi") {
        return Response.json({ error: "invalid mode" }, { status: 400 });
      }
```

e, dentro do `try`, depois de `const finalMeta = await applyBroadcasting(...)`:

```ts
        if (mode === "multi") {
          const world = await createWorldState(meta.id, auth.userId);
          return Response.json({ ...finalMeta, mode: "multi", world }, { status: 201 });
        }
```

`DELETE /api/saves/:id` — o miolo vira:

```ts
    if (req.method === "DELETE") {
      if (auth.role !== "owner") return Response.json({ error: "only the owner deletes a world" }, { status: 403 });
      const existing = await saveService.getMeta(id);
      if (!existing) return Response.json({ error: "save not found" }, { status: 404 });
      // Every member loses the world; the others get `world_deleted` (multiplayer part 2).
      await withSaveLock(id, () => deleteWorld(id, auth.userId));
      return Response.json({ ok: true });
    }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/backend/worlds/savesMulti.test.ts src/backend/saves.seat.routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/saves.ts src/backend/worlds/savesMulti.test.ts
git commit -m "feat(world): novo jogo com amigos, membros na lista e exclusão que avisa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: `presimulateWorld` e a guarda de `lobby` no avanço

**Files:**
- Modify: `src/backend/advanceDay.ts`
- Modify: `src/backend/advanceUntil.ts`
- Create: `src/backend/worlds/worldLobby.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

`src/backend/worlds/worldLobby.test.ts`:

```ts
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { callApi, createMultiWorld } from "@/backend/worlds/worldTestUtils";

describe("a world in the lobby does not move", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await saveService.deleteSave(id).catch(() => {}); }, 120_000);

  test("advance-day, advance-until and presimulate answer 409", async () => {
    const owner = devAutoLogin("lobby-owner@test.local");
    const saveId = (await createMultiWorld(owner.session.token)).json.id as string;
    created.push(saveId);
    const p = { saveId };
    const day = await callApi("POST", "/api/advance-day/:saveId", owner.session.token, { params: p });
    expect(day).toMatchObject({ status: 409, json: { error: "lobby" } });
    const until = await callApi("POST", "/api/saves/:saveId/advance-until", owner.session.token, { params: p });
    expect(until).toMatchObject({ status: 409, json: { error: "lobby" } });
    const pre = await callApi("POST", "/api/saves/:saveId/presimulate", owner.session.token, { params: p });
    expect(pre).toMatchObject({ status: 409, json: { error: "useWorldStart" } });
    expect((await saveService.getMeta(saveId))?.currentDate).toBeDefined();
  }, 300_000);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/backend/worlds/worldLobby.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Em `src/backend/advanceDay.ts`, extrair o corpo do `/presimulate` para uma função exportada (logo antes de
`export const advanceDayRoutes = {`):

```ts
/**
 * The world's start (start kit, rescheduling, youth and national safety nets, the season-start news): once per world.
 * The caller holds the save lock. Continental news go to every seat; the owner's first board objective is sent here
 * (members get theirs from `addSeat`).
 */
export async function presimulateWorld(
  saveId: string, ownerSeatId: string,
): Promise<{ applied: boolean; kit?: string; reason?: string }> {
  if ((await saveService.getMeta(saveId))?.presimulated) return { applied: false, reason: "already presimulated" };
  // …(o corpo de hoje, do `const result = await applyRandomStartKit(saveId);` até a linha antes de
  // `await saveService.updateMeta(saveId, { presimulated: true });`, trocando `auth.seatId` por `ownerSeatId`),
  // com uma mudança no bloco das notícias continentais (abaixo)…
  await saveService.updateMeta(saveId, { presimulated: true });
  return result;
}
```

O bloco "Continental season-start news" passa a rodar para todo assento; o objetivo da diretoria continua só do dono:

```ts
  for (const { seatId, seat } of await saveService.listSeats(saveId)) {
    if (!seat.clubId || seat.unemployed) continue;
    const date = (await saveService.getMeta(saveId))?.currentDate;
    if (!date) continue;
    try {
      await emitContinentalSeasonStartNews(saveId, seatId, seat.clubId, date);
    } catch (e) {
      logError("continental", `save ${saveId}: failed to emit continental season-start news`, e);
    }
  }
  const owner = await saveService.getSeatMeta(saveId, ownerSeatId);
  if (owner?.currentDate && owner.board?.objective) {
    const catalog = await getLeagueData();
    await emitInboxMessage(saveId, buildBoardMessage({
      date: owner.currentDate, kind: "objective", objective: owner.board.objective,
      leagueName: competitionName(owner.board.objective.leagueSlug, catalog as unknown as LeagueData[], "en"),
    }), saveService, ownerSeatId);
  }
```

A rota fica:

```ts
  "/api/saves/:saveId/presimulate": async (req: Request & { params: Record<string, string> }) => {
    if (req.method !== "POST") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }
    const auth = requireSeat(req, req.params.saveId!);
    if (auth instanceof Response) return auth;
    const saveId = req.params.saveId!;
    // The world's start: the owner's, once (`.claude/rules/game/multiplayer.md`). A second call is a no-op.
    if (auth.role !== "owner") return Response.json({ error: "only the owner starts a world" }, { status: 403 });
    return withSaveLock(saveId, async () => {
      // A world of friends starts through `POST /api/worlds/:saveId/start` (part 2), which also opens it.
      if ((await saveService.getMeta(saveId))?.world?.phase === "lobby") {
        return Response.json({ error: "useWorldStart" }, { status: 409 });
      }
      return Response.json(await presimulateWorld(saveId, auth.seatId));
    });
  },
```

No `/api/advance-day/:saveId`, logo depois de `if (auth instanceof Response) return auth;`:

```ts
    // A world of friends in the lobby does not move until the owner starts it (part 2).
    if ((await saveService.getMeta(req.params.saveId!))?.world?.phase === "lobby") {
      return Response.json({ error: "lobby" }, { status: 409 });
    }
```

Em `src/backend/advanceUntil.ts`, no `/api/saves/:saveId/advance-until`, antes da checagem `multiSeat`:

```ts
    if ((await defaultSaveService.getMeta(saveId))?.world?.phase === "lobby") {
      return Response.json({ error: "lobby" }, { status: 409 });
    }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/backend/worlds/worldLobby.test.ts src/backend/seats.review.test.ts src/backend/advanceUntil.test.ts`
Expected: PASS (o `/presimulate` de um solo continua igual).

- [ ] **Step 5: Commit**

```bash
git add src/backend/advanceDay.ts src/backend/advanceUntil.ts src/backend/worlds/worldLobby.test.ts
git commit -m "feat(world): presimulateWorld e o mundo parado na sala de espera

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Rotas do mundo — visão, por código, entrar, código, prazo

**Files:**
- Create: `src/backend/worlds/worldRoutes.ts`
- Modify: `src/backend/routes.ts`
- Create: `src/backend/worlds/worldRoutes.join.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

`src/backend/worlds/worldRoutes.join.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { memberOf } from "@/backend/auth/saveOwnership";
import { resetRealtime } from "@/backend/social/realtime";
import { addSeat } from "@/backend/seats";
import { callApi, createMultiWorld, TEST_MANAGER } from "@/backend/worlds/worldTestUtils";

type Login = ReturnType<typeof devAutoLogin>;

beforeEach(() => resetRealtime());

describe("world routes: view, by-code, join, code, settings", () => {
  let owner: Login;
  let saveId: string;
  let code: string;
  let premier: string[];

  beforeAll(async () => {
    owner = devAutoLogin("wr-owner@test.local");
    const res = await createMultiWorld(owner.session.token);
    saveId = res.json.id;
    code = res.json.world.inviteCode;
    premier = (await saveService.getSquadIndex(saveId)).inLeague("premier_league").map((e) => e.squadId).filter((id) => id !== "33");
  }, 300_000);
  afterAll(async () => { await saveService.deleteSave(saveId).catch(() => {}); }, 120_000);

  test("by-code: 404 with a bad code, the world for a stranger, 409 alreadyMember for the owner", async () => {
    const stranger = devAutoLogin("wr-stranger@test.local");
    expect((await callApi("GET", "/api/worlds/by-code/:code", stranger.session.token, { params: { code: "ZZZZZZZZZZ" } })).status).toBe(404);
    const found = await callApi("GET", "/api/worlds/by-code/:code", stranger.session.token, { params: { code: code.toLowerCase() } });
    expect(found.status).toBe(200);
    expect(found.json).toMatchObject({ saveId, members: 1, max: 8, phase: "lobby", takenClubs: ["33"] });
    expect(JSON.stringify(found.json)).not.toContain("wr-owner@test.local");
    expect(await callApi("GET", "/api/worlds/by-code/:code", owner.session.token, { params: { code } }))
      .toMatchObject({ status: 409, json: { error: "alreadyMember", saveId } });
    expect((await callApi("GET", "/api/worlds/by-code/:code", null, { params: { code } })).status).toBe(401);
  });

  test("join: invalid manager, unknown club, taken club, then in; the race on one club", async () => {
    const a = devAutoLogin("wr-a@test.local");
    const join = (who: Login, body: Record<string, unknown>) => callApi("POST", "/api/worlds/join", who.session.token, { body });
    expect(await join(a, { code, clubId: premier[0], manager: { ...TEST_MANAGER, name: "x" } })).toMatchObject({ status: 400, json: { error: "invalidManager" } });
    expect(await join(a, { code, clubId: "nope", manager: TEST_MANAGER })).toMatchObject({ status: 400, json: { error: "invalidClub" } });
    expect(await join(a, { code, clubId: "33", manager: TEST_MANAGER })).toMatchObject({ status: 409, json: { error: "clubTaken" } });
    expect(await join(a, { code: "ZZZZZZZZZZ", clubId: premier[0], manager: TEST_MANAGER })).toMatchObject({ status: 404 });

    const b = devAutoLogin("wr-b@test.local");
    const [ra, rb] = await Promise.all([
      join(a, { code, clubId: premier[0], manager: TEST_MANAGER }),
      join(b, { code, clubId: premier[0], manager: TEST_MANAGER }),
    ]);
    expect([ra.status, rb.status].sort()).toEqual([201, 409]);
    const loser = ra.status === 409 ? ra : rb;
    expect(loser.json.error).toBe("clubTaken");
    const winner = ra.status === 201 ? ra : rb;
    expect(winner.json).toMatchObject({ saveId, phase: "lobby" });
    expect(await join(ra.status === 201 ? a : b, { code, clubId: premier[1], manager: TEST_MANAGER }))
      .toMatchObject({ status: 409, json: { error: "alreadyMember", saveId } });
  }, 600_000);

  test("view: members only; owner changes the code (old link 404) and the deadline", async () => {
    const view = await callApi("GET", "/api/worlds/:saveId", owner.session.token, { params: { saveId } });
    expect(view.json).toMatchObject({ saveId, phase: "lobby", myRole: "owner", deadlineHours: 24 });
    expect((await callApi("GET", "/api/worlds/:saveId", devAutoLogin("wr-nobody@test.local").session.token, { params: { saveId } })).status).toBe(404);

    // The member is whoever won the race of the previous test.
    const memberLogin = ["wr-a@test.local", "wr-b@test.local"].map((e) => devAutoLogin(e)).find((l) => memberOf(saveId, l.user.id))!;
    expect((await callApi("POST", "/api/worlds/:saveId/invite-code", memberLogin.session.token, { params: { saveId } })).status).toBe(403);
    expect((await callApi("PUT", "/api/worlds/:saveId/settings", memberLogin.session.token, { params: { saveId }, body: { deadlineHours: 12 } })).status).toBe(403);

    const fresh = await callApi("POST", "/api/worlds/:saveId/invite-code", owner.session.token, { params: { saveId } });
    expect(fresh.json.inviteCode).not.toBe(code);
    expect((await callApi("GET", "/api/worlds/by-code/:code", devAutoLogin("wr-late@test.local").session.token, { params: { code } })).status).toBe(404);
    code = fresh.json.inviteCode;

    expect((await callApi("PUT", "/api/worlds/:saveId/settings", owner.session.token, { params: { saveId }, body: { deadlineHours: 36 } })).status).toBe(400);
    expect(await callApi("PUT", "/api/worlds/:saveId/settings", owner.session.token, { params: { saveId }, body: { deadlineHours: null } }))
      .toMatchObject({ status: 200, json: { deadlineHours: null } });
    expect((await saveService.getMeta(saveId))?.world?.deadlineHours).toBeNull();
  });

  test("full: 409 on by-code and on join", async () => {
    const seats = (await saveService.getMeta(saveId))!.seats.length;
    for (let i = seats; i < 8; i++) {
      await addSeat(saveId, { userId: devAutoLogin(`wr-fill-${i}@test.local`).user.id, clubId: premier[i + 1]!, manager: TEST_MANAGER });
    }
    const late = devAutoLogin("wr-full@test.local");
    expect(await callApi("GET", "/api/worlds/by-code/:code", late.session.token, { params: { code } })).toMatchObject({ status: 409, json: { error: "full" } });
    expect(await callApi("POST", "/api/worlds/join", late.session.token, { body: { code, clubId: premier[12], manager: TEST_MANAGER } }))
      .toMatchObject({ status: 409, json: { error: "full" } });
  }, 900_000);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/backend/worlds/worldRoutes.join.test.ts`
Expected: FAIL (`no GET on /api/worlds/by-code/:code`).

- [ ] **Step 3: Implementar**

`src/backend/worlds/worldRoutes.ts`:

```ts
import { saveService } from "@/backend/SaveService";
import { requireAuth, requireSeat } from "@/backend/auth/middleware";
import { listSaveMembers, memberOf } from "@/backend/auth/saveOwnership";
import { withSaveLock } from "@/backend/saveLock";
import { getSocialUser } from "@/backend/social/socialStore";
import { addSeat, SeatError } from "@/backend/seats";
import { announceMemberChange, worldView } from "@/backend/worlds/worldLifecycle";
import { notifyWorld } from "@/backend/worlds/worldNotify";
import { deleteWorldInvite, newWorldCode, setWorldCode, worldIdByCode } from "@/backend/worlds/worldStore";
import { WORLD, isWorldDeadline } from "@/Domain/multiplayer/worldConfig";
import { normalizeWorldCode } from "@/Domain/multiplayer/worldCode";
import { parseSeatManager } from "@/Domain/multiplayer/seatManager";
import type { SaveMeta } from "@/backend/SaveService";
import type { WorldByCode, WorldErrorCode } from "@/types/multiplayerTypes";

type Req = Request & { params: Record<string, string> };

export function fail(error: WorldErrorCode, status: number, extra: Record<string, unknown> = {}): Response {
  return Response.json({ error, ...extra }, { status });
}

export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const v = (await req.json()) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The meta of a world of friends; null for a solo save or a missing one. */
export async function multiWorld(saveId: string): Promise<(SaveMeta & { world: NonNullable<SaveMeta["world"]> }) | null> {
  const meta = await saveService.getMeta(saveId);
  return meta?.mode === "multi" && meta.world ? (meta as SaveMeta & { world: NonNullable<SaveMeta["world"]> }) : null;
}

/** The world behind an invite code (any case, with spaces or dashes). */
function worldOfCode(raw: unknown): string | null {
  const code = typeof raw === "string" ? normalizeWorldCode(raw) : null;
  return code ? worldIdByCode(code) : null;
}

export const worldRoutes = {
  "/api/worlds/by-code/:code": {
    GET: async (req: Req) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      const saveId = worldOfCode(decodeURIComponent(req.params.code ?? ""));
      const meta = saveId ? await multiWorld(saveId) : null;
      if (!saveId || !meta) return fail("notFound", 404);
      if (memberOf(saveId, auth.userId)) return fail("alreadyMember", 409, { saveId });
      if (meta.seats.length >= WORLD.MAX_MEMBERS) return fail("full", 409);
      const owner = listSaveMembers(saveId).find((m) => m.role === "owner");
      const ownerSeat = owner ? await saveService.getSeat(saveId, owner.seatId) : null;
      const body: WorldByCode = {
        saveId,
        name: meta.name,
        owner: (owner && getSocialUser(owner.userId)?.nickname) || ownerSeat?.manager?.name || meta.name,
        members: meta.seats.length,
        max: WORLD.MAX_MEMBERS,
        phase: meta.world.phase,
        takenClubs: [...(await saveService.humanClubIds(saveId))],
      };
      return Response.json(body);
    },
  },

  "/api/worlds/join": {
    POST: async (req: Req) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      const body = await readBody(req);
      if (!body) return fail("invalidBody", 400);
      const saveId = worldOfCode(body.code);
      if (!saveId || !(await multiWorld(saveId))) return fail("notFound", 404);
      const manager = parseSeatManager(body.manager);
      if (!manager) return fail("invalidManager", 400);
      if (typeof body.clubId !== "string" || !body.clubId) return fail("invalidClub", 400);
      try {
        const { seatId, seat } = await addSeat(saveId, {
          userId: auth.userId, clubId: body.clubId, manager,
          sackingEnabled: body.sackingEnabled !== false, maxSeats: WORLD.MAX_MEMBERS,
        });
        deleteWorldInvite(saveId, auth.userId);
        await announceMemberChange(saveId, {
          seatId, event: "joined", managerName: manager.name,
          clubId: seat.clubId, clubName: seat.clubName, leagueSlug: seat.leagueSlug,
        });
        const phase = (await multiWorld(saveId))?.world.phase ?? "running";
        return Response.json({ saveId, seatId, phase }, { status: 201 });
      } catch (e) {
        if (!(e instanceof SeatError)) throw e;
        if (e.code === "alreadyMember") return fail("alreadyMember", 409, { saveId });
        if (e.code === "full") return fail("full", 409);
        if (e.code === "clubTaken") return fail("clubTaken", 409);
        if (e.code === "clubNotFound") return fail("invalidClub", 400);
        return fail("notFound", 404);
      }
    },
  },

  "/api/worlds/:saveId": {
    GET: async (req: Req) => {
      const saveId = req.params.saveId!;
      const auth = requireSeat(req, saveId);
      if (auth instanceof Response) return auth;
      const view = await worldView(saveId, { seatId: auth.seatId, role: auth.role });
      return view ? Response.json(view) : fail("notMulti", 404);
    },
  },

  "/api/worlds/:saveId/invite-code": {
    POST: async (req: Req) => {
      const saveId = req.params.saveId!;
      const auth = requireSeat(req, saveId);
      if (auth instanceof Response) return auth;
      if (auth.role !== "owner") return fail("ownerOnly", 403);
      return withSaveLock(saveId, async () => {
        const meta = await multiWorld(saveId);
        if (!meta) return fail("notMulti", 404);
        const inviteCode = newWorldCode();
        setWorldCode(saveId, inviteCode);
        await saveService.updateMeta(saveId, { world: { ...meta.world, inviteCode } });
        return Response.json({ inviteCode });
      });
    },
  },

  "/api/worlds/:saveId/settings": {
    PUT: async (req: Req) => {
      const saveId = req.params.saveId!;
      const auth = requireSeat(req, saveId);
      if (auth instanceof Response) return auth;
      if (auth.role !== "owner") return fail("ownerOnly", 403);
      const body = await readBody(req);
      if (!body || !isWorldDeadline(body.deadlineHours)) return fail("invalidBody", 400);
      const deadlineHours = body.deadlineHours;
      return withSaveLock(saveId, async () => {
        const meta = await multiWorld(saveId);
        if (!meta) return fail("notMulti", 404);
        await saveService.updateMeta(saveId, { world: { ...meta.world, deadlineHours } });
        notifyWorld(saveId, { type: "world_members", saveId });
        return Response.json({ deadlineHours });
      });
    },
  },
};
```

Em `src/backend/routes.ts`: `import { worldRoutes } from "@/backend/worlds/worldRoutes";` e, no `apiRoutes`, depois de
`...socialRoutes,`:

```ts
  ...worldRoutes,
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/backend/worlds/worldRoutes.join.test.ts src/lab/labAppRoutes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/worlds/worldRoutes.ts src/backend/worlds/worldRoutes.join.test.ts src/backend/routes.ts
git commit -m "feat(world): rotas de visão, código de convite, entrada e prazo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Rotas do mundo — convites, começar, tirar, sair, posse

**Files:**
- Modify: `src/backend/worlds/worldRoutes.ts`
- Create: `src/backend/worlds/worldRoutes.manage.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

`src/backend/worlds/worldRoutes.manage.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { memberOf } from "@/backend/auth/saveOwnership";
import { onSocketOpen, resetRealtime, type SocialSocket } from "@/backend/social/realtime";
import { befriend, setNickname } from "@/backend/social/socialStore";
import { uniqueNick } from "@/backend/social/socialTestUtils";
import { addSeat } from "@/backend/seats";
import { callApi, createMultiWorld, TEST_MANAGER } from "@/backend/worlds/worldTestUtils";
import type { ServerEvent } from "@/types/socialTypes";

type Login = ReturnType<typeof devAutoLogin>;

function listen(userId: string): ServerEvent[] {
  const events: ServerEvent[] = [];
  onSocketOpen({ data: { userId, session: "s", saveId: null, clubName: null }, send: (m: string) => events.push(JSON.parse(m)), close() {} } as SocialSocket);
  return events;
}

beforeEach(() => resetRealtime());

describe("world routes: invites, start, remove, leave, owner", () => {
  let owner: Login;
  let saveId: string;
  let premier: string[];

  beforeAll(async () => {
    owner = devAutoLogin("wm-owner@test.local");
    setNickname(owner.user.id, uniqueNick("own"), Date.now());
    saveId = (await createMultiWorld(owner.session.token)).json.id;
    premier = (await saveService.getSquadIndex(saveId)).inLeague("premier_league").map((e) => e.squadId).filter((id) => id !== "33");
  }, 300_000);
  afterAll(async () => { await saveService.deleteSave(saveId).catch(() => {}); }, 120_000);

  test("invite: friends only (404 otherwise), event to the invited, listed and declined", async () => {
    const friend = devAutoLogin("wm-friend@test.local");
    const friendNick = uniqueNick("fr");
    setNickname(friend.user.id, friendNick, Date.now());
    const stranger = devAutoLogin("wm-stranger@test.local");
    const strangerNick = uniqueNick("st");
    setNickname(stranger.user.id, strangerNick, Date.now());
    befriend(owner.user.id, friend.user.id, Date.now());

    const p = { saveId };
    expect((await callApi("POST", "/api/worlds/:saveId/invites", owner.session.token, { params: p, body: { nickname: strangerNick } })).status).toBe(404);
    const events = listen(friend.user.id);
    expect((await callApi("POST", "/api/worlds/:saveId/invites", owner.session.token, { params: p, body: { nickname: friendNick } })).status).toBe(200);
    expect(events).toContainEqual(expect.objectContaining({ type: "world_invite", saveId }));

    const mine = await callApi("GET", "/api/worlds/invites", friend.session.token);
    expect(mine.json.invites).toEqual([expect.objectContaining({ saveId, code: expect.any(String) })]);
    expect((await callApi("DELETE", "/api/worlds/invites/:saveId", friend.session.token, { params: p })).status).toBe(200);
    expect((await callApi("GET", "/api/worlds/invites", friend.session.token)).json.invites).toEqual([]);
  });

  test("start: owner only, once, world_started to the members", async () => {
    const member = devAutoLogin("wm-member@test.local");
    await addSeat(saveId, { userId: member.user.id, clubId: premier[0]!, manager: TEST_MANAGER });
    const p = { saveId };
    expect((await callApi("POST", "/api/worlds/:saveId/start", member.session.token, { params: p })).status).toBe(403);
    const events = listen(member.user.id);
    const started = await callApi("POST", "/api/worlds/:saveId/start", owner.session.token, { params: p });
    expect(started).toMatchObject({ status: 200, json: { phase: "running" } });
    expect(events).toContainEqual({ type: "world_started", saveId });
    const meta = (await saveService.getMeta(saveId))!;
    expect(meta.world?.phase).toBe("running");
    expect(meta.presimulated).toBe(true);
    expect(await callApi("POST", "/api/worlds/:saveId/start", owner.session.token, { params: p }))
      .toMatchObject({ status: 409, json: { error: "alreadyStarted" } });
  }, 600_000);

  test("remove: owner only, not himself; the removed gets world_removed and his club goes to the AI", async () => {
    const victim = devAutoLogin("wm-victim@test.local");
    const seat = await addSeat(saveId, { userId: victim.user.id, clubId: premier[1]!, manager: TEST_MANAGER });
    const p = { saveId, seatId: seat.seatId };
    const ownerSeat = memberOf(saveId, owner.user.id)!.seatId;
    expect((await callApi("POST", "/api/worlds/:saveId/members/:seatId/remove", victim.session.token, { params: p })).status).toBe(403);
    expect(await callApi("POST", "/api/worlds/:saveId/members/:seatId/remove", owner.session.token, { params: { saveId, seatId: ownerSeat } }))
      .toMatchObject({ status: 400, json: { error: "useLeave" } });
    const events = listen(victim.user.id);
    expect((await callApi("POST", "/api/worlds/:saveId/members/:seatId/remove", owner.session.token, { params: p })).status).toBe(200);
    expect(events).toContainEqual({ type: "world_removed", saveId });
    expect(memberOf(saveId, victim.user.id)).toBeNull();
    expect((await saveService.humanClubIds(saveId)).has(premier[1]!)).toBe(false);
    expect((await callApi("POST", "/api/worlds/:saveId/members/:seatId/remove", owner.session.token, { params: p })).status).toBe(404);
  }, 600_000);

  test("owner: transfer, then the old owner leaves; the last member leaving deletes the world", async () => {
    const p = { saveId };
    expect(await callApi("POST", "/api/worlds/:saveId/leave", owner.session.token, { params: p }))
      .toMatchObject({ status: 409, json: { error: "transferFirst" } });
    const member = devAutoLogin("wm-member@test.local");
    const memberSeat = memberOf(saveId, member.user.id)!.seatId;
    expect((await callApi("POST", "/api/worlds/:saveId/owner", member.session.token, { params: p, body: { seatId: memberSeat } })).status).toBe(403);
    expect((await callApi("POST", "/api/worlds/:saveId/owner", owner.session.token, { params: p, body: { seatId: memberSeat } })).status).toBe(200);
    expect(memberOf(saveId, member.user.id)?.role).toBe("owner");
    expect(memberOf(saveId, owner.user.id)?.role).toBe("member");

    expect((await callApi("POST", "/api/worlds/:saveId/leave", owner.session.token, { params: p })).status).toBe(200);
    expect(memberOf(saveId, owner.user.id)).toBeNull();
    expect((await saveService.humanClubIds(saveId)).has("33")).toBe(false);

    const last = await callApi("POST", "/api/worlds/:saveId/leave", member.session.token, { params: p });
    expect(last).toMatchObject({ status: 200, json: { deleted: true } });
    expect(await saveService.getMeta(saveId)).toBeNull();
  }, 600_000);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/backend/worlds/worldRoutes.manage.test.ts`
Expected: FAIL (`no POST on /api/worlds/:saveId/invites`).

- [ ] **Step 3: Implementar** — em `src/backend/worlds/worldRoutes.ts`:

Imports a mais:

```ts
import { memberBySeat, transferOwnership } from "@/backend/auth/saveOwnership";
import { areFriends, blockedEitherWay, findUserByNickname } from "@/backend/social/socialStore";
import { notifyUser } from "@/backend/social/realtime";
import { presimulateWorld } from "@/backend/advanceDay";
import { removeSeat } from "@/backend/seats";
import { deleteWorld } from "@/backend/worlds/worldLifecycle";
import {
  addWorldInvite, hasWorldInvite, listWorldInvitesFor, pendingInviteCount, worldCodeOf,
} from "@/backend/worlds/worldStore";
import { isValidSeatId } from "@/Domain/seats/seats";
import type { WorldInviteView } from "@/types/multiplayerTypes";
```

(Junte `memberBySeat, transferOwnership` ao import de `saveOwnership`, `removeSeat` ao de `@/backend/seats`, `deleteWorld`
ao de `worldLifecycle` e os de `worldStore` ao import já existente, sem duplicar linhas.)

Rotas novas, dentro de `worldRoutes`:

```ts
  "/api/worlds/invites": {
    GET: async (req: Req) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      const invites: WorldInviteView[] = [];
      for (const inv of listWorldInvitesFor(auth.userId)) {
        const meta = await multiWorld(inv.saveId);
        const code = worldCodeOf(inv.saveId);
        const from = getSocialUser(inv.fromUser)?.nickname;
        if (!meta || !code || !from || memberOf(inv.saveId, auth.userId)) continue;
        invites.push({ saveId: inv.saveId, name: meta.name, from, code });
      }
      return Response.json({ invites });
    },
  },

  "/api/worlds/invites/:saveId": {
    DELETE: async (req: Req) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      deleteWorldInvite(req.params.saveId!, auth.userId);
      return Response.json({ ok: true });
    },
  },

  "/api/worlds/:saveId/invites": {
    POST: async (req: Req) => {
      const saveId = req.params.saveId!;
      const auth = requireSeat(req, saveId);
      if (auth instanceof Response) return auth;
      if (auth.role !== "owner") return fail("ownerOnly", 403);
      const from = getSocialUser(auth.userId)?.nickname;
      if (!from) return fail("noNickname", 409);
      const body = await readBody(req);
      if (!body || typeof body.nickname !== "string") return fail("invalidBody", 400);
      const meta = await multiWorld(saveId);
      if (!meta) return fail("notMulti", 404);
      // Only a friend of the owner, never across a block; a stranger "does not exist" (404).
      const target = findUserByNickname(body.nickname);
      if (!target || !areFriends(auth.userId, target.id) || blockedEitherWay(auth.userId, target.id)) return fail("notFound", 404);
      if (memberOf(saveId, target.id)) return fail("alreadyMember", 409);
      if (meta.seats.length >= WORLD.MAX_MEMBERS) return fail("full", 409);
      if (!hasWorldInvite(saveId, target.id) && pendingInviteCount(saveId) >= WORLD.MAX_PENDING_INVITES) return fail("inviteLimit", 409);
      addWorldInvite(saveId, target.id, auth.userId, Date.now());
      notifyUser(target.id, { type: "world_invite", saveId, name: meta.name, from, code: meta.world.inviteCode });
      return Response.json({ ok: true });
    },
  },

  "/api/worlds/:saveId/start": {
    POST: async (req: Req) => {
      const saveId = req.params.saveId!;
      const auth = requireSeat(req, saveId);
      if (auth instanceof Response) return auth;
      if (auth.role !== "owner") return fail("ownerOnly", 403);
      return withSaveLock(saveId, async () => {
        const meta = await multiWorld(saveId);
        if (!meta) return fail("notMulti", 404);
        if (meta.world.phase !== "lobby") return fail("alreadyStarted", 409);
        const result = await presimulateWorld(saveId, auth.seatId);
        const fresh = (await multiWorld(saveId))!;
        await saveService.updateMeta(saveId, { world: { ...fresh.world, phase: "running" } });
        notifyWorld(saveId, { type: "world_started", saveId });
        return Response.json({ ...result, phase: "running" });
      });
    },
  },

  "/api/worlds/:saveId/members/:seatId/remove": {
    POST: async (req: Req) => {
      const saveId = req.params.saveId!;
      const seatId = req.params.seatId!;
      const auth = requireSeat(req, saveId);
      if (auth instanceof Response) return auth;
      if (auth.role !== "owner") return fail("ownerOnly", 403);
      if (!(await multiWorld(saveId))) return fail("notMulti", 404);
      if (seatId === auth.seatId) return fail("useLeave", 400);
      if (!isValidSeatId(seatId) || !memberBySeat(saveId, seatId)) return fail("notMember", 404);
      const removed = await removeSeat(saveId, seatId);
      if (removed.userId) notifyUser(removed.userId, { type: "world_removed", saveId });
      await announceMemberChange(saveId, { seatId, event: "removed", ...removed });
      return Response.json({ ok: true });
    },
  },

  "/api/worlds/:saveId/leave": {
    POST: async (req: Req) => {
      const saveId = req.params.saveId!;
      const auth = requireSeat(req, saveId);
      if (auth instanceof Response) return auth;
      if (!(await multiWorld(saveId))) return fail("notMulti", 404);
      if (auth.role === "owner") {
        // The owner passes the ownership first; alone, leaving deletes the world.
        if (listSaveMembers(saveId).some((m) => m.userId !== auth.userId)) return fail("transferFirst", 409);
        await withSaveLock(saveId, () => deleteWorld(saveId, auth.userId));
        return Response.json({ ok: true, deleted: true });
      }
      const removed = await removeSeat(saveId, auth.seatId);
      await announceMemberChange(saveId, { seatId: auth.seatId, event: "left", ...removed });
      return Response.json({ ok: true });
    },
  },

  "/api/worlds/:saveId/owner": {
    POST: async (req: Req) => {
      const saveId = req.params.saveId!;
      const auth = requireSeat(req, saveId);
      if (auth instanceof Response) return auth;
      if (auth.role !== "owner") return fail("ownerOnly", 403);
      const body = await readBody(req);
      if (!body || typeof body.seatId !== "string") return fail("invalidBody", 400);
      const target = memberBySeat(saveId, body.seatId);
      if (!target || target.userId === auth.userId) return fail("notMember", 404);
      transferOwnership(saveId, auth.userId, target.userId);
      notifyWorld(saveId, { type: "world_members", saveId });
      return Response.json({ ok: true });
    },
  },
```

Observação: o `announceMemberChange` recebe `{ seatId, event, ...removed }`; `RemovedSeat` traz `userId` a mais, que
o tipo `MemberChange` não tem. Faça o espalhamento explícito para o `tsc` não reclamar:

```ts
      await announceMemberChange(saveId, {
        seatId, event: "removed", managerName: removed.managerName, clubId: removed.clubId,
        clubName: removed.clubName, leagueSlug: removed.leagueSlug,
      });
```

(e o mesmo no `leave`, com `event: "left"` e `seatId: auth.seatId`).

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/backend/worlds`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/worlds/worldRoutes.ts src/backend/worlds/worldRoutes.manage.test.ts
git commit -m "feat(world): convites, começar, tirar, sair e passar a posse

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Fluxo completo

**Files:**
- Create: `src/backend/worlds/worldFlow.test.ts`

- [ ] **Step 1: Escrever o teste** (passa direto se as tarefas anteriores estão certas; é a rede do fluxo inteiro)

```ts
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { resetRealtime } from "@/backend/social/realtime";
import { callApi, createMultiWorld, TEST_MANAGER } from "@/backend/worlds/worldTestUtils";

describe("world of friends: the whole flow", () => {
  let saveId = "";
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId).catch(() => {}); }, 120_000);

  test("owner creates, two friends join, owner starts, one leaves, another takes the freed club", async () => {
    resetRealtime();
    const owner = devAutoLogin("flow-owner@test.local");
    const created = await createMultiWorld(owner.session.token);
    saveId = created.json.id;
    const code = created.json.world.inviteCode as string;
    const premier = (await saveService.getSquadIndex(saveId)).inLeague("premier_league").map((e) => e.squadId).filter((id) => id !== "33");

    const a = devAutoLogin("flow-a@test.local");
    const b = devAutoLogin("flow-b@test.local");
    const join = (token: string, clubId: string) => callApi("POST", "/api/worlds/join", token, { body: { code, clubId, manager: TEST_MANAGER } });
    expect((await join(a.session.token, premier[0]!)).status).toBe(201);
    expect((await join(b.session.token, premier[1]!)).status).toBe(201);

    const p = { saveId };
    expect((await callApi("POST", "/api/worlds/:saveId/start", owner.session.token, { params: p })).json.phase).toBe("running");
    expect((await saveService.getMeta(saveId))?.seats).toHaveLength(3);

    expect((await callApi("POST", "/api/worlds/:saveId/leave", a.session.token, { params: p })).status).toBe(200);
    const view = await callApi("GET", "/api/worlds/:saveId", owner.session.token, { params: p });
    expect(view.json.members).toHaveLength(2);
    const ownerInbox = await saveService.getInbox(saveId, view.json.mySeatId);
    expect(ownerInbox.filter((m) => m.category === "world").map((m) => m.kind).sort()).toEqual(["member_joined", "member_joined", "member_left"]);

    const c = devAutoLogin("flow-c@test.local");
    const byCode = await callApi("GET", "/api/worlds/by-code/:code", c.session.token, { params: { code } });
    expect(byCode.json.takenClubs).not.toContain(premier[0]);
    const joined = await join(c.session.token, premier[0]!);
    expect(joined).toMatchObject({ status: 201, json: { phase: "running" } });
    const managers = await saveService.getManagers(saveId);
    expect(managers.filter((m) => m.squadId === premier[0]).map((m) => m.seatId)).toEqual([joined.json.seatId]);
    expect((await saveService.getMeta(saveId))?.managerVacancies?.[premier[0]!]).toBeUndefined();
  }, 1_200_000);
});
```

- [ ] **Step 2: Rodar**

Run: `bun test src/backend/worlds/worldFlow.test.ts`
Expected: PASS. Se falhar, a causa está numa tarefa anterior: corrija lá (com o teste dela) antes de seguir.

- [ ] **Step 3: Commit**

```bash
git add src/backend/worlds/worldFlow.test.ts
git commit -m "test(world): fluxo completo da liga de amigos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Voltar para a página pedida depois do login

**Files:**
- Create: `src/GameInterface/authRedirect.ts`, `src/GameInterface/authRedirect.test.ts`
- Modify: `src/GameInterface/AuthGate.tsx`, `src/GameInterface/LoginScreen.tsx`

- [ ] **Step 1: Escrever o teste que falha**

`src/GameInterface/authRedirect.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { loginUrlFor, safeNextPath } from "@/GameInterface/authRedirect";

describe("auth redirect", () => {
  test("the login link carries the current path", () => {
    expect(loginUrlFor("/join/23456789AB", "")).toBe("/login?next=%2Fjoin%2F23456789AB");
    expect(loginUrlFor("/dashboard", "?tab=x")).toBe("/login?next=%2Fdashboard%3Ftab%3Dx");
    expect(loginUrlFor("/", "")).toBe("/login");
  });

  test("only a same-site path is followed", () => {
    expect(safeNextPath("?next=%2Fjoin%2F23456789AB")).toBe("/join/23456789AB");
    expect(safeNextPath("")).toBe("/start");
    expect(safeNextPath("?next=https%3A%2F%2Fevil.example")).toBe("/start");
    expect(safeNextPath("?next=%2F%2Fevil.example")).toBe("/start");
    expect(safeNextPath("?next=%2F%5Cevil")).toBe("/start");
    expect(safeNextPath("?next=%2Flogin")).toBe("/start");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/GameInterface/authRedirect.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/GameInterface/authRedirect.ts`:

```ts
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
```

`src/GameInterface/AuthGate.tsx`: `import { loginUrlFor } from "@/GameInterface/authRedirect";` e as duas linhas
`window.location.replace("/login");` passam a:

```ts
          window.location.replace(loginUrlFor(window.location.pathname, window.location.search));
```

`src/GameInterface/LoginScreen.tsx`: `import { safeNextPath } from "@/GameInterface/authRedirect";` e
`window.location.href = "/start";` (depois do `verify`) passa a:

```ts
      window.location.href = safeNextPath(window.location.search);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/GameInterface/authRedirect.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/GameInterface/authRedirect.ts src/GameInterface/authRedirect.test.ts src/GameInterface/AuthGate.tsx src/GameInterface/LoginScreen.tsx
git commit -m "feat(world): o login volta para a página pedida (link de convite)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Cliente — API do mundo, navegação e eventos

**Files:**
- Create: `src/GameInterface/World/worldApi.ts`
- Create: `src/GameInterface/World/worldNav.ts`, `src/GameInterface/World/worldNav.test.ts`
- Modify: `src/GameInterface/gameSession.ts`
- Modify: `src/GameInterface/Social/useSocial.tsx`, `src/GameInterface/Social/FriendsPanel.tsx`, `src/GameInterface/Social/FriendsButton.tsx`

- [ ] **Step 1: Escrever o teste que falha**

`src/GameInterface/World/worldNav.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { joinCodeFromPath, joinLink, worldRedirect } from "@/GameInterface/World/worldNav";

describe("world navigation", () => {
  test("in the lobby every game screen goes to /world", () => {
    const lobby = { mode: "multi" as const, world: { phase: "lobby" as const } };
    expect(worldRedirect("/dashboard", lobby)).toBe("/world");
    expect(worldRedirect("/squad/premier_league/33", lobby)).toBe("/world");
    expect(worldRedirect("/world", lobby)).toBeNull();
  });

  test("running: nothing moves; a solo save has no /world", () => {
    expect(worldRedirect("/dashboard", { mode: "multi", world: { phase: "running" } })).toBeNull();
    expect(worldRedirect("/world", { mode: "multi", world: { phase: "running" } })).toBeNull();
    expect(worldRedirect("/world", { mode: "solo" })).toBe("/dashboard");
    expect(worldRedirect("/dashboard", null)).toBeNull();
  });

  test("join links", () => {
    expect(joinCodeFromPath("/join/23456789AB")).toBe("23456789AB");
    expect(joinCodeFromPath("/join/")).toBe("");
    expect(joinLink("https://fm.example", "23456789AB")).toBe("https://fm.example/join/23456789AB");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/GameInterface/World/worldNav.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/GameInterface/World/worldNav.ts`:

```ts
import type { WorldPhase } from "@/types/multiplayerTypes";

/** The page a game screen must go to now: `/world` while the world is in the lobby; `/dashboard` from `/world` of a solo save. */
export function worldRedirect(
  pathname: string, save: { mode?: "solo" | "multi"; world?: { phase: WorldPhase } } | null,
): string | null {
  if (!save) return null;
  if (save.world?.phase === "lobby") return pathname === "/world" ? null : "/world";
  if (pathname === "/world" && save.mode !== "multi") return "/dashboard";
  return null;
}

export function joinCodeFromPath(pathname: string): string {
  return decodeURIComponent(pathname.split("/")[2] ?? "");
}

export function joinLink(origin: string, code: string): string {
  return `${origin}/join/${code}`;
}
```

`src/GameInterface/World/worldApi.ts`:

```ts
import type { SaveManager } from "@/types/seatTypes";
import type {
  WorldByCode, WorldDeadline, WorldErrorCode, WorldInviteView, WorldPhase, WorldView,
} from "@/types/multiplayerTypes";

export type WorldApiError = WorldErrorCode | "generic";
export type WorldResult<T> = { ok: true; data: T } | { ok: false; status: number; error: WorldApiError; saveId?: string };

const seg = (s: string) => encodeURIComponent(s);

async function call<T>(method: string, path: string, body?: unknown): Promise<WorldResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.ok) return { ok: true, data: json as T };
    return {
      ok: false,
      status: res.status,
      error: (typeof json?.error === "string" ? json.error : "generic") as WorldApiError,
      ...(typeof json?.saveId === "string" ? { saveId: json.saveId } : {}),
    };
  } catch {
    return { ok: false, status: 0, error: "generic" };
  }
}

export const worldApi = {
  view: (saveId: string) => call<WorldView>("GET", `/api/worlds/${seg(saveId)}`),
  byCode: (code: string) => call<WorldByCode>("GET", `/api/worlds/by-code/${seg(code)}`),
  join: (body: { code: string; clubId: string; manager: SaveManager; sackingEnabled: boolean }) =>
    call<{ saveId: string; seatId: string; phase: WorldPhase }>("POST", "/api/worlds/join", body),
  newCode: (saveId: string) => call<{ inviteCode: string }>("POST", `/api/worlds/${seg(saveId)}/invite-code`),
  settings: (saveId: string, deadlineHours: WorldDeadline) =>
    call<{ deadlineHours: WorldDeadline }>("PUT", `/api/worlds/${seg(saveId)}/settings`, { deadlineHours }),
  invite: (saveId: string, nickname: string) => call<{ ok: true }>("POST", `/api/worlds/${seg(saveId)}/invites`, { nickname }),
  invites: () => call<{ invites: WorldInviteView[] }>("GET", "/api/worlds/invites"),
  declineInvite: (saveId: string) => call<{ ok: true }>("DELETE", `/api/worlds/invites/${seg(saveId)}`),
  start: (saveId: string) => call<{ phase: WorldPhase }>("POST", `/api/worlds/${seg(saveId)}/start`),
  remove: (saveId: string, seatId: string) => call<{ ok: true }>("POST", `/api/worlds/${seg(saveId)}/members/${seg(seatId)}/remove`),
  leave: (saveId: string) => call<{ ok: true; deleted?: true }>("POST", `/api/worlds/${seg(saveId)}/leave`),
  transferOwner: (saveId: string, seatId: string) => call<{ ok: true }>("POST", `/api/worlds/${seg(saveId)}/owner`, { seatId }),
};
```

`src/GameInterface/gameSession.ts`:
- `createGameSave(data: {…})` ganha o campo `mode?: "solo" | "multi";` (o corpo continua mandando `data` inteiro).
- depois de `function clearSession()`:

```ts
/** The world left or was deleted (multiplayer part 2): forget the session if it was that one. */
export function forgetSession(saveId: string): void {
  if (loadSession()?.saveId === saveId) clearSession();
}
```

`src/GameInterface/Social/useSocial.tsx`:
- imports: `import { worldApi } from "@/GameInterface/World/worldApi";`, `import { forgetSession } from "@/GameInterface/gameSession";`,
  `import type { WorldInviteView } from "@/types/multiplayerTypes";`
- `SocialContextValue` ganha:

```ts
  /** Invites to worlds of friends (multiplayer part 2). */
  worldInvites: WorldInviteView[];
  refreshWorldInvites: () => Promise<void>;
  declineWorldInvite: (saveId: string) => Promise<void>;
  /** Bumped on `world_members` of the open world: the world screen reloads. */
  worldVersion: number;
```

- estados e callbacks no `SocialProvider` (junto dos outros `useState`/`useCallback`):

```ts
  const [worldInvites, setWorldInvites] = useState<WorldInviteView[]>([]);
  const [worldVersion, setWorldVersion] = useState(0);

  const refreshWorldInvites = useCallback(async () => {
    const r = await worldApi.invites();
    if (r.ok) setWorldInvites(r.data.invites);
  }, []);

  const declineWorldInvite = useCallback(async (inviteSaveId: string) => {
    await worldApi.declineInvite(inviteSaveId);
    setWorldInvites((prev) => prev.filter((i) => i.saveId !== inviteSaveId));
  }, []);
```

- no `useEffect` inicial (o que chama `socialApi.me()` e `refreshFriends()`), acrescentar `void refreshWorldInvites();`
  e a dependência.
- em `handleEvent`, novos `case` (e `saveId`, `refreshWorldInvites` nas dependências do `useCallback`):

```ts
        case "world_invite":
          void refreshWorldInvites();
          break;
        case "world_members":
          if (event.saveId === saveId) setWorldVersion((v) => v + 1);
          break;
        case "world_started":
          if (event.saveId === saveId && window.location.pathname === "/world") window.location.replace("/dashboard");
          break;
        case "world_removed":
        case "world_deleted":
          if (event.saveId === saveId) {
            forgetSession(event.saveId);
            window.location.replace("/start");
          }
          break;
```

- no objeto de valor do contexto, acrescentar `worldInvites, refreshWorldInvites, declineWorldInvite, worldVersion`.

`src/GameInterface/Social/FriendsButton.tsx`: o selo conta os convites:

```ts
  const badge = s.totalUnread + s.lists.incoming.length + s.worldInvites.length;
```

`src/GameInterface/Social/FriendsPanel.tsx`:
- o rótulo da aba Pedidos conta os convites: `const requestCount = s.lists.incoming.length + s.worldInvites.length;`
- em `RequestsTab`, a condição de "nenhum pedido" passa a
  `if (incoming.length === 0 && outgoing.length === 0 && s.worldInvites.length === 0)`, e antes do bloco `incoming`:

```tsx
      {s.worldInvites.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className={GROUP_LABEL}>
            {t("world.invites.title")} · {s.worldInvites.length}
          </p>
          {s.worldInvites.map((inv) => (
            <div key={inv.saveId} className="flex items-center justify-between gap-2">
              <span className="text-sm text-foreground truncate">{t("world.invites.from", { from: inv.from, name: inv.name })}</span>
              <div className="flex items-center gap-3">
                <Button onClick={() => { window.location.href = `/join/${inv.code}`; }}>{t("world.invites.accept")}</Button>
                <Button variant="secondary" flush onClick={() => void s.declineWorldInvite(inv.saveId)}>
                  {t("world.invites.decline")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/GameInterface/World src/GameInterface/Social` e `bunx tsc --noEmit`
Expected: PASS; `tsc` só com o erro antigo.

- [ ] **Step 5: Commit**

```bash
git add src/GameInterface/World/worldApi.ts src/GameInterface/World/worldNav.ts src/GameInterface/World/worldNav.test.ts src/GameInterface/gameSession.ts src/GameInterface/Social
git commit -m "feat(world): cliente da liga de amigos, convites no painel e eventos do socket

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: `NewGameWizard` — "Sozinho / Com amigos" e o modo "entrar"

**Files:**
- Modify: `src/GameInterface/NewGameWizard.tsx`

Sem teste automático (tela): a verificação é o `tsc`, o `ui:audit` e o roteiro manual da Tarefa 23.

- [ ] **Step 1: Props e estado**

Imports novos:

```ts
import { loadGameSave } from "@/GameInterface/gameSession";
import { worldApi } from "@/GameInterface/World/worldApi";
import { WORLD } from "@/Domain/multiplayer/worldConfig";
```

(`loadGameSave` junto do `createGameSave` no import já existente.)

Antes de `export function NewGameWizard()`:

```ts
/** Joining a world of friends (`/join/:code`): the same wizard, without the mode step, human clubs disabled. */
export interface JoinContext {
  code: string;
  worldName: string;
  takenClubs: string[];
}
```

A assinatura e o estado:

```ts
export function NewGameWizard({ join }: { join?: JoinContext }) {
  …
  const [step, setStep] = useState<"mode" | "manager" | "club">(join ? "manager" : "mode");
  /** Solo career or a world of friends (multiplayer part 2). */
  const [playMode, setPlayMode] = useState<"solo" | "multi">("solo");
  const taken = new Set(join?.takenClubs ?? []);
```

- [ ] **Step 2: Início da carreira** — em `handleStartCareer`, logo depois de `setStartError(null);`:

```ts
    if (join) {
      const r = await worldApi.join({
        code: join.code,
        clubId: selectedTeam.squadId,
        manager: {
          name: manager.name.trim(),
          nationalityIso: manager.nationality.id,
          backgroundId: manager.background.id,
          face: manager.face,
        },
        sackingEnabled: manager.sackingEnabled,
      });
      if (!r.ok) {
        setStarting(false);
        setStartError(t(`world.errors.${r.error}`));
        return;
      }
      await loadGameSave(r.data.saveId);
      window.location.href = r.data.phase === "lobby" ? "/world" : "/dashboard";
      return;
    }
```

No `createGameSave({...})` acrescentar `mode: playMode,`. Depois do `capture("career_started", …)`:

```ts
      // A world of friends waits in the lobby: the owner starts it from the league screen.
      if (playMode === "multi") {
        window.location.href = "/world";
        return;
      }
```

- [ ] **Step 3: Passo do modo** — antes de `if (step === "manager") {`:

```tsx
  if (step === "mode") {
    return (
      <WizardFrame backdrop>
        <div className="flex-1 min-h-0 md:overflow-y-auto">
          <div className="flex min-h-full flex-col">
            <div className="m-auto w-full max-w-[720px] p-6 md:p-8">
              <ScreenTitle subtitle={t("newGame.mode.subtitle")}>{t("newGame.mode.title")}</ScreenTitle>
              <div className="grid gap-3 mt-8 sm:grid-cols-2">
                <ChoiceCard
                  title={t("newGame.mode.solo")}
                  description={t("newGame.mode.soloDetail")}
                  selected={playMode === "solo"}
                  onSelect={() => setPlayMode("solo")}
                />
                <ChoiceCard
                  title={t("newGame.mode.multi")}
                  description={t("newGame.mode.multiDetail", { max: WORLD.MAX_MEMBERS })}
                  selected={playMode === "multi"}
                  onSelect={() => setPlayMode("multi")}
                />
              </div>
              <div className="flex items-center gap-2 mt-8">
                <Button variant="secondary" className="px-3" onClick={() => { window.location.href = "/start"; }}>
                  {t("newGame.back")}
                </Button>
                <Button className="flex-1" onClick={() => setStep("manager")}>{t("newGame.mode.next")}</Button>
              </div>
            </div>
          </div>
        </div>
      </WizardFrame>
    );
  }
```

O `onCancel` do `ManagerForm` passa a:

```tsx
                onCancel={() => {
                  if (join) window.location.href = `/join/${join.code}`;
                  else setStep("mode");
                }}
```

- [ ] **Step 4: Clubes tomados** — no botão de cada clube da lista (`teams.map((club) => …)`):

```tsx
                    const humanClub = taken.has(club.squadId);
                    …
                        <button
                          type="button"
                          onClick={() => setSelectedTeam(club)}
                          aria-pressed={selected}
                          disabled={humanClub}
                          title={humanClub ? t("world.join.humanClub") : undefined}
                          className={`w-full flex items-center gap-3 min-h-12 px-2 py-2 text-left border-0 border-t border-border cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                            selected ? "bg-primary/10" : "bg-transparent hover:bg-foreground/5"
                          }`}
                        >
                          …
                          {humanClub && <span className="text-sm text-muted-foreground shrink-0">{t("world.join.humanClub")}</span>}
                          {profile && <ReputationStars value={profile.reputation} />}
                        </button>
```

E o rótulo do botão principal, no modo entrar:

```tsx
                {starting
                  ? t("newGame.creatingSeave")
                  : selectedTeam
                    ? t(join ? "world.join.joinWith" : "newGame.startWith", { club: selectedTeam.name })
                    : t("newGame.startCareer")}
```

- [ ] **Step 5: Verificar e commit**

Run: `bunx tsc --noEmit` e `bun run ui:audit --hard`
Expected: só o erro antigo; auditoria sem duras.

```bash
git add src/GameInterface/NewGameWizard.tsx
git commit -m "feat(world): novo jogo com amigos e o assistente no modo entrar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Página `/join/:code`

**Files:**
- Create: `src/GameInterface/World/JoinScreen.tsx`
- Create: `src/pages/join/index.html`, `src/pages/join/entry.tsx`
- Modify: `src/index.ts`, `scripts/ui-audit.ts`

- [ ] **Step 1: Tela**

`src/GameInterface/World/JoinScreen.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NewGameWizard } from "@/GameInterface/NewGameWizard";
import { PitchBackdrop } from "@/GameInterface/Components/PitchBackdrop";
import { Wordmark } from "@/GameInterface/Components/Wordmark";
import { Button } from "@/GameInterface/ui/Button";
import { Notice } from "@/GameInterface/ui/Notice";
import { ScreenTitle } from "@/GameInterface/ui/ScreenTitle";
import { loadGameSave } from "@/GameInterface/gameSession";
import { worldApi, type WorldApiError } from "@/GameInterface/World/worldApi";
import { joinCodeFromPath } from "@/GameInterface/World/worldNav";
import type { WorldByCode } from "@/types/multiplayerTypes";

type Stage =
  | { kind: "loading" }
  | { kind: "error"; error: WorldApiError }
  | { kind: "member"; saveId: string }
  | { kind: "info"; world: WorldByCode }
  | { kind: "wizard"; world: WorldByCode };

/** `/join/:code`: the world behind an invite link, then the new-game wizard in join mode. */
export function JoinScreen() {
  const { t } = useTranslation();
  const code = joinCodeFromPath(window.location.pathname);
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    void worldApi.byCode(code).then((r) => {
      if (r.ok) setStage({ kind: "info", world: r.data });
      else if (r.error === "alreadyMember" && r.saveId) setStage({ kind: "member", saveId: r.saveId });
      else setStage({ kind: "error", error: r.error });
    });
  }, [code]);

  if (stage.kind === "wizard") {
    return <NewGameWizard join={{ code, worldName: stage.world.name, takenClubs: stage.world.takenClubs }} />;
  }

  async function openWorld(saveId: string) {
    setOpening(true);
    try {
      await loadGameSave(saveId);
      window.location.href = "/world";
    } catch {
      setOpening(false);
    }
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background">
      <PitchBackdrop />
      <div className="relative w-full max-w-[480px] px-4">
        <Wordmark size="lg" className="mb-8 block text-center" />
        <ScreenTitle>{t("world.join.title")}</ScreenTitle>
        <div className="mt-6 flex flex-col gap-4">
          {stage.kind === "loading" && <p className="text-sm text-muted-foreground m-0">{t("common.loading")}</p>}
          {stage.kind === "error" && (
            <>
              <Notice kind="error">{t(`world.errors.${stage.error}`)}</Notice>
              <Button variant="secondary" flush onClick={() => { window.location.href = "/start"; }}>{t("world.join.toStart")}</Button>
            </>
          )}
          {stage.kind === "member" && (
            <>
              <Notice>{t("world.errors.alreadyMember")}</Notice>
              <Button onClick={() => void openWorld(stage.saveId)} disabled={opening}>{t("world.join.open")}</Button>
            </>
          )}
          {stage.kind === "info" && (
            <>
              <div className="rounded-md border border-border bg-card p-4">
                <p className="font-display font-black uppercase text-xl leading-none m-0">{stage.world.name}</p>
                <p className="text-sm text-muted-foreground mt-2 mb-0">{t("world.join.owner", { name: stage.world.owner })}</p>
                <p className="text-sm text-muted-foreground m-0 tabular-nums">
                  {t("world.members.count", { count: stage.world.members, max: stage.world.max })}
                  {" · "}
                  {t(`world.status.${stage.world.phase}`)}
                </p>
              </div>
              <Button onClick={() => setStage({ kind: "wizard", world: stage.world })}>{t("world.join.choose")}</Button>
              <Button variant="secondary" flush onClick={() => { window.location.href = "/start"; }}>{t("world.join.toStart")}</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Página e rota**

`src/pages/join/index.html` (cópia do `src/pages/news/index.html` com o título `FMProject - Join a league`).

`src/pages/join/entry.tsx`:

```tsx
import { createPage } from "@/createPage";
import { JoinScreen } from "@/GameInterface/World/JoinScreen";

createPage(JoinScreen, { responsive: true });
```

`src/index.ts`: `import joinPage from "./pages/join/index.html";` e, nas rotas, depois de `"/new-game": newGamePage,`:

```ts
    "/join/:code": joinPage,
```

`scripts/ui-audit.ts`: acrescentar `"src/GameInterface/World/JoinScreen.tsx",` ao `ENTRY_TITLE_FILES`.

- [ ] **Step 3: Verificar e commit**

Run: `bunx tsc --noEmit` e `bun run ui:audit --hard`
Expected: só o erro antigo; sem duras.

```bash
git add src/GameInterface/World/JoinScreen.tsx src/pages/join src/index.ts scripts/ui-audit.ts
git commit -m "feat(world): página de entrada pelo link de convite

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: Tela `/world`, redirecionamento em `lobby` e ícone da barra

**Files:**
- Create: `src/GameInterface/World/WorldScreen.tsx`, `src/GameInterface/World/InviteFriendsModal.tsx`
- Create: `src/pages/world/index.html`, `src/pages/world/entry.tsx`
- Modify: `src/GameInterface/Components/Layout.tsx`, `src/GameInterface/Components/TopNavigation.tsx`, `src/index.ts`

- [ ] **Step 1: Convidar amigos**

`src/GameInterface/World/InviteFriendsModal.tsx`:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/GameInterface/Components/Modal";
import { Button } from "@/GameInterface/ui/Button";
import { Notice } from "@/GameInterface/ui/Notice";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { useSocial } from "@/GameInterface/Social/useSocial";
import { worldApi, type WorldApiError } from "@/GameInterface/World/worldApi";

/** The owner's friends, one "Invite" each (`POST /api/worlds/:saveId/invites`). */
export function InviteFriendsModal({ saveId, open, onClose, members }: {
  saveId: string; open: boolean; onClose: () => void; members: string[];
}) {
  const { t } = useTranslation();
  const s = useSocial();
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [error, setError] = useState<WorldApiError | null>(null);
  const friends = s.lists.friends.filter((f) => !members.includes(f.nickname));

  async function invite(nickname: string) {
    const r = await worldApi.invite(saveId, nickname);
    if (r.ok) {
      setError(null);
      setSent((prev) => new Set(prev).add(nickname));
    } else {
      setError(r.error);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md">
      <div className="p-5 flex flex-col gap-4">
        <SectionTitle>{t("world.invite.friendsTitle")}</SectionTitle>
        {error && <Notice kind="error">{t(`world.errors.${error}`)}</Notice>}
        {friends.length === 0 ? (
          <p className="text-sm text-muted-foreground m-0">{t("world.invite.noFriends")}</p>
        ) : (
          <ul className="list-none p-0 m-0 flex flex-col gap-2">
            {friends.map((f) => (
              <li key={f.nickname} className="flex items-center justify-between gap-3">
                <span className="font-semibold text-foreground truncate">{f.nickname}</span>
                <Button onClick={() => void invite(f.nickname)} disabled={sent.has(f.nickname)}>
                  {sent.has(f.nickname) ? t("world.invite.sent") : t("world.invite.send")}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button variant="secondary" flush onClick={onClose}>{t("common.close")}</Button>
      </div>
    </Modal>
  );
}
```

(`members` = apelidos dos membros atuais; `common.close` já existe.)

- [ ] **Step 2: Tela da liga**

`src/GameInterface/World/WorldScreen.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";
import { ScreenTitle } from "@/GameInterface/ui/ScreenTitle";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { Button } from "@/GameInterface/ui/Button";
import { Notice } from "@/GameInterface/ui/Notice";
import { Label } from "@/GameInterface/ui/Label";
import { TABLE_CELL, TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import { ConfirmDialog } from "@/GameInterface/Components/ConfirmDialog";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { ManagerFaceImage } from "@/GameInterface/Components/PersonFace";
import { PreSeasonLoadingScreen } from "@/GameInterface/PreSeasonLoadingScreen";
import { Icon } from "@/GameInterface/Icons";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { useSocial } from "@/GameInterface/Social/useSocial";
import { forgetSession } from "@/GameInterface/gameSession";
import { worldApi, type WorldApiError } from "@/GameInterface/World/worldApi";
import { joinLink } from "@/GameInterface/World/worldNav";
import { InviteFriendsModal } from "@/GameInterface/World/InviteFriendsModal";
import { seatManagerId } from "@/Domain/seats/seats";
import { managerFaceCountry } from "@/Domain/faces/managerFace";
import type { WorldDeadline, WorldMemberView, WorldView } from "@/types/multiplayerTypes";

type DeadlineKey = "12" | "24" | "48" | "none";
const toKey = (d: WorldDeadline): DeadlineKey => (d === null ? "none" : (String(d) as DeadlineKey));
const fromKey = (k: DeadlineKey): WorldDeadline => (k === "none" ? null : (Number(k) as 12 | 24 | 48));

type Pending = { kind: "remove" | "owner"; member: WorldMemberView } | { kind: "leave" } | null;

/** "YOUR LEAGUE": members, invite, deadline, start, leave (`.claude/rules/game/multiplayer.md`, part 2). */
export function WorldScreen() {
  const { t } = useTranslation();
  const { session } = useGameSave();
  const social = useSocial();
  const saveId = session?.saveId ?? "";
  const [view, setView] = useState<WorldView | null>(null);
  const [error, setError] = useState<WorldApiError | null>(null);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!saveId) return;
    const r = await worldApi.view(saveId);
    if (r.ok) setView(r.data);
    else setError(r.error);
  }, [saveId]);

  useEffect(() => { void load(); }, [load, social.worldVersion]);

  if (starting) return <PreSeasonLoadingScreen />;

  const owner = view?.myRole === "owner";
  const link = view ? joinLink(window.location.origin, view.inviteCode) : "";

  async function run(p: Promise<{ ok: boolean; error?: WorldApiError }>, after?: () => void) {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (!r.ok) setError(r.error ?? "generic");
    else { setError(null); after?.(); await load(); }
  }

  async function start() {
    setStarting(true);
    const r = await worldApi.start(saveId);
    if (r.ok) window.location.href = "/dashboard";
    else { setStarting(false); setError(r.error); }
  }

  async function confirmPending() {
    if (!pending) return;
    if (pending.kind === "remove") await run(worldApi.remove(saveId, pending.member.seatId));
    else if (pending.kind === "owner") await run(worldApi.transferOwner(saveId, pending.member.seatId));
    else {
      setBusy(true);
      const r = await worldApi.leave(saveId);
      setBusy(false);
      if (r.ok) { forgetSession(saveId); window.location.href = "/start"; return; }
      setError(r.error);
    }
    setPending(null);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <ScreenContainer>
      <ScreenTitle
        accent={t("screenTitles.world.accent")}
        subtitle={view ? `${view.name} · ${t(`world.status.${view.phase}`)} · ${t("world.members.count", { count: view.members.length, max: view.max })}` : undefined}
      >
        {t("screenTitles.world.main")}
      </ScreenTitle>

      {error && <Notice kind="error">{t(`world.errors.${error}`)}</Notice>}
      {!view && !error && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}

      {view && (
        <>
          <section className="flex flex-col gap-3">
            <SectionTitle>{t("world.members.title")}</SectionTitle>
            <div className={TABLE_STYLE.shell}>
              <table className="w-full">
                <thead className={TABLE_STYLE.head}>
                  <tr>
                    <th className={`${TABLE_CELL.head} text-left`}>{t("world.members.manager")}</th>
                    <th className={`${TABLE_CELL.head} text-left`}>{t("world.members.club")}</th>
                    <th className={`${TABLE_CELL.head} text-left`}>{t("world.members.role")}</th>
                    {owner && <th className={TABLE_CELL.head} aria-label={t("world.members.actions")} />}
                  </tr>
                </thead>
                <tbody className={TABLE_STYLE.body}>
                  {view.members.map((m) => {
                    const me = m.seatId === view.mySeatId;
                    return (
                      <tr key={m.seatId} className={`${TABLE_STYLE.row} ${me ? TABLE_STYLE.rowHighlight : ""}`}>
                        <td className={TABLE_CELL.body}>
                          <div className="flex items-center gap-3 min-w-0">
                            <ManagerFaceImage
                              manager={{ id: seatManagerId(m.seatId), name: m.managerName, face: m.face, nationality: managerFaceCountry(m.nationalityIso) }}
                              clubColors={m.clubColors}
                              size={32}
                            />
                            <div className="min-w-0">
                              <div className={me ? TABLE_STYLE.nameHighlight : TABLE_STYLE.name}>{m.managerName}</div>
                              {m.nickname && <div className="text-sm text-muted-foreground truncate">{m.nickname}</div>}
                            </div>
                          </div>
                        </td>
                        <td className={TABLE_CELL.body}>
                          {m.unemployed ? (
                            <span className="text-sm text-muted-foreground">{t("world.members.unemployed")}</span>
                          ) : (
                            <div className="flex items-center gap-3 min-w-0">
                              <ClubLogo logoUrl={squadLogoUrl(m.clubId)} primaryColor={m.clubColors[0]} secondaryColor={m.clubColors[1]} className={TABLE_STYLE.crest} />
                              <div className="min-w-0">
                                <div className="font-semibold text-foreground truncate">{m.clubName}</div>
                                <div className="text-sm text-muted-foreground truncate">{m.leagueName}</div>
                              </div>
                            </div>
                          )}
                        </td>
                        <td className={`${TABLE_CELL.body} text-sm text-muted-foreground`}>
                          {m.role === "owner" ? t("world.members.owner") : t("world.members.member")}
                        </td>
                        {owner && (
                          <td className={`${TABLE_CELL.body} text-right`}>
                            {!me && (
                              <div className="flex items-center justify-end gap-3">
                                <Button variant="secondary" flush onClick={() => setPending({ kind: "owner", member: m })}>{t("world.members.transfer")}</Button>
                                <Button variant="danger" flush onClick={() => setPending({ kind: "remove", member: m })}>{t("world.members.remove")}</Button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <SectionTitle>{t("world.invite.title")}</SectionTitle>
            <Label htmlFor="world-invite-link">{t("world.invite.link")}</Label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                id="world-invite-link"
                readOnly
                value={link}
                className="h-10 flex-1 min-w-[280px] rounded border border-border bg-transparent px-3 text-sm text-foreground tabular-nums"
              />
              <Button onClick={() => void copyLink()}>
                <Icon name="copy" size={16} />
                {copied ? t("world.invite.copied") : t("world.invite.copy")}
              </Button>
              {owner && (
                <>
                  <Button variant="secondary" onClick={() => void run(worldApi.newCode(saveId), () => setCopied(false))} disabled={busy}>
                    <Icon name="refresh" size={16} />
                    {t("world.invite.newCode")}
                  </Button>
                  <Button variant="secondary" onClick={() => setInviteOpen(true)}>
                    <Icon name="user-plus" size={16} />
                    {t("world.invite.friends")}
                  </Button>
                </>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <SectionTitle>{t("world.deadline.title")}</SectionTitle>
            <p className="text-sm text-muted-foreground m-0">{t("world.deadline.hint")}</p>
            {owner ? (
              <OptionChips<DeadlineKey>
                value={toKey(view.deadlineHours)}
                onChange={(k) => void run(worldApi.settings(saveId, fromKey(k)))}
                disabled={busy}
                options={[
                  { key: "12", label: t("world.deadline.hours", { count: 12 }) },
                  { key: "24", label: t("world.deadline.hours", { count: 24 }) },
                  { key: "48", label: t("world.deadline.hours", { count: 48 }) },
                  { key: "none", label: t("world.deadline.none") },
                ]}
              />
            ) : (
              <p className="text-sm text-foreground m-0">
                {view.deadlineHours === null ? t("world.deadline.none") : t("world.deadline.hours", { count: view.deadlineHours })}
              </p>
            )}
          </section>

          <section className="flex flex-wrap items-center gap-3">
            {view.phase === "lobby" && owner && (
              <Button onClick={() => void start()}>{t("world.start.button")}</Button>
            )}
            {view.phase === "lobby" && !owner && (
              <p className="text-sm text-muted-foreground m-0">{t("world.start.waiting")}</p>
            )}
            {view.members.length >= 2 && (
              <Button variant="secondary" onClick={() => social.openChat(`world:${saveId}`)}>
                <Icon name="message-square" size={16} />
                {t("world.chat")}
              </Button>
            )}
            <Button variant="danger" onClick={() => setPending({ kind: "leave" })}>
              <Icon name="log-out" size={16} />
              {t("world.leave.button")}
            </Button>
          </section>

          <InviteFriendsModal
            saveId={saveId}
            open={inviteOpen}
            onClose={() => setInviteOpen(false)}
            members={view.members.map((m) => m.nickname).filter((n): n is string => !!n)}
          />
          <ConfirmDialog
            open={pending !== null}
            title={
              pending?.kind === "remove" ? t("world.members.removeConfirmTitle")
                : pending?.kind === "owner" ? t("world.members.transferConfirmTitle")
                : t("world.leave.confirmTitle")
            }
            body={
              pending?.kind === "remove" ? t("world.members.removeConfirmBody", { manager: pending.member.managerName, club: pending.member.clubName })
                : pending?.kind === "owner" ? t("world.members.transferConfirmBody", { manager: pending.member.managerName })
                : owner && view.members.length === 1 ? t("world.leave.deleteBody")
                : t("world.leave.confirmBody")
            }
            confirmLabel={
              pending?.kind === "remove" ? t("world.members.remove")
                : pending?.kind === "owner" ? t("world.members.transfer")
                : t("world.leave.button")
            }
            onConfirm={() => void confirmPending()}
            onClose={() => setPending(null)}
            busy={busy}
          />
        </>
      )}
    </ScreenContainer>
  );
}
```

`openChat` já existe no `SocialContextValue`; o ícone `message-square` já está em `Icons.tsx`.

- [ ] **Step 3: Página e rota**

`src/pages/world/index.html` (cópia do `src/pages/news/index.html`, título `FMProject - League`).

`src/pages/world/entry.tsx`:

```tsx
import { createPage } from "@/createPage";
import { Layout } from "@/GameInterface/Components/Layout";
import { WorldScreen } from "@/GameInterface/World/WorldScreen";

function WorldPage() {
  return (
    <Layout>
      <WorldScreen />
    </Layout>
  );
}

createPage(WorldPage);
```

`src/index.ts`: `import worldPage from "./pages/world/index.html";` e `"/world": worldPage,` (depois de `"/news"`).

- [ ] **Step 4: Layout e barra**

`src/GameInterface/Components/Layout.tsx`:

```tsx
import { worldRedirect } from "@/GameInterface/World/worldNav";
…
  const lobby = save?.world?.phase === "lobby";

  // A world in the lobby only shows the league screen; a solo save has none (multiplayer part 2).
  useEffect(() => {
    const target = worldRedirect(window.location.pathname, save);
    if (target) window.location.replace(target);
  }, [save]);
```

e na `TopNavigation`:

```tsx
          onAdvanceDay={lobby ? undefined : handleAdvanceDay}
          onFastForward={!lobby && canFastForward ? handleFastForward : undefined}
```

`src/GameInterface/Components/TopNavigation.tsx`: dentro do bloco do dia, logo depois do botão de report
(`{isTester && (…)}`):

```tsx
          {save?.mode === "multi" && (
            <a
              href="/world"
              title={t("nav.world")}
              aria-label={t("nav.world")}
              className="flex items-center justify-center w-9 h-9 shrink-0 rounded-md border border-border bg-card text-chart-2 hover:bg-muted/50"
            >
              <Icon name="users" size={NAV_ICON} />
            </a>
          )}
```

(`save` já vem do `useGameSave()` da barra.)

- [ ] **Step 5: Verificar e commit**

Run: `bunx tsc --noEmit` e `bun run ui:audit --hard`
Expected: só o erro antigo; sem duras (a tela nova usa `ScreenContainer`, `ScreenTitle` com `accent`, `TABLE_STYLE`).

```bash
git add src/GameInterface/World src/pages/world src/index.ts src/GameInterface/Components/Layout.tsx src/GameInterface/Components/TopNavigation.tsx
git commit -m "feat(world): tela da liga, sala de espera e ícone na barra

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 21: `/start` — selos, papel e "Sair da liga"

**Files:**
- Modify: `src/GameInterface/StartScreen.tsx`

- [ ] **Step 1: Dados**

`SaveEntry` ganha:

```ts
  role?: "owner" | "member";
  mode?: "solo" | "multi";
  world?: { phase: "lobby" | "running" };
  /** Members of a world of friends (`GET /api/saves`). */
  members?: number;
```

Imports: `import { worldApi } from "@/GameInterface/World/worldApi";`, `import { WORLD } from "@/Domain/multiplayer/worldConfig";`.

O limite conta só os mundos de dono:

```ts
  const atLimit = saves.filter((s) => s.role !== "member").length >= MAX_SAVES;
```

Carregar um mundo em `lobby` abre a liga:

```ts
  async function handleLoad(id: string) {
    setLoadingId(id);
    try {
      await loadGameSave(id);
      const save = saves.find((s) => s.id === id);
      window.location.href = save?.world?.phase === "lobby" ? "/world" : "/dashboard";
    } catch {
      setLoadingId(null);
    }
  }
```

Sair da liga (membro):

```ts
  const [pendingLeaveId, setPendingLeaveId] = useState<string | null>(null);
  const pendingLeaveSave = saves.find((s) => s.id === pendingLeaveId) ?? null;

  async function handleConfirmLeave() {
    if (!pendingLeaveId) return;
    setDeleting(true);
    try {
      const r = await worldApi.leave(pendingLeaveId);
      if (r.ok) setSaves((prev) => prev.filter((s) => s.id !== pendingLeaveId));
      setPendingLeaveId(null);
    } finally {
      setDeleting(false);
    }
  }
```

- [ ] **Step 2: Linha do save**

Na linha de metadados (depois do `save.unemployed`):

```tsx
                    {save.mode === "multi" && (
                      <span className="shrink-0 whitespace-nowrap tabular-nums text-chart-2">
                        &nbsp;· {t("startScreen.withFriends", { count: save.members ?? 1, max: WORLD.MAX_MEMBERS })}
                      </span>
                    )}
```

Logo abaixo da linha (um `div` novo, só no multi):

```tsx
                  {save.mode === "multi" && (
                    <div className="text-sm text-muted-foreground truncate">
                      {save.role === "owner" ? t("startScreen.owner") : t("startScreen.member")}
                      {save.world?.phase === "lobby" && <> · {t("startScreen.lobby")}</>}
                    </div>
                  )}
```

O botão de excluir fica só para o dono; o membro tem "Sair da liga":

```tsx
                {save.role === "member" ? (
                  <button
                    type="button"
                    onClick={() => setPendingLeaveId(save.id)}
                    disabled={loadingId !== null}
                    aria-label={t("startScreen.leave")}
                    title={t("startScreen.leave")}
                    className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded border-0 bg-transparent text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-destructive disabled:opacity-50"
                  >
                    <Icon name="log-out" size={16} />
                  </button>
                ) : (
                  /* o botão de excluir de hoje, sem mudança */
                )}
```

E um `ConfirmDialog` a mais, ao lado dos outros:

```tsx
      <ConfirmDialog
        open={pendingLeaveSave !== null}
        title={t("startScreen.leaveConfirmTitle")}
        body={pendingLeaveSave ? t("startScreen.leaveConfirmBody", { clubName: pendingLeaveSave.clubName }) : ""}
        confirmLabel={t("startScreen.leave")}
        onConfirm={handleConfirmLeave}
        onClose={() => setPendingLeaveId(null)}
        busy={deleting}
      />
```

- [ ] **Step 3: Verificar e commit**

Run: `bunx tsc --noEmit` e `bun run ui:audit --hard`
Expected: só o erro antigo; sem duras.

```bash
git add src/GameInterface/StartScreen.tsx
git commit -m "feat(world): ligas de amigos na lista de saves

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 22: i18n `world.*` e chaves soltas

**Files:**
- Modify: `src/i18n/locales/en.json`, `src/i18n/locales/pt-BR.json`
- Create: `src/i18n/world.keys.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

`src/i18n/world.keys.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import en from "@/i18n/locales/en.json";
import pt from "@/i18n/locales/pt-BR.json";

const get = (o: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o);

const ERRORS = [
  "notFound", "full", "alreadyMember", "clubTaken", "invalidManager", "invalidClub", "invalidBody", "ownerOnly",
  "transferFirst", "alreadyStarted", "notMulti", "inviteLimit", "noNickname", "useLeave", "notMember", "generic",
];

const keys = [
  "screenTitles.world.main", "screenTitles.world.accent", "nav.world", "inbox.categories.world",
  "newGame.mode.title", "newGame.mode.subtitle", "newGame.mode.solo", "newGame.mode.soloDetail", "newGame.mode.multi",
  "newGame.mode.multiDetail", "newGame.mode.next",
  "startScreen.withFriends", "startScreen.owner", "startScreen.member", "startScreen.lobby", "startScreen.leave",
  "startScreen.leaveConfirmTitle", "startScreen.leaveConfirmBody",
  "world.status.lobby", "world.status.running",
  "world.members.title", "world.members.count", "world.members.manager", "world.members.club", "world.members.role",
  "world.members.actions", "world.members.owner", "world.members.member", "world.members.unemployed",
  "world.members.transfer", "world.members.remove", "world.members.removeConfirmTitle", "world.members.removeConfirmBody",
  "world.members.transferConfirmTitle", "world.members.transferConfirmBody",
  "world.invite.title", "world.invite.link", "world.invite.copy", "world.invite.copied", "world.invite.newCode",
  "world.invite.friends", "world.invite.friendsTitle", "world.invite.send", "world.invite.sent", "world.invite.noFriends",
  "world.deadline.title", "world.deadline.hint", "world.deadline.hours_one", "world.deadline.hours_other", "world.deadline.none",
  "world.start.button", "world.start.waiting", "world.chat",
  "world.leave.button", "world.leave.confirmTitle", "world.leave.confirmBody", "world.leave.deleteBody",
  "world.join.title", "world.join.owner", "world.join.choose", "world.join.open", "world.join.toStart",
  "world.join.humanClub", "world.join.joinWith",
  "world.invites.title", "world.invites.from", "world.invites.accept", "world.invites.decline",
  ...["member_joined", "member_left", "member_removed"].flatMap((k) => [`world.inbox.${k}.subject`, `world.inbox.${k}.body`]),
  ...ERRORS.map((e) => `world.errors.${e}`),
];

describe("world i18n", () => {
  for (const [name, lang] of [["en", en], ["pt-BR", pt]] as const) for (const k of keys)
    test(`${name} ${k}`, () => expect(typeof get(lang, k)).toBe("string"));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/i18n/world.keys.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar** (todas as edições com a ferramenta Edit; lembre as vírgulas)

`newGame` (depois de `"stepOf": …`):

`en.json`:

```json
    "mode": {
      "title": "How do you want to play?",
      "subtitle": "Alone, or in a league with your friends.",
      "solo": "On my own",
      "soloDetail": "Your career, at your pace.",
      "multi": "With friends",
      "multiDetail": "Up to {{max}} managers in the same world.",
      "next": "Continue"
    },
```

`pt-BR.json`:

```json
    "mode": {
      "title": "Como você quer jogar?",
      "subtitle": "Sozinho ou numa liga com seus amigos.",
      "solo": "Sozinho",
      "soloDetail": "Sua carreira, no seu ritmo.",
      "multi": "Com amigos",
      "multiDetail": "Até {{max}} técnicos no mesmo mundo.",
      "next": "Continuar"
    },
```

`startScreen` (depois de `"unemployed": …`):

`en.json`:

```json
    "withFriends": "With friends · {{count}}/{{max}}",
    "owner": "Owner",
    "member": "Member",
    "lobby": "In the waiting room",
    "leave": "Leave the league",
    "leaveConfirmTitle": "Leave the league?",
    "leaveConfirmBody": "\"{{clubName}}\" goes back to the AI and your seat is freed.",
```

`pt-BR.json`:

```json
    "withFriends": "Com amigos · {{count}}/{{max}}",
    "owner": "Dono",
    "member": "Membro",
    "lobby": "Na sala de espera",
    "leave": "Sair da liga",
    "leaveConfirmTitle": "Sair da liga?",
    "leaveConfirmBody": "O \"{{clubName}}\" volta para a IA e a sua vaga fica livre.",
```

`nav` (qualquer posição dentro do objeto): `en` `"world": "League"`, `pt-BR` `"world": "Liga"`.

`screenTitles` (depois do bloco `"news": {…}`): `en` `"world": { "main": "Your", "accent": "League" }`,
`pt-BR` `"world": { "main": "Sua", "accent": "Liga" }`.

Bloco de topo novo `world` (antes do `}` final do arquivo, depois do bloco `news`):

`en.json`:

```json
  "world": {
    "status": { "lobby": "Waiting room", "running": "In progress" },
    "members": {
      "title": "Managers",
      "count": "{{count}} of {{max}} managers",
      "manager": "Manager",
      "club": "Club",
      "role": "Role",
      "actions": "Actions",
      "owner": "Owner",
      "member": "Member",
      "unemployed": "No club",
      "transfer": "Make owner",
      "remove": "Remove",
      "removeConfirmTitle": "Remove this manager?",
      "removeConfirmBody": "{{manager}} leaves the league and {{club}} goes back to the AI.",
      "transferConfirmTitle": "Pass the ownership?",
      "transferConfirmBody": "{{manager}} becomes the owner; you stay as a member."
    },
    "invite": {
      "title": "Invite",
      "link": "Invite link",
      "copy": "Copy",
      "copied": "Copied",
      "newCode": "New code",
      "friends": "Invite friends",
      "friendsTitle": "Invite friends",
      "send": "Invite",
      "sent": "Invited",
      "noFriends": "No friends to invite yet."
    },
    "deadline": {
      "title": "Deadline",
      "hint": "Real time each manager has to be ready before the league moves on without him.",
      "hours_one": "{{count}} h",
      "hours_other": "{{count}} h",
      "none": "No deadline"
    },
    "start": { "button": "Start the league", "waiting": "Waiting for the owner to start" },
    "chat": "League chat",
    "leave": {
      "button": "Leave the league",
      "confirmTitle": "Leave the league?",
      "confirmBody": "Your club goes back to the AI and your seat is freed.",
      "deleteBody": "You are the only manager: leaving deletes the league."
    },
    "join": {
      "title": "Join a league",
      "owner": "Owner: {{name}}",
      "choose": "Choose your club",
      "open": "Open the league",
      "toStart": "Back to the start",
      "humanClub": "Human manager",
      "joinWith": "Join with {{club}}"
    },
    "invites": {
      "title": "League invites",
      "from": "{{from}} invites you to {{name}}",
      "accept": "Accept",
      "decline": "Decline"
    },
    "inbox": {
      "member_joined": { "subject": "{{manager}} joins the league", "body": "{{manager}} takes over {{club}}." },
      "member_left": { "subject": "{{manager}} leaves the league", "body": "{{club}} goes back to the AI." },
      "member_removed": { "subject": "{{manager}} was removed from the league", "body": "{{club}} goes back to the AI." }
    },
    "errors": {
      "notFound": "This invite is not valid any more.",
      "full": "The league is full.",
      "alreadyMember": "You are already in this league.",
      "clubTaken": "Another manager took this club. Pick another one.",
      "invalidManager": "Check the manager's name, nationality and background.",
      "invalidClub": "This club is not in the league's world.",
      "invalidBody": "Something is missing in the request.",
      "ownerOnly": "Only the owner can do this.",
      "transferFirst": "Pass the ownership to another manager before leaving.",
      "alreadyStarted": "The league has already started.",
      "notMulti": "This save is not a league of friends.",
      "inviteLimit": "Too many pending invites. Wait for some answers.",
      "noNickname": "Choose a nickname in Friends first.",
      "useLeave": "To leave, use \"Leave the league\".",
      "notMember": "This manager is not in the league.",
      "generic": "Something went wrong. Try again."
    }
  }
```

`pt-BR.json`:

```json
  "world": {
    "status": { "lobby": "Sala de espera", "running": "Em andamento" },
    "members": {
      "title": "Técnicos",
      "count": "{{count}} de {{max}} técnicos",
      "manager": "Técnico",
      "club": "Clube",
      "role": "Papel",
      "actions": "Ações",
      "owner": "Dono",
      "member": "Membro",
      "unemployed": "Sem clube",
      "transfer": "Passar a posse",
      "remove": "Tirar",
      "removeConfirmTitle": "Tirar este técnico?",
      "removeConfirmBody": "{{manager}} sai da liga e o {{club}} volta para a IA.",
      "transferConfirmTitle": "Passar a posse?",
      "transferConfirmBody": "{{manager}} vira o dono; você continua como membro."
    },
    "invite": {
      "title": "Convite",
      "link": "Link de convite",
      "copy": "Copiar",
      "copied": "Copiado",
      "newCode": "Trocar código",
      "friends": "Convidar amigos",
      "friendsTitle": "Convidar amigos",
      "send": "Convidar",
      "sent": "Convidado",
      "noFriends": "Ainda não há amigos para convidar."
    },
    "deadline": {
      "title": "Prazo",
      "hint": "Tempo real que cada técnico tem para ficar pronto antes de a liga seguir sem ele.",
      "hours_one": "{{count}} h",
      "hours_other": "{{count}} h",
      "none": "Sem prazo"
    },
    "start": { "button": "Começar a liga", "waiting": "Esperando o dono começar" },
    "chat": "Chat da liga",
    "leave": {
      "button": "Sair da liga",
      "confirmTitle": "Sair da liga?",
      "confirmBody": "Seu clube volta para a IA e a sua vaga fica livre.",
      "deleteBody": "Você é o único técnico: sair apaga a liga."
    },
    "join": {
      "title": "Entrar na liga",
      "owner": "Dono: {{name}}",
      "choose": "Escolher o clube",
      "open": "Abrir a liga",
      "toStart": "Voltar ao início",
      "humanClub": "Técnico humano",
      "joinWith": "Entrar com o {{club}}"
    },
    "invites": {
      "title": "Convites para ligas",
      "from": "{{from}} convida você para {{name}}",
      "accept": "Aceitar",
      "decline": "Recusar"
    },
    "inbox": {
      "member_joined": { "subject": "{{manager}} entra na liga", "body": "{{manager}} assume o {{club}}." },
      "member_left": { "subject": "{{manager}} sai da liga", "body": "O {{club}} volta para a IA." },
      "member_removed": { "subject": "{{manager}} foi tirado da liga", "body": "O {{club}} volta para a IA." }
    },
    "errors": {
      "notFound": "Este convite não vale mais.",
      "full": "A liga está cheia.",
      "alreadyMember": "Você já está nesta liga.",
      "clubTaken": "Outro técnico pegou este clube. Escolha outro.",
      "invalidManager": "Confira o nome, a nacionalidade e a origem do técnico.",
      "invalidClub": "Este clube não está no mundo da liga.",
      "invalidBody": "Falta alguma coisa no pedido.",
      "ownerOnly": "Só o dono pode fazer isso.",
      "transferFirst": "Passe a posse para outro técnico antes de sair.",
      "alreadyStarted": "A liga já começou.",
      "notMulti": "Este save não é uma liga de amigos.",
      "inviteLimit": "Convites pendentes demais. Espere algumas respostas.",
      "noNickname": "Escolha um apelido em Amigos primeiro.",
      "useLeave": "Para sair, use \"Sair da liga\".",
      "notMember": "Este técnico não está na liga.",
      "generic": "Algo deu errado. Tente de novo."
    }
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/i18n`
Expected: PASS (inclui `news.keys`, `social.keys`, `press.keys` e o novo `world.keys`). Confirme também que os JSON
continuam válidos: `bun -e "JSON.parse(require('fs').readFileSync('src/i18n/locales/en.json','utf8'));JSON.parse(require('fs').readFileSync('src/i18n/locales/pt-BR.json','utf8'))"`.

- [ ] **Step 5: Commit**

```bash
git add src/i18n
git commit -m "feat(world): textos da liga de amigos (en, pt-BR)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 23: Regra do projeto e verificação final

**Files:**
- Modify: `.claude/rules/game/multiplayer.md`

- [ ] **Step 1: Regra** — no fim de `.claude/rules/game/multiplayer.md`, uma seção nova:

```markdown
## Parte 2: liga de amigos

Spec: `docs/superpowers/specs/2026-10-15-multiplayer-world-design.md`. Plano:
`docs/superpowers/plans/2026-10-15-multiplayer-world.md`. Sai junto com a parte 3 (avanço em grupo).

### Regra

- A liga nasce no novo jogo ("Com amigos", `POST /api/saves` com `mode: "multi"`): o mundo do dono em `lobby`, sem
  `/presimulate`. `SaveMeta.world = { phase, inviteCode, deadlineHours, createdBy }`; o solo não tem `world`.
- **`lobby`:** o dia não avança (`advance-day` e `advance-until` 409 `lobby`; `/presimulate` 409 `useWorldStart`);
  toda tela do jogo redireciona para `/world` (`worldRedirect`). **`running`:** depois de "Começar"
  (`POST /api/worlds/:saveId/start`: dono, uma vez, `presimulateWorld` + `world_started`). Entrar continua possível.
- Até 8 técnicos (`WORLD.MAX_MEMBERS`, conferido dentro do lock do `addSeat`). Limite de saves: 5 mundos como dono.
- **Convite:** link `/join/<código>` (10 caracteres base32 sem 0/1/I/O, `world_codes`; trocar o código derruba o
  link antigo) e pela lista de amigos (`world_invites`, só amigos do dono, até 20 pendentes, evento `world_invite`,
  "Convites para ligas" no painel de Amigos). O login volta para a página pedida (`?next=`, `safeNextPath`).
- **Entrar** (`POST /api/worlds/join`): o assistente do novo jogo no modo "entrar" (clubes humanos desabilitados),
  `addSeat` como membro; erros 404 código, 409 `full` / `alreadyMember` / `clubTaken`, 400 técnico ou clube.
- **Sair / tirar** (`removeSeat`): o clube volta à IA como numa demissão (`releaseHumanClub`, interino e vaga), o
  técnico fica no ranking como livre (`left: "left_world"`, aparece no escopo "Livres"), uma seleção que ele treina
  ganha interino, a pasta do assento e a linha de `save_members` somem. O removido recebe `world_removed`.
- **Posse:** `POST /api/worlds/:saveId/owner` troca os papéis. O dono só sai depois de passar a posse (409
  `transferFirst`); sozinho, sair apaga o mundo. Apagar avisa os membros (`world_deleted`).
- Entrada e saída viram mensagem na caixa dos outros assentos (categoria `world`, tópico `competitions`) e notícia
  `world_member` (importância 3); a tela recarrega com `world_members`.

### Rotas (`src/backend/worlds/worldRoutes.ts`)

| Rota | Quem | Faz |
|---|---|---|
| `GET /api/worlds/by-code/:code` | logado | `{ saveId, name, owner, members, max, phase, takenClubs }`; 404, 409 `full` / `alreadyMember` (com `saveId`) |
| `POST /api/worlds/join { code, clubId, manager, sackingEnabled }` | logado | entra; 201 `{ saveId, seatId, phase }` |
| `GET /api/worlds/invites` · `DELETE /api/worlds/invites/:saveId` | logado | convites recebidos; recusar |
| `GET /api/worlds/:saveId` | membro | `WorldView` (membros, código, prazo, papel) |
| `POST /api/worlds/:saveId/invite-code` | dono | código novo |
| `PUT /api/worlds/:saveId/settings { deadlineHours }` | dono | 12 / 24 / 48 / `null` (usado pela parte 3) |
| `POST /api/worlds/:saveId/invites { nickname }` | dono | convite a um amigo (404 se não é amigo) |
| `POST /api/worlds/:saveId/start` | dono | começa (409 `alreadyStarted`) |
| `POST /api/worlds/:saveId/members/:seatId/remove` | dono | tira (400 `useLeave` para si) |
| `POST /api/worlds/:saveId/leave` | membro | sai; o dono: 409 `transferFirst`, ou apaga sozinho |
| `POST /api/worlds/:saveId/owner { seatId }` | dono | passa a posse |

### Telas

- Novo jogo: passo "Sozinho / Com amigos". `/join/:code`: a liga e o assistente no modo entrar.
- `/world` ("SUA **LIGA**"): membros (rosto, técnico, apelido, clube, papel; dono: passar a posse, tirar), convite
  (link, copiar, trocar código, convidar amigos), prazo (`OptionChips`), Começar / "Esperando o dono começar",
  "Chat da liga" (`world:<saveId>`), "Sair da liga". Ícone de liga na barra superior só no multi.
- `/start`: "Com amigos · N/8", papel, "Na sala de espera"; o membro tem "Sair da liga" no lugar de excluir.

### Testes

```
bun test src/Domain/multiplayer src/backend/worlds src/backend/seats.addSeat.test.ts src/backend/seats.removeSeat.test.ts \
  src/backend/dal/seats.dal.test.ts src/backend/auth/saveMembers.test.ts src/backend/db.world.test.ts \
  src/GameInterface/World src/GameInterface/authRedirect.test.ts src/GameInterface/Social src/i18n
```

### Limitações (parte 2)

- Convites pela lista só para amigos do dono; os convites ficam só no SQLite (o código continua valendo sem eles).
- Sem reserva de assento nem troca de clube de um membro (sair e entrar de novo).
- Quem sai perde os empréstimos ativos do clube registrados no mercado do assento (`market.loans`): os jogadores
  cedidos voltam só pela virada do país do clube que os tem.
- Notícias e mensagens de entrada/saída são escritas fora do avanço do dia (na rota), com a data do mundo.
```

E no topo do arquivo, na lista "Regra", troque a frase "Convites e a tela do mundo são a parte 2." por
"Convites e a tela do mundo: seção \"Parte 2: liga de amigos\"."

- [ ] **Step 2: Verificação**

Run (um de cada vez):

```bash
bunx tsc --noEmit
bun run ui:audit --hard
bun test src/Domain/multiplayer src/backend/worlds src/backend/seats.addSeat.test.ts src/backend/seats.removeSeat.test.ts src/backend/dal src/backend/auth src/backend/db.world.test.ts src/backend/db.social.test.ts src/GameInterface src/i18n src/lab/labAppRoutes.test.ts src/backend/seats.review.test.ts src/backend/saves.seat.routes.test.ts src/backend/managers.routes.test.ts src/backend/social src/Domain/inbox src/Domain/jobs
```

Expected: `tsc` só com o erro antigo em `src/GameEngine/Domain/DecisionTree.ts:750`; `ui:audit --hard` sem violações;
todos os testes verdes.

Roteiro manual (navegador, `DEV_AUTO_LOGIN=1 bun run dev` a partir de `C:\Projects\FMProject-mpw` com a caixa real do
caminho; `.claude/rules/dev-login.md`):
1. Aba 1 `http://localhost:3000/api/auth/dev-login` → Novo jogo → "Com amigos" → técnico → clube → cai em `/world`
   em "Sala de espera"; `/dashboard` redireciona para `/world`.
2. Copiar o link; aba 2 `http://127.0.0.1:3000/api/auth/dev-login?as=2`, abrir o link → card da liga → "Escolher o
   clube" → o clube do dono aparece desabilitado ("Técnico humano") → entra e cai em `/world`; a aba 1 recarrega a lista.
3. Aba 1: "Começar a liga" → carregamento → Painel; a aba 2 vai sozinha para o Painel.
4. Aba 2: ícone de liga na barra → "Sair da liga" → volta ao `/start`; aba 1 recebe a mensagem na caixa e a notícia.

- [ ] **Step 3: Commit**

```bash
git add .claude/rules/game/multiplayer.md
git commit -m "docs(world): regra da parte 2 (liga de amigos)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Autorrevisão

**Cobertura da spec:**
- §1 Estados: Tarefa 1 (`WorldState`), 11 (criação em `lobby`), 12 (o dia não avança em `lobby`), 14 (`start` → `running`), 13/15 (entrada em `running`).
- §2 Criação: Tarefas 11 e 18 (passo "Sozinho / Com amigos", `mode: "multi"`, sem `/presimulate`, vai para `/world`), 21 (limite conta só os de dono).
- §3 Convite e entrada: Tarefas 2 (`world_codes`, `world_invites`), 13 (`by-code`, `join`, trocar código, teto dentro do lock, corrida), 14 (convite por amigo, 20 pendentes, evento), 16 (login volta para `/join`), 17 (convites no painel), 18–19 (seletor com clubes humanos desabilitados).
- §4 Lobby e início: Tarefas 12 e 14 (`start`), 20 (tela, prazo, convite, chat, Começar, "Esperando", redirecionamento), 17 (`world_started` leva os membros ao Painel).
- §5 Gestão: Tarefas 3, 4, 5, 8 (`removeSeat`, `left_world`, livre no ranking), 7 e 10 (mensagem e notícia), 14 (tirar, sair, posse, dono sair 409/apagar), 11 (apagar avisa).
- §6 Lista de saves e telas: Tarefa 21; ícone na barra: Tarefa 20; i18n: Tarefa 22.
- §7 Socket: Tarefas 9, 10, 13, 14, 17.
- §8 Dados: Tarefas 1, 2.
- §9 Testes: Tarefas 11–15 (rotas e fluxo), 17 (redirecionamento puro), e os testes unitários de cada tarefa.
- §10 Limitações: Tarefa 23.

**Tipos coerentes entre tarefas:** `WorldState`/`WorldView`/`WorldByCode`/`WorldInviteView`/`WorldErrorCode`
(Tarefa 1) usados nas Tarefas 10, 13, 14, 17, 19, 20; `MemberChange` (Tarefa 7) em 10 e 14; `SeatError`/`SeatErrorCode`
(6) em 8 e 13; `RemovedSeat` (8) em 14; `notifyWorld` (9) em 10, 13, 14; `presimulateWorld` (12) em 14; `worldApi`/
`WorldApiError` (17) em 18–21; `forgetSession` (17) em 17 e 20; `WORLD` (1) em 13, 14, 18, 21.
