# Amigos e chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Etapa 44 (#153), versão **4.24**: apelido único e código de amigo, pedidos de amizade, bloqueio, status
online / offline / "jogando" com o clube, conversas diretas entre amigos em janelas acima da barra inferior (estilo
Steam), histórico de 90 dias, e a sala por mundo (`world:<saveId>`) pronta para quando o multiplayer existir. Spec:
`docs/superpowers/specs/2026-10-14-friends-chat-design.md`.

**Architecture:** regras puras em `src/Domain/social/` (apelido, código, salas, corpo da mensagem, limite de envio);
esquema SQLite acrescentado em `src/backend/db.ts` (`migrateSocialSchema`, só `CREATE ... IF NOT EXISTS` e
`ALTER TABLE ADD COLUMN` quando a coluna falta); consultas em `src/backend/social/socialStore.ts`; tradução de
`dm:<apelido>` / `world:<saveId>` para a sala interna em `roomAccess.ts`; rotas HTTP em `socialRoutes.ts` (todo envio
é por HTTP); entrega em tempo real por WebSocket em `realtime.ts` (`/api/ws`, conexões por usuário em memória,
presença reaproveitando `src/backend/presence.ts`). No cliente, `SocialProvider` (contexto React no `Layout`) guarda o
estado, o socket e as janelas (`sessionStorage`); `FriendsButton` na `StatusBar`, `FriendsPanel` e `ChatDock` /
`ChatWindow` desenhados por cima do conteúdo, sem mudar a moldura das telas. Nenhuma resposta e nenhum evento leva
e-mail ou id de usuário: o cliente só vê apelidos.

**Tech Stack:** Bun 1.4 (`Bun.serve` com `routes` + `fetch` + `websocket`, `bun:sqlite`, `bun test`), TypeScript,
React 19, Tailwind v4, i18next.

## Convenções do repositório

- Imports sempre `@/…` (alias de `src/`), nunca relativos.
- Todo texto de tela em i18n, `en` e `pt-BR` (`src/i18n/locales/*.json`), chaves em `social.*`.
- Ícones só via `src/GameInterface/Icons.tsx`.
- Visual pelo `.claude/rules/ui-standard.md`: nenhum texto abaixo de 13px (13px só em rótulo `font-display`
  uppercase), botões pelo `<Button>`, abas pelo `<SegmentedTabs>`, `bun run ui:audit` limpo (0 duras, 0 leves) nos
  arquivos novos.
- Commits terminam com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (o comando de cada tarefa já
  traz). Nunca commitar `src/Data` (runtime, gitignored).
- `package.json` sem BOM: editar com a ferramenta Edit (nunca `Set-Content` do PowerShell).
- Testes usam o banco temporário do preload (`scripts/testPreload.ts`): imports estáticos de `@/backend/db` bastam.
  Use e-mails e apelidos aleatórios (o banco é compartilhado pela execução inteira).
- Suíte em partes (memória): nunca `bun test` inteiro de uma vez nesta máquina; ver Tarefa 21.

**Setup do worktree** (uma vez, antes da Tarefa 1):

```bash
cd C:/Projects/FMProject-chat
bun install --frozen-lockfile && mkdir -p src/Data && cp -R src/example_data/. src/Data/
```

## Mapa de arquivos

| Arquivo | Ação | Papel |
|---|---|---|
| `src/Domain/social/socialConfig.ts` | criar | Todas as constantes (`SOCIAL`, `DAY_MS`) |
| `src/Domain/social/nickname.ts` (+ teste) | criar | Validação do apelido, palavras reservadas, prazo de troca, código de amigo |
| `src/Domain/social/rooms.ts` (+ teste) | criar | Id interno da sala DM/mundo, parse do id e do parâmetro de URL, regras de acesso puras |
| `src/Domain/social/message.ts` (+ teste) | criar | Limpeza do corpo da mensagem, limite 10/10 s, corte de 90 dias |
| `src/types/socialTypes.ts` | criar | Tipos compartilhados (respostas, eventos do socket, códigos de erro) |
| `src/backend/db.ts` (+ `db.social.test.ts`) | modificar | `migrateSocialSchema`: colunas e tabelas novas, nada apagado |
| `src/backend/social/socialStore.ts` (+ 3 testes) | criar | Consultas SQLite |
| `src/backend/social/socialTestUtils.ts` | criar | `makeUser`, `uniqueNick` (só testes) |
| `src/backend/social/roomAccess.ts` (+ teste) | criar | Parâmetro de sala → sala interna, quem escreve, nome da sala por usuário, destinatários |
| `src/backend/presence.ts` | modificar | `lastSeenAt`, `isPresent` |
| `src/backend/social/realtime.ts` (+ teste) | criar | Conexões por usuário, presença, entrega, `hello`/`ping`/`typing`, upgrade |
| `src/backend/social/socialRoutes.ts` (+ 2 testes) | criar | Rotas da seção 4 da spec |
| `src/backend/social/socialRouteTestUtils.ts` | criar | `callSocial` (só testes) |
| `src/backend/social/maintenance.ts` | criar | Limpeza diária de 90 dias e varredura de presença |
| `src/backend/social/realtime.server.test.ts` | criar | Dois sockets reais num `Bun.serve` de teste |
| `src/backend/routes.ts` | modificar | `...socialRoutes` em `apiRoutes` |
| `src/index.ts` | modificar | `fetch` com o upgrade de `/api/ws`, `websocket`, manutenção |
| `src/backend/auth/routes.ts` (+ `devLogin.test.ts`) | modificar | `?as=<alias>` no dev-login (segundo usuário só em desenvolvimento) |
| `src/GameInterface/Social/socialApi.ts` | criar | Chamadas HTTP tipadas |
| `src/GameInterface/Social/socialState.ts` (+ teste) | criar | Puro: grupos de amigos, contagens, mescla de mensagens, parse de eventos |
| `src/GameInterface/Social/chatDock.ts` (+ teste) | criar | Puro: janelas abertas/minimizadas e `sessionStorage` |
| `src/GameInterface/Social/useSocial.tsx` | criar | `SocialProvider`, `useSocial`, socket com reconexão |
| `src/GameInterface/Social/FriendsButton.tsx` | criar | Botão "Amigos · N" com selo de não lidas |
| `src/GameInterface/Social/FriendsPanel.tsx` | criar | Painel (apelido, código, abas Amigos/Pedidos/Adicionar, bloqueados) |
| `src/GameInterface/Social/ChatDock.tsx` | criar | Janelas abertas + abas minimizadas |
| `src/GameInterface/Social/ChatWindow.tsx` | criar | Uma conversa |
| `src/GameInterface/Components/StatusBar.tsx` | modificar | Botão Amigos, contagem online pelo socket |
| `src/GameInterface/usePresence.ts` | modificar | `skip` quando o socket já pinga |
| `src/GameInterface/Components/Layout.tsx` | modificar | `SocialProvider`, painel e janelas |
| `src/GameInterface/Icons.tsx` | modificar | `users`, `ban`, `more` |
| `src/i18n/locales/en.json`, `pt-BR.json` (+ `src/i18n/social.keys.test.ts`) | modificar | `social.*` |
| `.claude/rules/social.md` | criar | Regra da etapa |
| `.claude/rules/project-structure.md`, `.claude/rules/dev-login.md` | modificar | Contrato do WebSocket; `?as=` |
| `src/GameInterface/changelog/changelog.ts`, `package.json` | modificar | 4.24; tirar "Chat e amigos" de `upcoming` |
| `docs/ROADMAP.md` | modificar | Etapa 44 ✅ |

---

## Tarefa 1: Constantes, tipos, apelido e código de amigo

**Arquivos:**
- Criar: `src/Domain/social/socialConfig.ts`
- Criar: `src/types/socialTypes.ts`
- Criar: `src/Domain/social/nickname.ts`
- Teste: `src/Domain/social/nickname.test.ts`

- [ ] **Passo 1: criar as constantes**

`src/Domain/social/socialConfig.ts`:

```ts
/** Every constant of friends and chat (`.claude/rules/social.md`). */
export const SOCIAL = {
  NICKNAME_MIN: 3,
  NICKNAME_MAX: 20,
  /** A nickname can be changed once every 30 days. */
  NICKNAME_CHANGE_DAYS: 30,
  MAX_FRIENDS: 200,
  MAX_PENDING_OUT: 50,
  SEARCH_MIN: 3,
  SEARCH_LIMIT: 20,
  MESSAGE_MAX: 500,
  /** At most RATE_MAX messages per RATE_WINDOW_MS per user (429 past that). */
  RATE_WINDOW_MS: 10_000,
  RATE_MAX: 10,
  /** Messages older than this are deleted by the daily cleanup. */
  HISTORY_DAYS: 90,
  /** History page size (and the largest `limit` accepted). */
  PAGE_SIZE: 50,
  /** A world room exists only with at least this many members. */
  WORLD_MIN_MEMBERS: 2,
  /** Client ping over the socket while the page is visible. */
  PING_MS: 60_000,
  /** Chat windows open at once; the others are minimized. */
  MAX_OPEN_CHATS: 3,
  /** "is typing" shows for this long after the last typing event. */
  TYPING_SHOW_MS: 4_000,
  /** A client sends at most one typing event per room per this interval. */
  TYPING_THROTTLE_MS: 3_000,
} as const;

export const DAY_MS = 86_400_000;
```

- [ ] **Passo 2: criar os tipos compartilhados**

`src/types/socialTypes.ts`:

```ts
// Shapes shared by the social routes, the socket and the screens. Nothing here carries an e-mail or a
// user id: the client only ever sees nicknames (`.claude/rules/social.md`).

export type FriendStatus = "online" | "offline" | "playing";

/** How a searched manager relates to the one searching. */
export type Relation = "friend" | "pending_out" | "pending_in" | "none";

export interface SocialMe {
  nickname: string | null;
  friendCode: string;
  /** ISO date (YYYY-MM-DD) from which the nickname can be changed again; null when it can be changed now. */
  nicknameChangeableOn: string | null;
}

export interface FriendView {
  nickname: string;
  status: FriendStatus;
  /** Club of the save open right now, only with status "playing". */
  club: string | null;
  unread: number;
  since: number;
}

export interface RequestView {
  nickname: string;
  at: number;
}

export interface WorldRoomView {
  /** Room as the client names it: `world:<saveId>`. */
  room: string;
  saveId: string;
  name: string;
  unread: number;
}

export interface FriendsResponse {
  friends: FriendView[];
  incoming: RequestView[];
  outgoing: RequestView[];
  worlds: WorldRoomView[];
}

export interface SearchResult {
  nickname: string;
  relation: Relation;
}

export interface ChatMessageView {
  id: number;
  /** Sender's nickname. */
  from: string;
  mine: boolean;
  body: string;
  at: number;
}

export interface MessagesResponse {
  room: string;
  messages: ChatMessageView[];
  hasMore: boolean;
}

export type ClientEvent =
  | { type: "hello"; saveId: string | null }
  | { type: "ping" }
  | { type: "typing"; room: string };

export type ServerEvent =
  | { type: "message"; room: string; message: ChatMessageView }
  | { type: "presence"; nickname: string; status: FriendStatus; club: string | null }
  | { type: "friend_request"; from: string }
  | { type: "friend_update" }
  | { type: "read"; room: string; lastReadId: number }
  | { type: "typing"; room: string; from: string }
  | { type: "pong"; online: number };

export type SocialErrorCode =
  | "invalidNickname"
  | "nicknameTaken"
  | "tooSoon"
  | "noNickname"
  | "invalidQuery"
  | "notFound"
  | "alreadyFriends"
  | "limit"
  | "invalidBody"
  | "noAccess"
  | "rateLimited"
  | "unauthorized"
  | "network";
```

- [ ] **Passo 3: escrever o teste que falha**

`src/Domain/social/nickname.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  FRIEND_CODE_ALPHABET,
  generateFriendCode,
  nicknameChangeableAt,
  nicknameKey,
  normalizeFriendCode,
  validateNickname,
} from "@/Domain/social/nickname";
import { DAY_MS } from "@/Domain/social/socialConfig";

describe("validateNickname", () => {
  test("accepts 3–20 letters, digits, _ . - (trimmed)", () => {
    for (const n of ["abc", "Ze_Carlos", "a.b-c", "x".repeat(20), "  Tom99  "]) expect(validateNickname(n)).toBeNull();
  });
  test("rejects the wrong length", () => {
    for (const n of ["", "ab", "  ab  ", "x".repeat(21)]) expect(validateNickname(n)).toBe("length");
  });
  test("rejects other characters", () => {
    for (const n of ["ab c", "joão", "a@b", "<b>hi</b>"]) expect(validateNickname(n)).toBe("chars");
  });
  test("rejects reserved words in any case, also inside the name", () => {
    for (const n of ["admin", "ADMIN", "SuperAdmin", "fmproject", "FM_westlab", "Moderator", "root", "Suporte"]) {
      expect(validateNickname(n)).toBe("reserved");
    }
  });
});

test("nicknameKey ignores case and spaces around", () => {
  expect(nicknameKey("  ZeCarlos ")).toBe("zecarlos");
});

test("nicknameChangeableAt is 30 days after the last change", () => {
  expect(nicknameChangeableAt(null)).toBeNull();
  expect(nicknameChangeableAt(1_000)).toBe(1_000 + 30 * DAY_MS);
});

describe("friend code", () => {
  test("FM-XXXX-XXXX with no ambiguous characters", () => {
    let i = 0;
    const code = generateFriendCode((n) => (i++ * 7) % n);
    expect(code).toMatch(/^FM-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
    expect(FRIEND_CODE_ALPHABET).toHaveLength(32);
    expect(FRIEND_CODE_ALPHABET).not.toMatch(/[01IO]/);
  });
  test("normalizes what people type", () => {
    for (const raw of ["fm-abcd-efgh", "FM ABCD EFGH", "abcdefgh", "FMABCDEFGH", " fm-ABCD-efgh "]) {
      expect(normalizeFriendCode(raw)).toBe("FM-ABCD-EFGH");
    }
  });
  test("rejects wrong codes", () => {
    for (const raw of ["FM-ABCD-EFG", "FM-ABCD-EFG0", "FM-ABCD-EFGI", "", "hello"]) {
      expect(normalizeFriendCode(raw)).toBeNull();
    }
  });
});
```

- [ ] **Passo 4: rodar e ver falhar**

Run: `bun test src/Domain/social/nickname.test.ts`
Expected: FAIL — `Cannot find module '@/Domain/social/nickname'`.

- [ ] **Passo 5: implementar**

`src/Domain/social/nickname.ts`:

```ts
import { DAY_MS, SOCIAL } from "@/Domain/social/socialConfig";

const NICKNAME_RE = /^[A-Za-z0-9_.-]+$/;
/** Whole names that are not allowed. */
const RESERVED_EXACT = ["mod", "root", "system", "sistema", "support", "suporte", "staff", "null", "undefined"];
/** Names that may not appear anywhere inside a nickname. */
const RESERVED_PARTS = ["admin", "fmproject", "westlab", "moderator", "moderador"];

export type NicknameError = "length" | "chars" | "reserved";

export function normalizeNickname(raw: string): string {
  return raw.trim();
}

/** Uniqueness key: nicknames are unique ignoring case. */
export function nicknameKey(raw: string): string {
  return normalizeNickname(raw).toLowerCase();
}

export function validateNickname(raw: string): NicknameError | null {
  const n = normalizeNickname(raw);
  if (n.length < SOCIAL.NICKNAME_MIN || n.length > SOCIAL.NICKNAME_MAX) return "length";
  if (!NICKNAME_RE.test(n)) return "chars";
  const k = n.toLowerCase();
  if (RESERVED_EXACT.includes(k) || RESERVED_PARTS.some((p) => k.includes(p))) return "reserved";
  return null;
}

/** When the nickname can be changed again (ms), or null when it was never changed. */
export function nicknameChangeableAt(changedAt: number | null): number | null {
  return changedAt === null ? null : changedAt + SOCIAL.NICKNAME_CHANGE_DAYS * DAY_MS;
}

/** Base32 with no 0, 1, I or O (easy to read aloud and type). */
export const FRIEND_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** `FM-XXXX-XXXX`; `pick(n)` returns an integer in [0, n) (crypto `randomInt` on the server). */
export function generateFriendCode(pick: (n: number) => number): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += FRIEND_CODE_ALPHABET[pick(FRIEND_CODE_ALPHABET.length) % FRIEND_CODE_ALPHABET.length];
  return `FM-${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Canonical code from what a person typed (any case, spaces or dashes, with or without "FM"), or null. */
export function normalizeFriendCode(raw: string): string | null {
  const compact = raw.toUpperCase().replace(/[\s-]/g, "");
  const body = compact.length === 10 && compact.startsWith("FM") ? compact.slice(2) : compact;
  if (body.length !== 8) return null;
  for (const c of body) if (!FRIEND_CODE_ALPHABET.includes(c)) return null;
  return `FM-${body.slice(0, 4)}-${body.slice(4)}`;
}
```

- [ ] **Passo 6: rodar e passar**

Run: `bun test src/Domain/social/nickname.test.ts`
Expected: PASS (9 testes).

- [ ] **Passo 7: commit**

```bash
git add src/Domain/social/socialConfig.ts src/types/socialTypes.ts src/Domain/social/nickname.ts src/Domain/social/nickname.test.ts
git commit -m "feat(social): apelido, código de amigo e tipos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 2: Salas e mensagens (puro)

**Arquivos:**
- Criar: `src/Domain/social/rooms.ts`, `src/Domain/social/message.ts`
- Teste: `src/Domain/social/rooms.test.ts`, `src/Domain/social/message.test.ts`

- [ ] **Passo 1: escrever os testes que falham**

`src/Domain/social/rooms.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  canUseWorld,
  canWriteDm,
  dmPartner,
  dmRoomId,
  dmRoomParam,
  parseRoomId,
  parseRoomParam,
  worldRoomId,
  worldRoomParam,
} from "@/Domain/social/rooms";

const SAVE = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("dmRoomId", () => {
  test("the same id from both sides", () => {
    expect(dmRoomId("b-user", "a-user")).toBe("dm:a-user:b-user");
    expect(dmRoomId("a-user", "b-user")).toBe("dm:a-user:b-user");
  });
  test("needs two different users", () => {
    expect(() => dmRoomId("a", "a")).toThrow();
  });
});

describe("parseRoomId", () => {
  test("round trip", () => {
    expect(parseRoomId(dmRoomId("x1", "y2"))).toEqual({ kind: "dm", a: "x1", b: "y2" });
    expect(parseRoomId(worldRoomId(SAVE))).toEqual({ kind: "world", saveId: SAVE });
  });
  test("rejects malformed ids", () => {
    for (const id of ["dm:a", "dm:b:a", "dm:a:a", "dm:a:b:c", "world:x", "chat:x", ""]) expect(parseRoomId(id)).toBeNull();
  });
});

describe("parseRoomParam", () => {
  test("dm by nickname and world by save id", () => {
    expect(parseRoomParam(dmRoomParam("Ze_Carlos"))).toEqual({ kind: "dm", nickname: "Ze_Carlos" });
    expect(parseRoomParam(worldRoomParam(SAVE))).toEqual({ kind: "world", saveId: SAVE });
  });
  test("rejects bad params", () => {
    for (const p of ["dm:ab", "dm:a b c", `dm:${"x".repeat(21)}`, "world:abc", "dm:", "x:y"]) expect(parseRoomParam(p)).toBeNull();
  });
});

test("dmPartner returns the other side, or null for an outsider", () => {
  const room = parseRoomId(dmRoomId("u1", "u2"))!;
  expect(dmPartner(room, "u1")).toBe("u2");
  expect(dmPartner(room, "u2")).toBe("u1");
  expect(dmPartner(room, "u3")).toBeNull();
});

test("a DM is written only between friends with no block", () => {
  expect(canWriteDm({ friends: true, blocked: false })).toBe(true);
  expect(canWriteDm({ friends: false, blocked: false })).toBe(false);
  expect(canWriteDm({ friends: true, blocked: true })).toBe(false);
});

test("a world room needs membership and at least two members", () => {
  expect(canUseWorld({ member: true, memberCount: 2 })).toBe(true);
  expect(canUseWorld({ member: true, memberCount: 1 })).toBe(false);
  expect(canUseWorld({ member: false, memberCount: 3 })).toBe(false);
});
```

`src/Domain/social/message.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { cleanMessageBody, messageCutoff, rateLimit } from "@/Domain/social/message";
import { DAY_MS, SOCIAL } from "@/Domain/social/socialConfig";

describe("cleanMessageBody", () => {
  test("trims, normalizes line breaks and drops control characters", () => {
    expect(cleanMessageBody("  oi\r\ntudo bem?\u0007  ")).toBe("oi\ntudo bem?");
  });
  test("keeps HTML as plain text", () => {
    expect(cleanMessageBody("<b>oi</b>")).toBe("<b>oi</b>");
  });
  test("rejects empty, too long and non-strings", () => {
    expect(cleanMessageBody("   ")).toBeNull();
    expect(cleanMessageBody("x".repeat(SOCIAL.MESSAGE_MAX + 1))).toBeNull();
    expect(cleanMessageBody(42)).toBeNull();
    expect(cleanMessageBody("x".repeat(SOCIAL.MESSAGE_MAX))).toHaveLength(SOCIAL.MESSAGE_MAX);
  });
});

describe("rateLimit", () => {
  test("allows 10 in 10 s, then refuses, then frees the window", () => {
    let stamps: number[] = [];
    for (let i = 0; i < SOCIAL.RATE_MAX; i++) {
      const r = rateLimit(stamps, 1_000 + i);
      expect(r.allowed).toBe(true);
      stamps = r.stamps;
    }
    expect(rateLimit(stamps, 1_500).allowed).toBe(false);
    expect(rateLimit(stamps, 1_000 + SOCIAL.RATE_WINDOW_MS).allowed).toBe(true);
  });
});

test("messageCutoff is 90 days before now", () => {
  expect(messageCutoff(100 * DAY_MS)).toBe(10 * DAY_MS);
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `bun test src/Domain/social/rooms.test.ts src/Domain/social/message.test.ts`
Expected: FAIL — módulos não encontrados.

- [ ] **Passo 3: implementar**

`src/Domain/social/rooms.ts`:

```ts
import { SOCIAL } from "@/Domain/social/socialConfig";

// Internal room ids (stored in chat_messages): `dm:<userA>:<userB>` (ids in order) and `world:<saveId>`.
// The client never sees user ids: in URLs and events a DM is `dm:<other's nickname>`.

export type ParsedRoomId = { kind: "dm"; a: string; b: string } | { kind: "world"; saveId: string };
export type RoomParam = { kind: "dm"; nickname: string } | { kind: "world"; saveId: string };

const SAVE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NICK_PARAM_RE = new RegExp(`^[A-Za-z0-9_.-]{${SOCIAL.NICKNAME_MIN},${SOCIAL.NICKNAME_MAX}}$`);

export function isSaveIdShape(s: string): boolean {
  return SAVE_ID_RE.test(s);
}

export function dmRoomId(a: string, b: string): string {
  if (a === b) throw new Error("a direct message needs two different users");
  return a < b ? `dm:${a}:${b}` : `dm:${b}:${a}`;
}

export function worldRoomId(saveId: string): string {
  return `world:${saveId}`;
}

export function parseRoomId(id: string): ParsedRoomId | null {
  if (id.startsWith("dm:")) {
    const parts = id.slice(3).split(":");
    if (parts.length !== 2) return null;
    const [a, b] = parts as [string, string];
    if (!a || !b || a >= b) return null;
    return { kind: "dm", a, b };
  }
  if (id.startsWith("world:")) {
    const saveId = id.slice(6);
    return isSaveIdShape(saveId) ? { kind: "world", saveId } : null;
  }
  return null;
}

export function dmRoomParam(nickname: string): string {
  return `dm:${nickname}`;
}

export function worldRoomParam(saveId: string): string {
  return `world:${saveId}`;
}

export function parseRoomParam(raw: string): RoomParam | null {
  if (raw.startsWith("dm:")) {
    const nickname = raw.slice(3);
    return NICK_PARAM_RE.test(nickname) ? { kind: "dm", nickname } : null;
  }
  if (raw.startsWith("world:")) {
    const saveId = raw.slice(6);
    return isSaveIdShape(saveId) ? { kind: "world", saveId } : null;
  }
  return null;
}

/** The other side of a DM for `me`, or null when `me` is not in it (or it is a world room). */
export function dmPartner(room: ParsedRoomId, me: string): string | null {
  if (room.kind !== "dm") return null;
  if (room.a === me) return room.b;
  if (room.b === me) return room.a;
  return null;
}

/** With the friendship undone or a block either way, nobody writes. */
export function canWriteDm(r: { friends: boolean; blocked: boolean }): boolean {
  return r.friends && !r.blocked;
}

/** A world room exists only for members of a world with more than one member. */
export function canUseWorld(r: { member: boolean; memberCount: number }): boolean {
  return r.member && r.memberCount >= SOCIAL.WORLD_MIN_MEMBERS;
}
```

`src/Domain/social/message.ts`:

```ts
import { DAY_MS, SOCIAL } from "@/Domain/social/socialConfig";

/**
 * Plain text, 1–500 characters (code points): line breaks normalized to `\n`, other control characters dropped,
 * trimmed. HTML is kept as text (the screens never render it as HTML). Null when invalid.
 */
export function cleanMessageBody(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const body = raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    .trim();
  if (body.length === 0) return null;
  if ([...body].length > SOCIAL.MESSAGE_MAX) return null;
  return body;
}

/** Sliding window: the send times kept for the user and whether this send is allowed. */
export function rateLimit(stamps: readonly number[], now: number): { allowed: boolean; stamps: number[] } {
  const recent = stamps.filter((t) => now - t < SOCIAL.RATE_WINDOW_MS);
  if (recent.length >= SOCIAL.RATE_MAX) return { allowed: false, stamps: recent };
  return { allowed: true, stamps: [...recent, now] };
}

/** Messages created before this instant are deleted. */
export function messageCutoff(now: number): number {
  return now - SOCIAL.HISTORY_DAYS * DAY_MS;
}
```

- [ ] **Passo 4: rodar e passar**

Run: `bun test src/Domain/social`
Expected: PASS (todos os testes de `nickname`, `rooms` e `message`).

- [ ] **Passo 5: commit**

```bash
git add src/Domain/social/rooms.ts src/Domain/social/rooms.test.ts src/Domain/social/message.ts src/Domain/social/message.test.ts
git commit -m "feat(social): salas e regras da mensagem" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 3: Esquema do banco (sem apagar nada)

**Arquivos:**
- Modificar: `src/backend/db.ts` (depois do `db.exec(...)` existente, linha 38)
- Teste: `src/backend/db.social.test.ts`

- [ ] **Passo 1: escrever o teste que falha**

`src/backend/db.social.test.ts`:

```ts
import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { migrateSocialSchema } from "@/backend/db";

function oldDatabase(): Database {
  const d = new Database(":memory:");
  d.exec("CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL)");
  d.exec("CREATE TABLE saves (save_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL)");
  d.prepare("INSERT INTO users (id, email, created_at) VALUES ('u1', 'a@b.c', 1)").run();
  d.prepare("INSERT INTO users (id, email, created_at) VALUES ('u2', 'd@e.f', 2)").run();
  return d;
}

test("adds the social columns and tables, keeps the users, and runs twice", () => {
  const d = oldDatabase();
  migrateSocialSchema(d);
  migrateSocialSchema(d);
  const cols = (d.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);
  expect(cols).toEqual(expect.arrayContaining(["id", "email", "created_at", "nickname", "nickname_changed_at", "friend_code"]));
  expect(d.prepare("SELECT email FROM users WHERE id = 'u1'").get()).toEqual({ email: "a@b.c" });
  const tables = (d.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name);
  expect(tables).toEqual(
    expect.arrayContaining(["friend_requests", "friendships", "blocks", "chat_messages", "chat_reads", "save_members"]),
  );
});

test("nicknames are unique ignoring case, friend codes are unique", () => {
  const d = oldDatabase();
  migrateSocialSchema(d);
  d.prepare("UPDATE users SET nickname = 'Ana', friend_code = 'FM-AAAA-AAAA' WHERE id = 'u1'").run();
  expect(() => d.prepare("UPDATE users SET nickname = 'ana' WHERE id = 'u2'").run()).toThrow();
  expect(() => d.prepare("UPDATE users SET friend_code = 'FM-AAAA-AAAA' WHERE id = 'u2'").run()).toThrow();
  d.prepare("UPDATE users SET nickname = 'Bia' WHERE id = 'u2'").run();
});

test("a friendship row must be stored in order", () => {
  const d = oldDatabase();
  migrateSocialSchema(d);
  d.prepare("INSERT INTO friendships (user_a, user_b, since) VALUES ('u1', 'u2', 1)").run();
  expect(() => d.prepare("INSERT INTO friendships (user_a, user_b, since) VALUES ('u2', 'u1', 1)").run()).toThrow();
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `bun test src/backend/db.social.test.ts`
Expected: FAIL — `migrateSocialSchema` não exportado.

- [ ] **Passo 3: implementar** — acrescentar ao fim de `src/backend/db.ts` (o import de `Database` já existe):

```ts
function addColumnIfMissing(database: Database, table: string, column: string, decl: string): void {
  const cols = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
}

/**
 * Friends and chat (`.claude/rules/social.md`). Only adds: the production database already has users, so
 * nothing is dropped or rewritten. SQLite cannot ADD COLUMN ... UNIQUE, so uniqueness lives in partial indexes.
 * `save_members` follows the multiplayer spec (`save_id, user_id, seat_id, role`); the world room reads it.
 */
export function migrateSocialSchema(database: Database): void {
  addColumnIfMissing(database, "users", "nickname", "TEXT");
  addColumnIfMissing(database, "users", "nickname_changed_at", "INTEGER");
  addColumnIfMissing(database, "users", "friend_code", "TEXT");
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nickname ON users(lower(nickname)) WHERE nickname IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_friend_code ON users(friend_code) WHERE friend_code IS NOT NULL;

    CREATE TABLE IF NOT EXISTS friend_requests (
      from_user  TEXT NOT NULL,
      to_user    TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (from_user, to_user)
    );
    CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(to_user);

    CREATE TABLE IF NOT EXISTS friendships (
      user_a TEXT NOT NULL,
      user_b TEXT NOT NULL,
      since  INTEGER NOT NULL,
      PRIMARY KEY (user_a, user_b),
      CHECK (user_a < user_b)
    );
    CREATE INDEX IF NOT EXISTS idx_friendships_b ON friendships(user_b);

    CREATE TABLE IF NOT EXISTS blocks (
      user_id    TEXT NOT NULL,
      blocked_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, blocked_id)
    );
    CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id);

    CREATE TABLE IF NOT EXISTS chat_messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      room       TEXT NOT NULL,
      from_user  TEXT NOT NULL,
      body       TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_room ON chat_messages(room, id);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);

    CREATE TABLE IF NOT EXISTS chat_reads (
      user_id      TEXT NOT NULL,
      room         TEXT NOT NULL,
      last_read_id INTEGER NOT NULL,
      PRIMARY KEY (user_id, room)
    );

    CREATE TABLE IF NOT EXISTS save_members (
      save_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      seat_id TEXT,
      role    TEXT NOT NULL DEFAULT 'member',
      PRIMARY KEY (save_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_save_members_user ON save_members(user_id);
  `);
}

migrateSocialSchema(db);
```

- [ ] **Passo 4: rodar e passar**

Run: `bun test src/backend/db.social.test.ts src/backend/auth src/backend/reports.test.ts`
Expected: PASS (os testes de auth e relatos continuam verdes com as colunas novas).

- [ ] **Passo 5: commit**

```bash
git add src/backend/db.ts src/backend/db.social.test.ts
git commit -m "feat(social): tabelas de amigos e chat sem apagar dados" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 4: Store — usuários, apelido, código e busca

**Arquivos:**
- Criar: `src/backend/social/socialStore.ts`
- Criar: `src/backend/social/socialTestUtils.ts`
- Teste: `src/backend/social/socialStore.users.test.ts`

- [ ] **Passo 1: criar o utilitário de teste**

`src/backend/social/socialTestUtils.ts`:

```ts
// Test helpers for the social store, routes and socket. Never imported by production code.
import { randomUUID } from "node:crypto";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { setNickname } from "@/backend/social/socialStore";

export interface TestUser {
  id: string;
  email: string;
  token: string;
  nickname: string | null;
}

/** A nickname nobody has in this test run (13 characters, no reserved word). */
export function uniqueNick(prefix = "u"): string {
  return `${prefix}${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/** A fresh user with a session; with `nickname`, the nickname is set (and its cooldown starts now). */
export function makeUser(nickname?: string): TestUser {
  const email = `${randomUUID()}@test.local`;
  const { user, session } = devAutoLogin(email);
  let nick: string | null = null;
  if (nickname !== undefined) {
    const r = setNickname(user.id, nickname, Date.now());
    if (!r.ok) throw new Error(`could not set nickname ${nickname}: ${r.error}`);
    nick = r.nickname;
  }
  return { id: user.id, email, token: session.token, nickname: nick };
}
```

- [ ] **Passo 2: escrever o teste que falha**

`src/backend/social/socialStore.users.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { DAY_MS } from "@/Domain/social/socialConfig";
import {
  ensureFriendCode,
  findUserByFriendCode,
  findUserByNickname,
  getSocialUser,
  searchUsers,
  setNickname,
} from "@/backend/social/socialStore";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";

describe("nickname", () => {
  test("is unique ignoring case", () => {
    const nick = uniqueNick("Ab");
    makeUser(nick);
    const b = makeUser();
    expect(setNickname(b.id, nick.toLowerCase(), Date.now())).toEqual({ ok: false, error: "nicknameTaken" });
  });

  test("rejects invalid names", () => {
    const u = makeUser();
    expect(setNickname(u.id, "ab", Date.now())).toEqual({ ok: false, error: "invalidNickname" });
    expect(setNickname(u.id, "theAdmin", Date.now())).toEqual({ ok: false, error: "invalidNickname" });
  });

  test("can change once every 30 days; the same name is a no-op", () => {
    const u = makeUser();
    const t0 = 1_800_000_000_000;
    const first = uniqueNick();
    expect(setNickname(u.id, first, t0)).toEqual({ ok: true, nickname: first });
    expect(setNickname(u.id, first, t0 + DAY_MS)).toEqual({ ok: true, nickname: first });
    expect(setNickname(u.id, uniqueNick(), t0 + 29 * DAY_MS)).toEqual({ ok: false, error: "tooSoon" });
    const second = uniqueNick();
    expect(setNickname(u.id, second, t0 + 30 * DAY_MS)).toEqual({ ok: true, nickname: second });
    expect(getSocialUser(u.id)?.nicknameChangedAt).toBe(t0 + 30 * DAY_MS);
  });

  test("findUserByNickname ignores case and spaces", () => {
    const nick = uniqueNick("Cd");
    const u = makeUser(nick);
    expect(findUserByNickname(`  ${nick.toUpperCase()} `)).toEqual({ id: u.id, nickname: nick });
  });
});

describe("friend code", () => {
  test("is generated once and found from what people type", () => {
    const u = makeUser(uniqueNick());
    const code = ensureFriendCode(u.id);
    expect(code).toMatch(/^FM-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
    expect(ensureFriendCode(u.id)).toBe(code);
    expect(findUserByFriendCode(code.toLowerCase().replace(/-/g, " "))?.id).toBe(u.id);
    expect(findUserByFriendCode("FM-0000-0000")).toBeNull();
  });
});

describe("searchUsers", () => {
  test("prefix match, never the searcher, relation none, wildcards escaped", () => {
    const base = uniqueNick("s");
    const me = makeUser(`${base}me`);
    makeUser(`${base}_x`);
    makeUser(`${base}ax`);
    expect(searchUsers(me.id, base).map((r) => r.nickname).sort()).toEqual([`${base}_x`, `${base}ax`].sort());
    expect(searchUsers(me.id, `${base}_`)).toEqual([{ nickname: `${base}_x`, relation: "none" }]);
    expect(searchUsers(me.id, `${base}%`)).toEqual([]);
  });
});
```

- [ ] **Passo 3: rodar e ver falhar**

Run: `bun test src/backend/social/socialStore.users.test.ts`
Expected: FAIL — `Cannot find module '@/backend/social/socialStore'`.

- [ ] **Passo 4: implementar** (as funções de pedidos, bloqueios, mundos e mensagens chegam nas Tarefas 5 e 6;
  `relationOf` e `blockedEitherWay` já ficam aqui porque a busca usa)

`src/backend/social/socialStore.ts`:

```ts
// SQLite queries of friends and chat (`.claude/rules/social.md`). User ids stay inside the server:
// routes and the socket translate them to nicknames.
import { randomInt } from "crypto";
import { db } from "@/backend/db";
import { SOCIAL } from "@/Domain/social/socialConfig";
import {
  generateFriendCode,
  nicknameChangeableAt,
  normalizeFriendCode,
  normalizeNickname,
  validateNickname,
} from "@/Domain/social/nickname";
import type { Relation } from "@/types/socialTypes";

export interface SocialUser {
  id: string;
  nickname: string | null;
  friendCode: string | null;
  nicknameChangedAt: number | null;
}

export interface NamedUser {
  id: string;
  nickname: string;
}

export interface DatedUser extends NamedUser {
  at: number;
}

export function ordered(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

// ── Users ───────────────────────────────────────────────────────────────────

export function getSocialUser(userId: string): SocialUser | null {
  const row = db
    .prepare(
      "SELECT id, nickname, friend_code AS friendCode, nickname_changed_at AS nicknameChangedAt FROM users WHERE id = ?",
    )
    .get(userId) as SocialUser | undefined;
  return row ?? null;
}

export function findUserByNickname(nickname: string): NamedUser | null {
  const row = db
    .prepare("SELECT id, nickname FROM users WHERE nickname IS NOT NULL AND lower(nickname) = lower(?)")
    .get(normalizeNickname(nickname)) as NamedUser | undefined;
  return row ?? null;
}

export function findUserByFriendCode(raw: string): SocialUser | null {
  const code = normalizeFriendCode(raw);
  if (!code) return null;
  const row = db
    .prepare(
      "SELECT id, nickname, friend_code AS friendCode, nickname_changed_at AS nicknameChangedAt FROM users WHERE friend_code = ?",
    )
    .get(code) as SocialUser | undefined;
  return row ?? null;
}

/** The user's friend code, generated (and stored) the first time. */
export function ensureFriendCode(userId: string): string {
  const user = getSocialUser(userId);
  if (!user) throw new Error(`unknown user ${userId}`);
  if (user.friendCode) return user.friendCode;
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generateFriendCode((n) => randomInt(0, n));
    try {
      db.prepare("UPDATE users SET friend_code = ? WHERE id = ? AND friend_code IS NULL").run(code, userId);
    } catch {
      continue; // another user already has this code (unique index): draw again
    }
    const after = getSocialUser(userId);
    if (after?.friendCode) return after.friendCode;
  }
  throw new Error("could not generate a unique friend code");
}

export type SetNicknameResult =
  | { ok: true; nickname: string }
  | { ok: false; error: "invalidNickname" | "nicknameTaken" | "tooSoon" };

/** Sets or changes the nickname. Every real change restarts the 30-day cooldown; the same name is a no-op. */
export function setNickname(userId: string, raw: string, now: number): SetNicknameResult {
  if (validateNickname(raw)) return { ok: false, error: "invalidNickname" };
  const nickname = normalizeNickname(raw);
  const user = getSocialUser(userId);
  if (!user) throw new Error(`unknown user ${userId}`);
  if (user.nickname === nickname) return { ok: true, nickname };
  const at = nicknameChangeableAt(user.nicknameChangedAt);
  if (user.nickname !== null && at !== null && now < at) return { ok: false, error: "tooSoon" };
  const owner = findUserByNickname(nickname);
  if (owner && owner.id !== userId) return { ok: false, error: "nicknameTaken" };
  try {
    db.prepare("UPDATE users SET nickname = ?, nickname_changed_at = ? WHERE id = ?").run(nickname, now, userId);
  } catch {
    return { ok: false, error: "nicknameTaken" }; // lost a race on the unique index
  }
  return { ok: true, nickname };
}

// ── Relations ───────────────────────────────────────────────────────────────

export function areFriends(a: string, b: string): boolean {
  if (a === b) return false;
  const [x, y] = ordered(a, b);
  return !!db.prepare("SELECT 1 AS hit FROM friendships WHERE user_a = ? AND user_b = ?").get(x, y);
}

export function isBlocked(blocker: string, blocked: string): boolean {
  return !!db.prepare("SELECT 1 AS hit FROM blocks WHERE user_id = ? AND blocked_id = ?").get(blocker, blocked);
}

export function blockedEitherWay(a: string, b: string): boolean {
  return isBlocked(a, b) || isBlocked(b, a);
}

export function hasRequest(from: string, to: string): boolean {
  return !!db.prepare("SELECT 1 AS hit FROM friend_requests WHERE from_user = ? AND to_user = ?").get(from, to);
}

export function relationOf(me: string, other: string): Relation {
  if (areFriends(me, other)) return "friend";
  if (hasRequest(me, other)) return "pending_out";
  if (hasRequest(other, me)) return "pending_in";
  return "none";
}

/** Up to 20 nicknames starting with `query` (case-insensitive), never the searcher, nobody blocked either way. */
export function searchUsers(me: string, query: string): { nickname: string; relation: Relation }[] {
  const pattern = `${query.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = db
    .prepare(
      `SELECT u.id, u.nickname FROM users u
       WHERE u.nickname IS NOT NULL
         AND lower(u.nickname) LIKE lower(?) ESCAPE '\\'
         AND u.id != ?
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
           WHERE (b.user_id = ? AND b.blocked_id = u.id) OR (b.user_id = u.id AND b.blocked_id = ?)
         )
       ORDER BY lower(u.nickname)
       LIMIT ?`,
    )
    .all(pattern, me, me, me, SOCIAL.SEARCH_LIMIT) as NamedUser[];
  return rows.map((r) => ({ nickname: r.nickname, relation: relationOf(me, r.id) }));
}
```

- [ ] **Passo 5: rodar e passar**

Run: `bun test src/backend/social/socialStore.users.test.ts`
Expected: PASS (6 testes).

- [ ] **Passo 6: commit**

```bash
git add src/backend/social/socialStore.ts src/backend/social/socialTestUtils.ts src/backend/social/socialStore.users.test.ts
git commit -m "feat(social): store de usuários, apelido, código e busca" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 5: Store — pedidos, amizades e bloqueios

**Arquivos:**
- Modificar: `src/backend/social/socialStore.ts` (acrescentar ao fim)
- Teste: `src/backend/social/socialStore.friends.test.ts`

- [ ] **Passo 1: escrever o teste que falha**

`src/backend/social/socialStore.friends.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { SOCIAL } from "@/Domain/social/socialConfig";
import {
  acceptRequest,
  areFriends,
  befriend,
  blockUser,
  cancelRequest,
  declineRequest,
  friendIds,
  hasRequest,
  listBlocked,
  listFriends,
  listIncoming,
  listOutgoing,
  relationOf,
  removeFriend,
  searchUsers,
  sendFriendRequest,
  unblockUser,
} from "@/backend/social/socialStore";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";

const NOW = 1_800_000_000_000;

describe("requests", () => {
  test("a request shows on both sides; a crossed request becomes a friendship", () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    expect(sendFriendRequest(a.id, b.id, NOW)).toBe("requested");
    expect(sendFriendRequest(a.id, b.id, NOW)).toBe("requested");
    expect(listOutgoing(a.id)).toEqual([{ id: b.id, nickname: b.nickname!, at: NOW }]);
    expect(listIncoming(b.id)).toEqual([{ id: a.id, nickname: a.nickname!, at: NOW }]);
    expect(relationOf(a.id, b.id)).toBe("pending_out");
    expect(relationOf(b.id, a.id)).toBe("pending_in");
    expect(sendFriendRequest(b.id, a.id, NOW + 1)).toBe("befriended");
    expect(areFriends(a.id, b.id)).toBe(true);
    expect(hasRequest(a.id, b.id) || hasRequest(b.id, a.id)).toBe(false);
    expect(sendFriendRequest(a.id, b.id, NOW)).toBe("alreadyFriends");
    expect(listFriends(a.id)).toEqual([{ id: b.id, nickname: b.nickname!, since: NOW + 1 }]);
    expect(friendIds(b.id)).toEqual([a.id]);
  });

  test("accept, decline and cancel", () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    const c = makeUser(uniqueNick());
    sendFriendRequest(a.id, b.id, NOW);
    sendFriendRequest(c.id, b.id, NOW);
    expect(acceptRequest(b.id, a.id, NOW)).toBe("accepted");
    expect(acceptRequest(b.id, a.id, NOW)).toBe("notFound");
    expect(declineRequest(b.id, c.id)).toBe(true);
    expect(declineRequest(b.id, c.id)).toBe(false);
    sendFriendRequest(c.id, b.id, NOW);
    expect(cancelRequest(c.id, b.id)).toBe(true);
    expect(listIncoming(b.id)).toEqual([]);
    expect(removeFriend(a.id, b.id)).toBe(true);
    expect(removeFriend(a.id, b.id)).toBe(false);
  });

  test("a request to oneself is notFound", () => {
    const a = makeUser(uniqueNick());
    expect(sendFriendRequest(a.id, a.id, NOW)).toBe("notFound");
  });

  test("at most 50 pending requests sent", () => {
    const a = makeUser(uniqueNick());
    for (let i = 0; i < SOCIAL.MAX_PENDING_OUT; i++) {
      expect(sendFriendRequest(a.id, makeUser(uniqueNick()).id, NOW)).toBe("requested");
    }
    expect(sendFriendRequest(a.id, makeUser(uniqueNick()).id, NOW)).toBe("limit");
  });

  test("at most 200 friends, on both sides of a crossed request", () => {
    const a = makeUser(uniqueNick());
    for (let i = 0; i < SOCIAL.MAX_FRIENDS; i++) expect(befriend(a.id, makeUser(uniqueNick()).id, NOW)).toBe(true);
    const b = makeUser(uniqueNick());
    expect(sendFriendRequest(a.id, b.id, NOW)).toBe("limit");
    sendFriendRequest(b.id, a.id, NOW);
    expect(acceptRequest(a.id, b.id, NOW)).toBe("limit");
  });
});

describe("blocks", () => {
  test("undo the friendship and the requests, hide from search both ways, refuse new requests", () => {
    const base = uniqueNick("k");
    const a = makeUser(`${base}a`);
    const b = makeUser(`${base}b`);
    befriend(a.id, b.id, NOW);
    sendFriendRequest(a.id, makeUser(uniqueNick()).id, NOW);
    blockUser(a.id, b.id, NOW);
    expect(areFriends(a.id, b.id)).toBe(false);
    expect(searchUsers(a.id, base).map((r) => r.nickname)).not.toContain(b.nickname);
    expect(searchUsers(b.id, base).map((r) => r.nickname)).not.toContain(a.nickname);
    expect(sendFriendRequest(b.id, a.id, NOW)).toBe("notFound");
    expect(sendFriendRequest(a.id, b.id, NOW)).toBe("notFound");
    expect(listBlocked(a.id)).toEqual([{ id: b.id, nickname: b.nickname! }]);
  });

  test("a block cancels pending requests between the two; unblocking does not restore the friendship", () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    sendFriendRequest(b.id, a.id, NOW);
    blockUser(a.id, b.id, NOW);
    expect(hasRequest(b.id, a.id)).toBe(false);
    expect(unblockUser(a.id, b.id)).toBe(true);
    expect(unblockUser(a.id, b.id)).toBe(false);
    expect(areFriends(a.id, b.id)).toBe(false);
    expect(relationOf(a.id, b.id)).toBe("none");
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `bun test src/backend/social/socialStore.friends.test.ts`
Expected: FAIL — `sendFriendRequest` (e outros) não exportados.

- [ ] **Passo 3: implementar** — acrescentar ao fim de `src/backend/social/socialStore.ts`:

```ts
// ── Requests and friendships ────────────────────────────────────────────────

export function friendCount(userId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM friendships WHERE user_a = ? OR user_b = ?")
    .get(userId, userId) as { n: number };
  return row.n;
}

export function pendingOutCount(userId: string): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM friend_requests WHERE from_user = ?").get(userId) as { n: number };
  return row.n;
}

/** Makes two users friends (removing the requests between them). False when either is at the friend limit. */
export function befriend(a: string, b: string, now: number): boolean {
  if (friendCount(a) >= SOCIAL.MAX_FRIENDS || friendCount(b) >= SOCIAL.MAX_FRIENDS) return false;
  const [x, y] = ordered(a, b);
  db.transaction(() => {
    db.prepare(
      "DELETE FROM friend_requests WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?)",
    ).run(a, b, b, a);
    db.prepare("INSERT OR IGNORE INTO friendships (user_a, user_b, since) VALUES (?, ?, ?)").run(x, y, now);
  })();
  return true;
}

export type RequestResult = "requested" | "befriended" | "alreadyFriends" | "limit" | "notFound";

/**
 * A request from `from` to `to`. A block either way answers notFound (the blocked never learns it). When `to`
 * already asked `from`, it becomes a friendship at once. Sending the same request again is a no-op.
 */
export function sendFriendRequest(from: string, to: string, now: number): RequestResult {
  if (from === to || blockedEitherWay(from, to)) return "notFound";
  if (areFriends(from, to)) return "alreadyFriends";
  if (hasRequest(to, from)) return befriend(from, to, now) ? "befriended" : "limit";
  if (hasRequest(from, to)) return "requested";
  if (friendCount(from) >= SOCIAL.MAX_FRIENDS || pendingOutCount(from) >= SOCIAL.MAX_PENDING_OUT) return "limit";
  db.prepare("INSERT INTO friend_requests (from_user, to_user, created_at) VALUES (?, ?, ?)").run(from, to, now);
  return "requested";
}

export type AcceptResult = "accepted" | "notFound" | "limit";

export function acceptRequest(me: string, from: string, now: number): AcceptResult {
  if (!hasRequest(from, me)) return "notFound";
  return befriend(me, from, now) ? "accepted" : "limit";
}

export function declineRequest(me: string, from: string): boolean {
  return db.prepare("DELETE FROM friend_requests WHERE from_user = ? AND to_user = ?").run(from, me).changes > 0;
}

export function cancelRequest(me: string, to: string): boolean {
  return db.prepare("DELETE FROM friend_requests WHERE from_user = ? AND to_user = ?").run(me, to).changes > 0;
}

export function removeFriend(a: string, b: string): boolean {
  const [x, y] = ordered(a, b);
  return db.prepare("DELETE FROM friendships WHERE user_a = ? AND user_b = ?").run(x, y).changes > 0;
}

export function listFriends(me: string): (NamedUser & { since: number })[] {
  return db
    .prepare(
      `SELECT u.id, u.nickname, f.since FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END
       WHERE (f.user_a = ? OR f.user_b = ?) AND u.nickname IS NOT NULL
       ORDER BY lower(u.nickname)`,
    )
    .all(me, me, me) as (NamedUser & { since: number })[];
}

export function friendIds(me: string): string[] {
  const rows = db
    .prepare(
      "SELECT CASE WHEN user_a = ? THEN user_b ELSE user_a END AS id FROM friendships WHERE user_a = ? OR user_b = ?",
    )
    .all(me, me, me) as { id: string }[];
  return rows.map((r) => r.id);
}

export function listIncoming(me: string): DatedUser[] {
  return db
    .prepare(
      `SELECT u.id, u.nickname, r.created_at AS at FROM friend_requests r JOIN users u ON u.id = r.from_user
       WHERE r.to_user = ? AND u.nickname IS NOT NULL ORDER BY r.created_at DESC, lower(u.nickname)`,
    )
    .all(me) as DatedUser[];
}

export function listOutgoing(me: string): DatedUser[] {
  return db
    .prepare(
      `SELECT u.id, u.nickname, r.created_at AS at FROM friend_requests r JOIN users u ON u.id = r.to_user
       WHERE r.from_user = ? AND u.nickname IS NOT NULL ORDER BY r.created_at DESC, lower(u.nickname)`,
    )
    .all(me) as DatedUser[];
}

// ── Blocks ──────────────────────────────────────────────────────────────────

/** Blocks `other`: undoes the friendship and cancels the requests between the two. */
export function blockUser(me: string, other: string, now: number): void {
  if (me === other) return;
  const [x, y] = ordered(me, other);
  db.transaction(() => {
    db.prepare("INSERT OR IGNORE INTO blocks (user_id, blocked_id, created_at) VALUES (?, ?, ?)").run(me, other, now);
    db.prepare("DELETE FROM friendships WHERE user_a = ? AND user_b = ?").run(x, y);
    db.prepare(
      "DELETE FROM friend_requests WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?)",
    ).run(me, other, other, me);
  })();
}

/** Unblocking never restores the friendship. */
export function unblockUser(me: string, other: string): boolean {
  return db.prepare("DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?").run(me, other).changes > 0;
}

export function listBlocked(me: string): NamedUser[] {
  return db
    .prepare(
      `SELECT u.id, u.nickname FROM blocks b JOIN users u ON u.id = b.blocked_id
       WHERE b.user_id = ? AND u.nickname IS NOT NULL ORDER BY lower(u.nickname)`,
    )
    .all(me) as NamedUser[];
}
```

- [ ] **Passo 4: rodar e passar**

Run: `bun test src/backend/social/socialStore.friends.test.ts src/backend/social/socialStore.users.test.ts`
Expected: PASS.

- [ ] **Passo 5: commit**

```bash
git add src/backend/social/socialStore.ts src/backend/social/socialStore.friends.test.ts
git commit -m "feat(social): pedidos, amizades e bloqueios" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 6: Store — mundos, mensagens, lidas e limpeza

**Arquivos:**
- Modificar: `src/backend/social/socialStore.ts` (acrescentar ao fim; acrescentar `import { messageCutoff } from "@/Domain/social/message";` aos imports do topo)
- Teste: `src/backend/social/socialStore.messages.test.ts`

- [ ] **Passo 1: escrever o teste que falha**

`src/backend/social/socialStore.messages.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { DAY_MS } from "@/Domain/social/socialConfig";
import { dmRoomId, worldRoomId } from "@/Domain/social/rooms";
import {
  addWorldMember,
  blockUser,
  insertMessage,
  isWorldMember,
  listMessages,
  markRead,
  purgeOldMessages,
  unreadCount,
  worldMemberIds,
  worldsOf,
} from "@/backend/social/socialStore";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";

const NOW = 1_800_000_000_000;

describe("worlds", () => {
  test("owner counts as member; a world shows up only with two members", () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    const c = makeUser(uniqueNick());
    const saveId = randomUUID();
    recordSaveOwnership(saveId, a.id);
    expect(isWorldMember(a.id, saveId)).toBe(true);
    expect(worldsOf(a.id)).not.toContain(saveId);
    addWorldMember(saveId, b.id, "member");
    expect(worldMemberIds(saveId).sort()).toEqual([a.id, b.id].sort());
    expect(worldsOf(a.id)).toContain(saveId);
    expect(worldsOf(b.id)).toContain(saveId);
    expect(isWorldMember(c.id, saveId)).toBe(false);
    expect(worldsOf(c.id)).not.toContain(saveId);
  });
});

describe("messages", () => {
  test("history is paginated newest first, returned oldest first", () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    const room = dmRoomId(a.id, b.id);
    for (let i = 0; i < 60; i++) insertMessage(room, i % 2 ? a.id : b.id, `m${i}`, NOW + i);
    const page = listMessages(room, a.id, { limit: 50 });
    expect(page).toHaveLength(50);
    expect(page[0]!.body).toBe("m10");
    expect(page[49]!.body).toBe("m59");
    expect(page[49]!.fromNickname).toBe(a.nickname);
    const older = listMessages(room, a.id, { before: page[0]!.id, limit: 50 });
    expect(older.map((m) => m.body)).toEqual(Array.from({ length: 10 }, (_, i) => `m${i}`));
  });

  test("a blocked sender's messages disappear for whoever blocked", () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    const room = worldRoomId(randomUUID());
    insertMessage(room, a.id, "from a", NOW);
    insertMessage(room, b.id, "from b", NOW + 1);
    blockUser(a.id, b.id, NOW + 2);
    expect(listMessages(room, a.id, { limit: 50 }).map((m) => m.body)).toEqual(["from a"]);
    expect(listMessages(room, b.id, { limit: 50 }).map((m) => m.body)).toEqual(["from a", "from b"]);
  });

  test("unread counts others' messages after the last read; read only moves forward and is clamped", () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    const room = dmRoomId(a.id, b.id);
    const m1 = insertMessage(room, b.id, "1", NOW);
    insertMessage(room, a.id, "mine", NOW + 1);
    const m3 = insertMessage(room, b.id, "3", NOW + 2);
    expect(unreadCount(a.id, room)).toBe(2);
    expect(markRead(a.id, room, m1.id)).toBe(m1.id);
    expect(unreadCount(a.id, room)).toBe(1);
    expect(markRead(a.id, room, 0)).toBe(m1.id);
    expect(markRead(a.id, room, m3.id + 1000)).toBe(m3.id);
    expect(unreadCount(a.id, room)).toBe(0);
  });

  test("unread ignores blocked senders", () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    const room = worldRoomId(randomUUID());
    insertMessage(room, b.id, "x", NOW);
    blockUser(a.id, b.id, NOW);
    expect(unreadCount(a.id, room)).toBe(0);
  });

  test("messages older than 90 days are purged", () => {
    const a = makeUser(uniqueNick());
    const room = worldRoomId(randomUUID());
    insertMessage(room, a.id, "old", NOW - 91 * DAY_MS);
    insertMessage(room, a.id, "new", NOW);
    expect(purgeOldMessages(NOW)).toBeGreaterThanOrEqual(1);
    expect(listMessages(room, a.id, { limit: 50 }).map((m) => m.body)).toEqual(["new"]);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `bun test src/backend/social/socialStore.messages.test.ts`
Expected: FAIL — `addWorldMember` (e outros) não exportados.

- [ ] **Passo 3: implementar** — acrescentar ao fim de `src/backend/social/socialStore.ts`:

```ts
// ── Worlds (multiplayer, part 2: `save_members`) ────────────────────────────

const WORLD_USERS_SQL = "SELECT save_id, user_id FROM saves UNION SELECT save_id, user_id FROM save_members";

/** Used by tests today; the multiplayer (part 2) writes `save_members` when a world gets a second manager. */
export function addWorldMember(saveId: string, userId: string, role: "owner" | "member"): void {
  db.prepare("INSERT OR IGNORE INTO save_members (save_id, user_id, seat_id, role) VALUES (?, ?, NULL, ?)").run(
    saveId,
    userId,
    role,
  );
}

/** The save's owner (`saves`) or a member (`save_members`). */
export function isWorldMember(userId: string, saveId: string): boolean {
  return !!db
    .prepare(
      "SELECT 1 AS hit FROM saves WHERE save_id = ? AND user_id = ? UNION SELECT 1 AS hit FROM save_members WHERE save_id = ? AND user_id = ? LIMIT 1",
    )
    .get(saveId, userId, saveId, userId);
}

export function worldMemberIds(saveId: string): string[] {
  const rows = db
    .prepare(`SELECT DISTINCT user_id AS userId FROM (${WORLD_USERS_SQL}) WHERE save_id = ?`)
    .all(saveId) as { userId: string }[];
  return rows.map((r) => r.userId);
}

/** Worlds of the user with at least two members (the only ones with a chat room). */
export function worldsOf(userId: string): string[] {
  const rows = db
    .prepare(
      `SELECT save_id AS saveId FROM (${WORLD_USERS_SQL})
       GROUP BY save_id
       HAVING COUNT(DISTINCT user_id) >= ? AND SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) > 0
       ORDER BY save_id`,
    )
    .all(SOCIAL.WORLD_MIN_MEMBERS, userId) as { saveId: string }[];
  return rows.map((r) => r.saveId);
}

// ── Messages ────────────────────────────────────────────────────────────────

export interface ChatMessageRow {
  id: number;
  room: string;
  fromUser: string;
  fromNickname: string | null;
  body: string;
  createdAt: number;
}

const BLOCKED_SENDER_SQL = "NOT EXISTS (SELECT 1 FROM blocks b WHERE b.user_id = ? AND b.blocked_id = m.from_user)";

export function insertMessage(room: string, fromUser: string, body: string, now: number): ChatMessageRow {
  const info = db
    .prepare("INSERT INTO chat_messages (room, from_user, body, created_at) VALUES (?, ?, ?, ?)")
    .run(room, fromUser, body, now);
  return {
    id: Number(info.lastInsertRowid),
    room,
    fromUser,
    fromNickname: getSocialUser(fromUser)?.nickname ?? null,
    body,
    createdAt: now,
  };
}

/** A page of history (newest `limit` before `before`), oldest first, without senders the viewer blocked. */
export function listMessages(
  room: string,
  viewerId: string,
  opts: { before?: number; limit: number },
): ChatMessageRow[] {
  const before = opts.before ?? null;
  const rows = db
    .prepare(
      `SELECT m.id, m.room, m.from_user AS fromUser, u.nickname AS fromNickname, m.body, m.created_at AS createdAt
       FROM chat_messages m LEFT JOIN users u ON u.id = m.from_user
       WHERE m.room = ? AND (? IS NULL OR m.id < ?) AND ${BLOCKED_SENDER_SQL}
       ORDER BY m.id DESC LIMIT ?`,
    )
    .all(room, before, before, viewerId, opts.limit) as ChatMessageRow[];
  return rows.reverse();
}

/** Marks read up to `lastReadId` (clamped to the room's newest id; never moves back). Returns the stored id. */
export function markRead(userId: string, room: string, lastReadId: number): number {
  const max = (db.prepare("SELECT COALESCE(MAX(id), 0) AS m FROM chat_messages WHERE room = ?").get(room) as { m: number }).m;
  const value = Math.max(0, Math.min(Math.floor(lastReadId), max));
  db.prepare(
    `INSERT INTO chat_reads (user_id, room, last_read_id) VALUES (?, ?, ?)
     ON CONFLICT(user_id, room) DO UPDATE SET last_read_id = MAX(last_read_id, excluded.last_read_id)`,
  ).run(userId, room, value);
  return (db.prepare("SELECT last_read_id AS v FROM chat_reads WHERE user_id = ? AND room = ?").get(userId, room) as {
    v: number;
  }).v;
}

export function unreadCount(userId: string, room: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM chat_messages m
       WHERE m.room = ? AND m.from_user != ?
         AND m.id > COALESCE((SELECT last_read_id FROM chat_reads WHERE user_id = ? AND room = ?), 0)
         AND ${BLOCKED_SENDER_SQL}`,
    )
    .get(room, userId, userId, room, userId) as { n: number };
  return row.n;
}

/** Daily cleanup: deletes messages older than 90 days and read marks of rooms left empty. */
export function purgeOldMessages(now: number): number {
  const removed = db.prepare("DELETE FROM chat_messages WHERE created_at < ?").run(messageCutoff(now)).changes;
  db.prepare("DELETE FROM chat_reads WHERE NOT EXISTS (SELECT 1 FROM chat_messages m WHERE m.room = chat_reads.room)").run();
  return removed;
}
```

- [ ] **Passo 4: rodar e passar**

Run: `bun test src/backend/social`
Expected: PASS (users, friends, messages).

- [ ] **Passo 5: commit**

```bash
git add src/backend/social/socialStore.ts src/backend/social/socialStore.messages.test.ts
git commit -m "feat(social): mundos, mensagens, lidas e limpeza de 90 dias" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 7: Acesso às salas e presença por usuário

**Arquivos:**
- Criar: `src/backend/social/roomAccess.ts`
- Modificar: `src/backend/presence.ts` (depois de `onlineCount`, linha 20)
- Teste: `src/backend/social/roomAccess.test.ts`

- [ ] **Passo 1: escrever o teste que falha**

`src/backend/social/roomAccess.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { isPresent, lastSeenAt, recordPresence, resetPresence, PRESENCE_WINDOW_MS } from "@/backend/presence";
import { canWrite, resolveRoom, roomParamFor, roomRecipients } from "@/backend/social/roomAccess";
import { addWorldMember, befriend, blockUser } from "@/backend/social/socialStore";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";
import { dmRoomId, worldRoomId } from "@/Domain/social/rooms";

describe("resolveRoom", () => {
  test("a DM by the other's nickname, in any case, with the canonical name back", () => {
    const a = makeUser(uniqueNick("Mx"));
    const b = makeUser(uniqueNick("Ny"));
    const room = resolveRoom(a.id, `dm:${b.nickname!.toLowerCase()}`);
    expect(room).toEqual({
      kind: "dm",
      roomId: dmRoomId(a.id, b.id),
      param: `dm:${b.nickname}`,
      partner: { id: b.id, nickname: b.nickname! },
    });
  });

  test("unknown nickname, oneself and bad params are null", () => {
    const a = makeUser(uniqueNick());
    expect(resolveRoom(a.id, `dm:${uniqueNick()}`)).toBeNull();
    expect(resolveRoom(a.id, `dm:${a.nickname}`)).toBeNull();
    expect(resolveRoom(a.id, "dm:x")).toBeNull();
    expect(resolveRoom(a.id, "lobby")).toBeNull();
  });

  test("a world needs membership and two members", () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    const c = makeUser(uniqueNick());
    const saveId = randomUUID();
    recordSaveOwnership(saveId, a.id);
    expect(resolveRoom(a.id, `world:${saveId}`)).toBeNull();
    addWorldMember(saveId, b.id, "member");
    expect(resolveRoom(a.id, `world:${saveId}`)).toEqual({
      kind: "world",
      roomId: worldRoomId(saveId),
      param: `world:${saveId}`,
      saveId,
    });
    expect(resolveRoom(c.id, `world:${saveId}`)).toBeNull();
    expect(roomRecipients(worldRoomId(saveId)).sort()).toEqual([a.id, b.id].sort());
  });
});

test("only friends with no block write a DM", () => {
  const a = makeUser(uniqueNick());
  const b = makeUser(uniqueNick());
  const room = resolveRoom(a.id, `dm:${b.nickname}`)!;
  expect(canWrite(a.id, room)).toBe(false);
  befriend(a.id, b.id, Date.now());
  expect(canWrite(a.id, room)).toBe(true);
  blockUser(b.id, a.id, Date.now());
  expect(canWrite(a.id, room)).toBe(false);
});

test("each side sees the DM under the other's nickname", () => {
  const a = makeUser(uniqueNick());
  const b = makeUser(uniqueNick());
  const id = dmRoomId(a.id, b.id);
  expect(roomParamFor(a.id, id)).toBe(`dm:${b.nickname}`);
  expect(roomParamFor(b.id, id)).toBe(`dm:${a.nickname}`);
  expect(roomParamFor(makeUser().id, id)).toBeNull();
  expect(roomRecipients(id).sort()).toEqual([a.id, b.id].sort());
});

test("presence: last seen and the 2.5-minute window", () => {
  resetPresence();
  expect(lastSeenAt("nobody")).toBeNull();
  recordPresence("u-x", 1_000);
  expect(lastSeenAt("u-x")).toBe(1_000);
  expect(isPresent("u-x", 1_000 + PRESENCE_WINDOW_MS)).toBe(true);
  expect(isPresent("u-x", 1_001 + PRESENCE_WINDOW_MS)).toBe(false);
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `bun test src/backend/social/roomAccess.test.ts`
Expected: FAIL — módulo `roomAccess` e `lastSeenAt` ausentes.

- [ ] **Passo 3: implementar**

Em `src/backend/presence.ts`, depois da função `onlineCount`:

```ts
/** When the user last pinged (page visible, HTTP or socket), or null. Used for a friend's status. */
export function lastSeenAt(userId: string): number | null {
  return lastSeen.get(userId) ?? null;
}

/** Seen within the presence window (the same 2.5 minutes as the "N online" count). */
export function isPresent(userId: string, now: number): boolean {
  const at = lastSeen.get(userId);
  return at !== undefined && now - at <= PRESENCE_WINDOW_MS;
}
```

`src/backend/social/roomAccess.ts`:

```ts
// Rooms as the client names them (`dm:<nickname>`, `world:<saveId>`) ↔ internal room ids (`dm:<idA>:<idB>`).
import {
  canUseWorld,
  canWriteDm,
  dmRoomId,
  dmRoomParam,
  parseRoomId,
  parseRoomParam,
  worldRoomId,
  worldRoomParam,
} from "@/Domain/social/rooms";
import {
  areFriends,
  blockedEitherWay,
  findUserByNickname,
  getSocialUser,
  isWorldMember,
  worldMemberIds,
  type NamedUser,
} from "@/backend/social/socialStore";

export type ResolvedRoom =
  | { kind: "dm"; roomId: string; param: string; partner: NamedUser }
  | { kind: "world"; roomId: string; param: string; saveId: string };

/** The room `me` asked for, or null when it does not exist for them (unknown nickname, oneself, not a member). */
export function resolveRoom(me: string, rawParam: string): ResolvedRoom | null {
  const p = parseRoomParam(rawParam);
  if (!p) return null;
  if (p.kind === "dm") {
    const partner = findUserByNickname(p.nickname);
    if (!partner || partner.id === me) return null;
    return { kind: "dm", roomId: dmRoomId(me, partner.id), param: dmRoomParam(partner.nickname), partner };
  }
  const member = isWorldMember(me, p.saveId);
  if (!canUseWorld({ member, memberCount: worldMemberIds(p.saveId).length })) return null;
  return { kind: "world", roomId: worldRoomId(p.saveId), param: worldRoomParam(p.saveId), saveId: p.saveId };
}

/** A world room is open to its members; a DM only between friends with no block either way. */
export function canWrite(me: string, room: ResolvedRoom): boolean {
  if (room.kind === "world") return true;
  return canWriteDm({ friends: areFriends(me, room.partner.id), blocked: blockedEitherWay(me, room.partner.id) });
}

/** How `viewerId` names an internal room: the other's nickname for a DM. Null when the viewer is outside it. */
export function roomParamFor(viewerId: string, roomId: string): string | null {
  const parsed = parseRoomId(roomId);
  if (!parsed) return null;
  if (parsed.kind === "world") return worldRoomParam(parsed.saveId);
  const other = parsed.a === viewerId ? parsed.b : parsed.b === viewerId ? parsed.a : null;
  if (!other) return null;
  const nickname = getSocialUser(other)?.nickname;
  return nickname ? dmRoomParam(nickname) : null;
}

/** Everyone in a room (the sender included). */
export function roomRecipients(roomId: string): string[] {
  const parsed = parseRoomId(roomId);
  if (!parsed) return [];
  return parsed.kind === "dm" ? [parsed.a, parsed.b] : worldMemberIds(parsed.saveId);
}
```

- [ ] **Passo 4: rodar e passar**

Run: `bun test src/backend/social/roomAccess.test.ts src/backend/presence.test.ts`
Expected: PASS (se `src/backend/presence.test.ts` não existir, rode só o primeiro arquivo).

- [ ] **Passo 5: commit**

```bash
git add src/backend/presence.ts src/backend/social/roomAccess.ts src/backend/social/roomAccess.test.ts
git commit -m "feat(social): acesso às salas e presença por usuário" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 8: Tempo real (conexões, presença, entrega)

**Arquivos:**
- Criar: `src/backend/social/realtime.ts`
- Teste: `src/backend/social/realtime.test.ts`

Mensagens do socket (JSON, uma por frame; tipos em `src/types/socialTypes.ts`):
cliente → servidor `hello { saveId }`, `ping`, `typing { room }`; servidor → cliente `message { room, message }`,
`presence { nickname, status, club }`, `friend_request { from }`, `friend_update`, `read { room, lastReadId }`,
`typing { room, from }`, `pong { online }`. Frames acima de 2 KB ou JSON inválido são ignorados.

- [ ] **Passo 1: escrever o teste que falha** (sockets falsos; o socket real fica para a Tarefa 11)

`src/backend/social/realtime.test.ts`:

```ts
import { beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { PRESENCE_WINDOW_MS, recordPresence, resetPresence } from "@/backend/presence";
import {
  deliverMessage,
  handleClientEvent,
  handleSocialUpgrade,
  onSocketClose,
  onSocketOpen,
  resetRealtime,
  setClubNameResolver,
  statusOf,
  sweepStatuses,
  type SocialSocket,
} from "@/backend/social/realtime";
import { befriend, blockUser, insertMessage } from "@/backend/social/socialStore";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";
import { dmRoomId } from "@/Domain/social/rooms";
import type { ServerEvent } from "@/types/socialTypes";

type FakeSocket = SocialSocket & { events: ServerEvent[] };

function fakeSocket(userId: string): FakeSocket {
  const events: ServerEvent[] = [];
  return {
    data: { userId, saveId: null, clubName: null },
    events,
    send(message: string) {
      events.push(JSON.parse(message) as ServerEvent);
    },
  };
}

beforeEach(() => {
  resetRealtime();
  resetPresence();
});

describe("presence", () => {
  test("a friend sees online, then playing with the club of the open save", async () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    befriend(a.id, b.id, Date.now());
    const wb = fakeSocket(b.id);
    onSocketOpen(wb);
    const wa = fakeSocket(a.id);
    onSocketOpen(wa);
    expect(wb.events).toContainEqual({ type: "presence", nickname: a.nickname!, status: "online", club: null });
    const saveId = randomUUID();
    recordSaveOwnership(saveId, a.id);
    setClubNameResolver(async () => "Manchester United");
    await handleClientEvent(wa, JSON.stringify({ type: "hello", saveId }));
    expect(wb.events).toContainEqual({
      type: "presence",
      nickname: a.nickname!,
      status: "playing",
      club: "Manchester United",
    });
    expect(wa.events.at(-1)).toMatchObject({ type: "pong" });
  });

  test("hello with somebody else's save stays online", async () => {
    const a = makeUser(uniqueNick());
    const other = makeUser(uniqueNick());
    const saveId = randomUUID();
    recordSaveOwnership(saveId, other.id);
    setClubNameResolver(async () => "Arsenal");
    const wa = fakeSocket(a.id);
    onSocketOpen(wa);
    await handleClientEvent(wa, JSON.stringify({ type: "hello", saveId }));
    expect(statusOf(a.id, Date.now())).toEqual({ status: "online", club: null });
  });

  test("a stranger never gets presence", () => {
    const a = makeUser(uniqueNick());
    const c = makeUser(uniqueNick());
    const wc = fakeSocket(c.id);
    onSocketOpen(wc);
    onSocketOpen(fakeSocket(a.id));
    expect(wc.events.filter((e) => e.type === "presence")).toEqual([]);
  });

  test("closing the socket keeps the presence window; the sweep then sends offline", () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    befriend(a.id, b.id, Date.now());
    const wb = fakeSocket(b.id);
    onSocketOpen(wb);
    const wa = fakeSocket(a.id);
    onSocketOpen(wa);
    onSocketClose(wa);
    expect(statusOf(a.id, Date.now()).status).toBe("online");
    sweepStatuses(Date.now() + PRESENCE_WINDOW_MS + 1);
    expect(wb.events.at(-1)).toEqual({ type: "presence", nickname: a.nickname!, status: "offline", club: null });
  });

  test("statusOf without any socket follows the HTTP presence", () => {
    const a = makeUser(uniqueNick());
    expect(statusOf(a.id, 10_000).status).toBe("offline");
    recordPresence(a.id, 10_000);
    expect(statusOf(a.id, 10_000)).toEqual({ status: "online", club: null });
  });
});

describe("delivery", () => {
  test("each side gets the message under its own room name", () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    const wa = fakeSocket(a.id);
    const wb = fakeSocket(b.id);
    onSocketOpen(wa);
    onSocketOpen(wb);
    const row = insertMessage(dmRoomId(a.id, b.id), a.id, "oi", 5);
    deliverMessage(row);
    expect(wb.events.at(-1)).toEqual({
      type: "message",
      room: `dm:${a.nickname}`,
      message: { id: row.id, from: a.nickname!, mine: false, body: "oi", at: 5 },
    });
    expect(wa.events.at(-1)).toEqual({
      type: "message",
      room: `dm:${b.nickname}`,
      message: { id: row.id, from: a.nickname!, mine: true, body: "oi", at: 5 },
    });
  });

  test("whoever blocked the sender gets nothing", () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    blockUser(a.id, b.id, Date.now());
    const wa = fakeSocket(a.id);
    onSocketOpen(wa);
    wa.events.length = 0;
    deliverMessage(insertMessage(dmRoomId(a.id, b.id), b.id, "spam", 1));
    expect(wa.events).toEqual([]);
  });

  test("typing reaches the friend, not a stranger", async () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    const c = makeUser(uniqueNick());
    befriend(a.id, b.id, Date.now());
    const wa = fakeSocket(a.id);
    const wb = fakeSocket(b.id);
    onSocketOpen(wa);
    onSocketOpen(wb);
    await handleClientEvent(wa, JSON.stringify({ type: "typing", room: `dm:${b.nickname}` }));
    expect(wb.events.at(-1)).toEqual({ type: "typing", room: `dm:${a.nickname}`, from: a.nickname! });
    const wc = fakeSocket(c.id);
    onSocketOpen(wc);
    await handleClientEvent(wc, JSON.stringify({ type: "typing", room: `dm:${a.nickname}` }));
    expect(wa.events.filter((e) => e.type === "typing")).toEqual([]);
  });

  test("garbage frames are ignored", async () => {
    const a = makeUser(uniqueNick());
    const wa = fakeSocket(a.id);
    onSocketOpen(wa);
    wa.events.length = 0;
    await handleClientEvent(wa, "{not json");
    await handleClientEvent(wa, JSON.stringify({ type: "nope" }));
    await handleClientEvent(wa, "x".repeat(5000));
    expect(wa.events).toEqual([]);
  });
});

describe("handleSocialUpgrade", () => {
  const upgrades: unknown[] = [];
  const server = {
    upgrade(_req: Request, options: { data: unknown }) {
      upgrades.push(options.data);
      return true;
    },
  };

  test("401 without a session", () => {
    const res = handleSocialUpgrade(new Request("http://localhost:3000/api/ws"), server);
    expect(res?.status).toBe(401);
  });

  test("403 from another site", () => {
    const a = makeUser();
    const req = new Request("http://localhost:3000/api/ws", {
      headers: { cookie: `fs_session=${a.token}`, origin: "https://evil.example" },
    });
    expect(handleSocialUpgrade(req, server)?.status).toBe(403);
  });

  test("upgrades with the user id kept on the server", () => {
    const a = makeUser();
    const req = new Request("http://localhost:3000/api/ws", {
      headers: { cookie: `fs_session=${a.token}`, origin: "http://localhost:3000" },
    });
    expect(handleSocialUpgrade(req, server)).toBeUndefined();
    expect(upgrades.at(-1)).toEqual({ userId: a.id, saveId: null, clubName: null });
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `bun test src/backend/social/realtime.test.ts`
Expected: FAIL — `Cannot find module '@/backend/social/realtime'`.

- [ ] **Passo 3: implementar**

`src/backend/social/realtime.ts`:

```ts
// Friends and chat in real time (`.claude/rules/social.md`). In memory, per process: the open sockets of each
// user, and the last status sent to friends. Sending a message is HTTP; the socket only delivers.
import type { ServerWebSocket } from "bun";
import { getAuth } from "@/backend/auth/middleware";
import { isPresent, onlineCount, recordPresence } from "@/backend/presence";
import { saveService } from "@/backend/SaveService";
import { canWrite, resolveRoom, roomParamFor, roomRecipients } from "@/backend/social/roomAccess";
import { friendIds, getSocialUser, isBlocked, isWorldMember, type ChatMessageRow } from "@/backend/social/socialStore";
import { isSaveIdShape } from "@/Domain/social/rooms";
import type { ClientEvent, FriendStatus, ServerEvent } from "@/types/socialTypes";

export interface WsData {
  userId: string;
  /** The save open in this tab (`hello`), when the user owns it or is a member. */
  saveId: string | null;
  /** That save's club, for the "playing" status. */
  clubName: string | null;
}

/** The part of a Bun socket this module uses (a fake in unit tests). */
export interface SocialSocket {
  data: WsData;
  send(message: string): unknown;
}

const MAX_CLIENT_FRAME = 2048;
const sockets = new Map<string, Set<SocialSocket>>();
/** userId → "status|club" last sent to friends (absent = offline). */
const lastStatus = new Map<string, string>();

type ClubNameResolver = (saveId: string) => Promise<string | null>;

const defaultClubName: ClubNameResolver = async (saveId) => {
  try {
    const meta = await saveService.getMeta(saveId);
    return meta && meta.clubId ? meta.clubName : null;
  } catch {
    return null;
  }
};

let clubNameOf: ClubNameResolver = defaultClubName;

/** Tests only: answer the club name without a save on disk. `null` restores the default. */
export function setClubNameResolver(fn: ClubNameResolver | null): void {
  clubNameOf = fn ?? defaultClubName;
}

/** Tests only. */
export function resetRealtime(): void {
  sockets.clear();
  lastStatus.clear();
  clubNameOf = defaultClubName;
}

function sendTo(ws: SocialSocket, event: ServerEvent): void {
  try {
    ws.send(JSON.stringify(event));
  } catch {
    // closed socket: the close handler removes it
  }
}

export function notifyUser(userId: string, event: ServerEvent): void {
  for (const ws of sockets.get(userId) ?? []) sendTo(ws, event);
}

export function notifyFriendUpdate(userIds: string[]): void {
  for (const id of userIds) notifyUser(id, { type: "friend_update" });
}

export function connectionCount(userId: string): number {
  return sockets.get(userId)?.size ?? 0;
}

/** online = seen in the last 2.5 minutes; playing = online with a save of theirs open in some tab. */
export function statusOf(userId: string, now: number): { status: FriendStatus; club: string | null } {
  if (!isPresent(userId, now)) return { status: "offline", club: null };
  for (const ws of sockets.get(userId) ?? []) {
    if (ws.data.clubName) return { status: "playing", club: ws.data.clubName };
  }
  return { status: "online", club: null };
}

/** Sends the user's status to their friends when it changed since the last time. */
export function publishStatus(userId: string, now: number): void {
  const s = statusOf(userId, now);
  const key = `${s.status}|${s.club ?? ""}`;
  if ((lastStatus.get(userId) ?? "offline|") === key) return;
  if (s.status === "offline") lastStatus.delete(userId);
  else lastStatus.set(userId, key);
  const nickname = getSocialUser(userId)?.nickname;
  if (!nickname) return;
  for (const friend of friendIds(userId)) notifyUser(friend, { type: "presence", nickname, ...s });
}

/** Run every 30 s: whoever left the presence window goes offline for their friends. */
export function sweepStatuses(now: number): void {
  for (const userId of [...lastStatus.keys()]) publishStatus(userId, now);
}

/** A stored message to every member of its room, each under their own room name, except who blocked the sender. */
export function deliverMessage(row: ChatMessageRow): void {
  for (const userId of roomRecipients(row.room)) {
    if (userId !== row.fromUser && isBlocked(userId, row.fromUser)) continue;
    const room = roomParamFor(userId, row.room);
    if (!room) continue;
    notifyUser(userId, {
      type: "message",
      room,
      message: { id: row.id, from: row.fromNickname ?? "", mine: userId === row.fromUser, body: row.body, at: row.createdAt },
    });
  }
}

function parseClientEvent(raw: unknown): ClientEvent | null {
  if (typeof raw !== "string" || raw.length > MAX_CLIENT_FRAME) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const e = v as Record<string, unknown>;
  if (e.type === "ping") return { type: "ping" };
  if (e.type === "hello") return { type: "hello", saveId: typeof e.saveId === "string" ? e.saveId : null };
  if (e.type === "typing" && typeof e.room === "string") return { type: "typing", room: e.room };
  return null;
}

function relayTyping(userId: string, rawRoom: string): void {
  const me = getSocialUser(userId);
  if (!me?.nickname) return;
  const room = resolveRoom(userId, rawRoom);
  if (!room || !canWrite(userId, room)) return;
  for (const id of roomRecipients(room.roomId)) {
    if (id === userId || isBlocked(id, userId)) continue;
    const param = roomParamFor(id, room.roomId);
    if (param) notifyUser(id, { type: "typing", room: param, from: me.nickname });
  }
}

export async function handleClientEvent(ws: SocialSocket, raw: unknown): Promise<void> {
  const event = parseClientEvent(raw);
  if (!event) return;
  const { userId } = ws.data;
  if (event.type === "typing") {
    relayTyping(userId, event.room);
    return;
  }
  if (event.type === "hello") {
    ws.data.saveId = null;
    ws.data.clubName = null;
    if (event.saveId && isSaveIdShape(event.saveId) && isWorldMember(userId, event.saveId)) {
      ws.data.saveId = event.saveId;
      ws.data.clubName = await clubNameOf(event.saveId);
    }
  }
  const now = Date.now();
  recordPresence(userId, now);
  publishStatus(userId, now);
  sendTo(ws, { type: "pong", online: onlineCount(now) });
}

export function onSocketOpen(ws: SocialSocket): void {
  const { userId } = ws.data;
  let set = sockets.get(userId);
  if (!set) {
    set = new Set();
    sockets.set(userId, set);
  }
  set.add(ws);
  const now = Date.now();
  recordPresence(userId, now);
  publishStatus(userId, now);
}

export function onSocketClose(ws: SocialSocket): void {
  const { userId } = ws.data;
  const set = sockets.get(userId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) sockets.delete(userId);
  }
  publishStatus(userId, Date.now());
}

function sameSite(req: Request, origin: string): boolean {
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const hosts = [req.headers.get("host"), req.headers.get("x-forwarded-host")];
  try {
    hosts.push(new URL(req.url).host);
  } catch {
    // keep the headers only
  }
  return hosts.some((h) => h !== null && h === originHost);
}

/**
 * `GET /api/ws`: authenticated by the session cookie (401 without one). A browser always sends `Origin` on a
 * WebSocket handshake; another site is refused (403) so a page elsewhere cannot ride the cookie.
 */
export function handleSocialUpgrade(
  req: Request,
  server: { upgrade(req: Request, options: { data: WsData }): boolean },
): Response | undefined {
  const auth = getAuth(req);
  if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });
  const origin = req.headers.get("origin");
  if (origin && !sameSite(req, origin)) return Response.json({ error: "forbidden" }, { status: 403 });
  if (server.upgrade(req, { data: { userId: auth.userId, saveId: null, clubName: null } })) return undefined;
  return Response.json({ error: "upgrade failed" }, { status: 400 });
}

/** `websocket` of `Bun.serve` (`src/index.ts`). */
export const socialWebSocket = {
  data: {} as WsData,
  maxPayloadLength: 4096,
  idleTimeout: 120,
  sendPings: true,
  open(ws: ServerWebSocket<WsData>) {
    onSocketOpen(ws);
  },
  message(ws: ServerWebSocket<WsData>, message: string | Uint8Array) {
    void handleClientEvent(ws, typeof message === "string" ? message : null);
  },
  close(ws: ServerWebSocket<WsData>) {
    onSocketClose(ws);
  },
};
```

- [ ] **Passo 4: rodar e passar**

Run: `bun test src/backend/social/realtime.test.ts`
Expected: PASS (12 testes).

- [ ] **Passo 5: commit**

```bash
git add src/backend/social/realtime.ts src/backend/social/realtime.test.ts
git commit -m "feat(social): tempo real com presença e entrega" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 9: Rotas — perfil, busca, pedidos, amigos e bloqueios

**Arquivos:**
- Criar: `src/backend/social/socialRoutes.ts`
- Criar: `src/backend/social/socialRouteTestUtils.ts`
- Teste: `src/backend/social/socialRoutes.test.ts`

- [ ] **Passo 1: criar a rota inteira** (as rotas de sala são testadas na Tarefa 10; o arquivo nasce completo para
  não ser editado duas vezes)

`src/backend/social/socialRoutes.ts`:

```ts
// HTTP routes of friends and chat (`.claude/rules/social.md`). Every route needs a session. Responses carry
// nicknames only: never an e-mail or a user id.
import { requireAuth } from "@/backend/auth/middleware";
import { saveService } from "@/backend/SaveService";
import { canWrite, resolveRoom } from "@/backend/social/roomAccess";
import { deliverMessage, notifyFriendUpdate, notifyUser, statusOf } from "@/backend/social/realtime";
import {
  acceptRequest,
  blockUser,
  blockedEitherWay,
  cancelRequest,
  declineRequest,
  ensureFriendCode,
  findUserByFriendCode,
  findUserByNickname,
  friendIds,
  getSocialUser,
  insertMessage,
  listBlocked,
  listFriends,
  listIncoming,
  listMessages,
  listOutgoing,
  markRead,
  removeFriend,
  searchUsers,
  sendFriendRequest,
  setNickname,
  unblockUser,
  unreadCount,
  worldsOf,
  type ChatMessageRow,
  type NamedUser,
} from "@/backend/social/socialStore";
import { cleanMessageBody, rateLimit } from "@/Domain/social/message";
import { nicknameChangeableAt } from "@/Domain/social/nickname";
import { dmRoomId, worldRoomId, worldRoomParam } from "@/Domain/social/rooms";
import { SOCIAL } from "@/Domain/social/socialConfig";
import type { ChatMessageView, FriendsResponse, SocialErrorCode, SocialMe } from "@/types/socialTypes";

type ParamReq = Request & { params?: Record<string, string> };
type AuthedHandler = (req: ParamReq, userId: string) => Response | Promise<Response>;

const NICK_RE = new RegExp(`^[A-Za-z0-9_.-]{1,${SOCIAL.NICKNAME_MAX}}$`);
const MAX_BODY_BYTES = 8 * 1024;
const sendStamps = new Map<string, number[]>();

/** Tests only. */
export function resetSocialRateLimit(): void {
  sendStamps.clear();
}

function fail(error: SocialErrorCode, status: number, extra?: Record<string, unknown>): Response {
  return Response.json({ error, ...extra }, { status });
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function authed(handler: AuthedHandler) {
  return async (req: ParamReq): Promise<Response> => {
    const auth = requireAuth(req);
    if (auth instanceof Response) return auth;
    return handler(req, auth.userId);
  };
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return null;
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function param(req: ParamReq, name: string): string {
  const raw = req.params?.[name] ?? "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function myNickname(userId: string): string | null {
  return getSocialUser(userId)?.nickname ?? null;
}

function meView(userId: string, now: number): SocialMe {
  const friendCode = ensureFriendCode(userId);
  const u = getSocialUser(userId)!;
  const at = nicknameChangeableAt(u.nicknameChangedAt);
  return {
    nickname: u.nickname,
    friendCode,
    nicknameChangeableOn: u.nickname !== null && at !== null && at > now ? isoDay(at) : null,
  };
}

/** Someone `me` may send a request to; null when unknown, oneself or blocked either way (all answer 404). */
function requestTarget(me: string, body: Record<string, unknown>): NamedUser | null | "invalid" {
  if (typeof body.nickname === "string") {
    const nickname = body.nickname.trim();
    if (!NICK_RE.test(nickname)) return null;
    const u = findUserByNickname(nickname);
    return u && u.id !== me && !blockedEitherWay(me, u.id) ? u : null;
  }
  if (typeof body.code === "string") {
    const u = findUserByFriendCode(body.code);
    return u && u.nickname && u.id !== me && !blockedEitherWay(me, u.id) ? { id: u.id, nickname: u.nickname } : null;
  }
  return "invalid";
}

function messageView(row: ChatMessageRow, viewer: string): ChatMessageView {
  return { id: row.id, from: row.fromNickname ?? "", mine: row.fromUser === viewer, body: row.body, at: row.createdAt };
}

async function friendsResponse(userId: string, now: number): Promise<FriendsResponse> {
  const friends = listFriends(userId).map((f) => {
    const s = statusOf(f.id, now);
    return {
      nickname: f.nickname,
      status: s.status,
      club: s.club,
      unread: unreadCount(userId, dmRoomId(userId, f.id)),
      since: f.since,
    };
  });
  const worlds = await Promise.all(
    worldsOf(userId).map(async (saveId) => {
      const meta = await saveService.getMeta(saveId).catch(() => null);
      return {
        room: worldRoomParam(saveId),
        saveId,
        name: meta?.name ?? "",
        unread: unreadCount(userId, worldRoomId(saveId)),
      };
    }),
  );
  return {
    friends,
    incoming: listIncoming(userId).map((r) => ({ nickname: r.nickname, at: r.at })),
    outgoing: listOutgoing(userId).map((r) => ({ nickname: r.nickname, at: r.at })),
    worlds,
  };
}

export const socialRoutes = {
  "/api/social/me": {
    GET: authed((_req, userId) => Response.json(meView(userId, Date.now()))),
  },

  "/api/social/nickname": {
    PUT: authed(async (req, userId) => {
      const body = await readJson(req);
      const raw = body?.nickname;
      if (typeof raw !== "string") return fail("invalidNickname", 400);
      const now = Date.now();
      const result = setNickname(userId, raw, now);
      if (!result.ok) {
        if (result.error === "tooSoon") {
          return fail("tooSoon", 409, { nicknameChangeableOn: meView(userId, now).nicknameChangeableOn });
        }
        return fail(result.error, result.error === "invalidNickname" ? 400 : 409);
      }
      notifyFriendUpdate(friendIds(userId));
      return Response.json(meView(userId, now));
    }),
  },

  "/api/social/search": {
    GET: authed((req, userId) => {
      if (!myNickname(userId)) return fail("noNickname", 409);
      const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
      if (q.length < SOCIAL.SEARCH_MIN || !NICK_RE.test(q)) return fail("invalidQuery", 400);
      return Response.json({ results: searchUsers(userId, q) });
    }),
  },

  "/api/social/requests": {
    POST: authed(async (req, userId) => {
      const me = myNickname(userId);
      if (!me) return fail("noNickname", 409);
      const body = await readJson(req);
      if (!body) return fail("invalidBody", 400);
      const target = requestTarget(userId, body);
      if (target === "invalid") return fail("invalidBody", 400);
      if (!target) return fail("notFound", 404);
      const result = sendFriendRequest(userId, target.id, Date.now());
      if (result === "requested") {
        notifyUser(target.id, { type: "friend_request", from: me });
        return Response.json({ status: "requested", nickname: target.nickname });
      }
      if (result === "befriended") {
        notifyFriendUpdate([userId, target.id]);
        return Response.json({ status: "friends", nickname: target.nickname });
      }
      if (result === "alreadyFriends") return fail("alreadyFriends", 409);
      if (result === "limit") return fail("limit", 409);
      return fail("notFound", 404);
    }),
  },

  "/api/social/requests/:nickname": {
    DELETE: authed((req, userId) => {
      const other = findUserByNickname(param(req, "nickname"));
      if (!other || !cancelRequest(userId, other.id)) return fail("notFound", 404);
      notifyFriendUpdate([other.id]);
      return Response.json({ ok: true });
    }),
  },

  "/api/social/requests/:nickname/accept": {
    POST: authed((req, userId) => {
      const other = findUserByNickname(param(req, "nickname"));
      if (!other) return fail("notFound", 404);
      const result = acceptRequest(userId, other.id, Date.now());
      if (result === "notFound") return fail("notFound", 404);
      if (result === "limit") return fail("limit", 409);
      notifyFriendUpdate([userId, other.id]);
      return Response.json({ status: "friends", nickname: other.nickname });
    }),
  },

  "/api/social/requests/:nickname/decline": {
    POST: authed((req, userId) => {
      const other = findUserByNickname(param(req, "nickname"));
      if (!other || !declineRequest(userId, other.id)) return fail("notFound", 404);
      notifyFriendUpdate([other.id]);
      return Response.json({ ok: true });
    }),
  },

  "/api/social/friends": {
    GET: authed(async (_req, userId) => Response.json(await friendsResponse(userId, Date.now()))),
  },

  "/api/social/friends/:nickname": {
    DELETE: authed((req, userId) => {
      const other = findUserByNickname(param(req, "nickname"));
      if (!other || !removeFriend(userId, other.id)) return fail("notFound", 404);
      notifyFriendUpdate([userId, other.id]);
      return Response.json({ ok: true });
    }),
  },

  "/api/social/blocks": {
    GET: authed((_req, userId) => Response.json({ blocked: listBlocked(userId).map((u) => ({ nickname: u.nickname })) })),
    POST: authed(async (req, userId) => {
      const body = await readJson(req);
      const nickname = typeof body?.nickname === "string" ? body.nickname.trim() : "";
      if (!NICK_RE.test(nickname)) return fail("invalidBody", 400);
      const other = findUserByNickname(nickname);
      if (!other) return fail("notFound", 404);
      if (other.id === userId) return fail("invalidBody", 400);
      blockUser(userId, other.id, Date.now());
      notifyFriendUpdate([userId, other.id]);
      return Response.json({ ok: true });
    }),
  },

  "/api/social/blocks/:nickname": {
    DELETE: authed((req, userId) => {
      const other = findUserByNickname(param(req, "nickname"));
      if (!other || !unblockUser(userId, other.id)) return fail("notFound", 404);
      return Response.json({ ok: true });
    }),
  },

  "/api/social/rooms/:room/messages": {
    GET: authed((req, userId) => {
      const room = resolveRoom(userId, param(req, "room"));
      if (!room) return fail("noAccess", 403);
      const url = new URL(req.url);
      const beforeRaw = url.searchParams.get("before");
      const limitRaw = url.searchParams.get("limit");
      const before = beforeRaw === null ? undefined : Number(beforeRaw);
      const limit = limitRaw === null ? SOCIAL.PAGE_SIZE : Number(limitRaw);
      if (
        (before !== undefined && (!Number.isInteger(before) || before < 1))
        || !Number.isInteger(limit) || limit < 1 || limit > SOCIAL.PAGE_SIZE
      ) {
        return fail("invalidQuery", 400);
      }
      const rows = listMessages(room.roomId, userId, { before, limit });
      return Response.json({
        room: room.param,
        messages: rows.map((r) => messageView(r, userId)),
        hasMore: rows.length === limit,
      });
    }),
    POST: authed(async (req, userId) => {
      if (!myNickname(userId)) return fail("noNickname", 409);
      const room = resolveRoom(userId, param(req, "room"));
      if (!room || !canWrite(userId, room)) return fail("noAccess", 403);
      const json = await readJson(req);
      const body = cleanMessageBody(json?.body);
      if (!body) return fail("invalidBody", 400);
      const now = Date.now();
      const limited = rateLimit(sendStamps.get(userId) ?? [], now);
      sendStamps.set(userId, limited.stamps);
      if (!limited.allowed) return fail("rateLimited", 429);
      const row = insertMessage(room.roomId, userId, body, now);
      markRead(userId, room.roomId, row.id);
      deliverMessage(row);
      return Response.json({ room: room.param, message: messageView(row, userId) });
    }),
  },

  "/api/social/rooms/:room/read": {
    POST: authed(async (req, userId) => {
      const room = resolveRoom(userId, param(req, "room"));
      if (!room) return fail("noAccess", 403);
      const json = await readJson(req);
      const id = json?.lastReadId;
      if (typeof id !== "number" || !Number.isInteger(id) || id < 0) return fail("invalidBody", 400);
      const stored = markRead(userId, room.roomId, id);
      notifyUser(userId, { type: "read", room: room.param, lastReadId: stored });
      return Response.json({ lastReadId: stored });
    }),
  },
};
```

- [ ] **Passo 2: criar o utilitário de chamada**

`src/backend/social/socialRouteTestUtils.ts`:

```ts
// Calls a social route handler directly (no server). Tests only.
import { socialRoutes } from "@/backend/social/socialRoutes";

type Handler = (req: Request & { params: Record<string, string> }) => Response | Promise<Response>;

export interface CallResult {
  status: number;
  text: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
}

export async function callSocial(
  method: "GET" | "POST" | "PUT" | "DELETE",
  pattern: keyof typeof socialRoutes,
  token: string | null,
  opts: { body?: unknown; params?: Record<string, string>; query?: Record<string, string> } = {},
): Promise<CallResult> {
  const params = opts.params ?? {};
  let path: string = pattern;
  for (const [k, v] of Object.entries(params)) path = path.replace(`:${k}`, encodeURIComponent(v));
  const qs = opts.query ? `?${new URLSearchParams(opts.query).toString()}` : "";
  const headers: Record<string, string> = {};
  if (token) headers.cookie = `fs_session=${token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const req = new Request(`http://localhost:3000${path}${qs}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  }) as Request & { params: Record<string, string> };
  req.params = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, encodeURIComponent(v)]));
  const table = socialRoutes[pattern] as unknown as Record<string, Handler>;
  const handler = table[method];
  if (!handler) throw new Error(`no ${method} on ${pattern}`);
  const res = await handler(req);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, text, json };
}
```

- [ ] **Passo 3: escrever o teste**

`src/backend/social/socialRoutes.test.ts`:

```ts
import { beforeEach, describe, expect, test } from "bun:test";
import { DAY_MS } from "@/Domain/social/socialConfig";
import { resetPresence, recordPresence } from "@/backend/presence";
import { resetRealtime } from "@/backend/social/realtime";
import { callSocial, type CallResult } from "@/backend/social/socialRouteTestUtils";
import { resetSocialRateLimit } from "@/backend/social/socialRoutes";
import { getSocialUser } from "@/backend/social/socialStore";
import { makeUser, uniqueNick, type TestUser } from "@/backend/social/socialTestUtils";

beforeEach(() => {
  resetRealtime();
  resetPresence();
  resetSocialRateLimit();
});

function expectNoLeak(results: CallResult[], users: TestUser[]): void {
  for (const r of results) {
    for (const u of users) {
      expect(r.text).not.toContain(u.id);
      expect(r.text).not.toContain(u.email);
    }
  }
}

describe("auth", () => {
  test("every route needs a session", async () => {
    expect((await callSocial("GET", "/api/social/me", null)).status).toBe(401);
    expect((await callSocial("GET", "/api/social/friends", null)).status).toBe(401);
    expect((await callSocial("POST", "/api/social/requests", null, { body: { nickname: "abc" } })).status).toBe(401);
  });
});

describe("me and nickname", () => {
  test("me generates the code; nickname set, taken, invalid and too soon", async () => {
    const a = makeUser();
    const me = await callSocial("GET", "/api/social/me", a.token);
    expect(me.status).toBe(200);
    expect(me.json).toEqual({ nickname: null, friendCode: expect.stringMatching(/^FM-/), nicknameChangeableOn: null });

    const nick = uniqueNick("Zz");
    const set = await callSocial("PUT", "/api/social/nickname", a.token, { body: { nickname: nick } });
    expect(set.status).toBe(200);
    expect(set.json.nickname).toBe(nick);
    expect(set.json.nicknameChangeableOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const b = makeUser();
    expect((await callSocial("PUT", "/api/social/nickname", b.token, { body: { nickname: nick.toLowerCase() } })).json)
      .toEqual({ error: "nicknameTaken" });
    expect((await callSocial("PUT", "/api/social/nickname", b.token, { body: { nickname: "no way" } })).status).toBe(400);
    const again = await callSocial("PUT", "/api/social/nickname", a.token, { body: { nickname: uniqueNick() } });
    expect(again.status).toBe(409);
    expect(again.json.error).toBe("tooSoon");
    const changedAt = getSocialUser(a.id)!.nicknameChangedAt!;
    expect(again.json.nicknameChangeableOn).toBe(new Date(changedAt + 30 * DAY_MS).toISOString().slice(0, 10));
    expectNoLeak([me, set, again], [a, b]);
  });
});

describe("search and requests", () => {
  test("search needs a nickname and 3 characters; it hides blocked users", async () => {
    const base = uniqueNick("q");
    const a = makeUser(`${base}a`);
    const b = makeUser(`${base}b`);
    const noNick = makeUser();
    expect((await callSocial("GET", "/api/social/search", noNick.token, { query: { q: base } })).status).toBe(409);
    expect((await callSocial("GET", "/api/social/search", a.token, { query: { q: "ab" } })).status).toBe(400);
    const found = await callSocial("GET", "/api/social/search", a.token, { query: { q: base } });
    expect(found.json.results).toEqual([{ nickname: b.nickname, relation: "none" }]);
    await callSocial("POST", "/api/social/blocks", b.token, { body: { nickname: a.nickname } });
    const hidden = await callSocial("GET", "/api/social/search", a.token, { query: { q: base } });
    expect(hidden.json.results).toEqual([]);
    expectNoLeak([found, hidden], [a, b]);
  });

  test("by nickname or code; crossed requests become a friendship; accept, decline, cancel", async () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    const c = makeUser(uniqueNick());
    const sent = await callSocial("POST", "/api/social/requests", a.token, { body: { nickname: b.nickname } });
    expect(sent.json).toEqual({ status: "requested", nickname: b.nickname });

    const bMe = await callSocial("GET", "/api/social/me", b.token);
    const cross = await callSocial("POST", "/api/social/requests", b.token, {
      body: { code: (bMe.json.friendCode as string).toLowerCase() },
    });
    expect(cross.status).toBe(404); // own code

    const aCode = (await callSocial("GET", "/api/social/me", a.token)).json.friendCode as string;
    const friends = await callSocial("POST", "/api/social/requests", b.token, { body: { code: aCode } });
    expect(friends.json).toEqual({ status: "friends", nickname: a.nickname });
    expect((await callSocial("POST", "/api/social/requests", a.token, { body: { nickname: b.nickname } })).json)
      .toEqual({ error: "alreadyFriends" });

    await callSocial("POST", "/api/social/requests", c.token, { body: { nickname: a.nickname } });
    const list = await callSocial("GET", "/api/social/friends", a.token);
    expect(list.json.friends).toEqual([
      { nickname: b.nickname, status: "offline", club: null, unread: 0, since: expect.any(Number) },
    ]);
    expect(list.json.incoming).toEqual([{ nickname: c.nickname, at: expect.any(Number) }]);
    expect((await callSocial("POST", "/api/social/requests/:nickname/decline", a.token, { params: { nickname: c.nickname! } })).status)
      .toBe(200);
    await callSocial("POST", "/api/social/requests", c.token, { body: { nickname: a.nickname } });
    expect((await callSocial("DELETE", "/api/social/requests/:nickname", c.token, { params: { nickname: a.nickname! } })).status)
      .toBe(200);
    await callSocial("POST", "/api/social/requests", c.token, { body: { nickname: a.nickname } });
    expect((await callSocial("POST", "/api/social/requests/:nickname/accept", a.token, { params: { nickname: c.nickname! } })).json)
      .toEqual({ status: "friends", nickname: c.nickname });
    expect((await callSocial("POST", "/api/social/requests/:nickname/accept", a.token, { params: { nickname: c.nickname! } })).status)
      .toBe(404);
    expectNoLeak([sent, bMe, friends, list], [a, b, c]);
  });

  test("unknown targets and bad bodies", async () => {
    const a = makeUser(uniqueNick());
    expect((await callSocial("POST", "/api/social/requests", a.token, { body: { nickname: uniqueNick() } })).status).toBe(404);
    expect((await callSocial("POST", "/api/social/requests", a.token, { body: { code: "FM-2222-2222" } })).status).toBe(404);
    expect((await callSocial("POST", "/api/social/requests", a.token, { body: {} })).status).toBe(400);
    expect((await callSocial("POST", "/api/social/requests", makeUser().token, { body: { nickname: a.nickname } })).status)
      .toBe(409);
  });

  test("a blocked user's request answers 404, like an unknown nickname", async () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    await callSocial("POST", "/api/social/blocks", a.token, { body: { nickname: b.nickname } });
    expect((await callSocial("POST", "/api/social/requests", b.token, { body: { nickname: a.nickname } })).json)
      .toEqual({ error: "notFound" });
  });
});

describe("friends and blocks", () => {
  test("friend status follows presence; unfriend; block lists and unblock", async () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    await callSocial("POST", "/api/social/requests", a.token, { body: { nickname: b.nickname } });
    await callSocial("POST", "/api/social/requests/:nickname/accept", b.token, { params: { nickname: a.nickname! } });
    recordPresence(b.id, Date.now());
    const online = await callSocial("GET", "/api/social/friends", a.token);
    expect(online.json.friends[0]).toMatchObject({ nickname: b.nickname, status: "online" });
    expect((await callSocial("DELETE", "/api/social/friends/:nickname", a.token, { params: { nickname: b.nickname! } })).status)
      .toBe(200);
    expect((await callSocial("GET", "/api/social/friends", a.token)).json.friends).toEqual([]);

    expect((await callSocial("POST", "/api/social/blocks", a.token, { body: { nickname: b.nickname } })).status).toBe(200);
    const blocked = await callSocial("GET", "/api/social/blocks", a.token);
    expect(blocked.json).toEqual({ blocked: [{ nickname: b.nickname }] });
    expect((await callSocial("POST", "/api/social/blocks", a.token, { body: { nickname: a.nickname } })).status).toBe(400);
    expect((await callSocial("DELETE", "/api/social/blocks/:nickname", a.token, { params: { nickname: b.nickname! } })).status)
      .toBe(200);
    expect((await callSocial("GET", "/api/social/friends", a.token)).json.friends).toEqual([]);
    expectNoLeak([online, blocked], [a, b]);
  });
});
```

- [ ] **Passo 4: rodar e passar**

Run: `bun test src/backend/social/socialRoutes.test.ts`
Expected: PASS (8 testes).

- [ ] **Passo 5: commit**

```bash
git add src/backend/social/socialRoutes.ts src/backend/social/socialRouteTestUtils.ts src/backend/social/socialRoutes.test.ts
git commit -m "feat(social): rotas de apelido, busca, pedidos, amigos e bloqueios" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 10: Rotas — salas e mensagens

**Arquivos:**
- Teste: `src/backend/social/socialRooms.test.ts` (as rotas já existem desde a Tarefa 9)

- [ ] **Passo 1: escrever o teste**

`src/backend/social/socialRooms.test.ts`:

```ts
import { beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { resetPresence } from "@/backend/presence";
import { resetRealtime } from "@/backend/social/realtime";
import { callSocial } from "@/backend/social/socialRouteTestUtils";
import { resetSocialRateLimit } from "@/backend/social/socialRoutes";
import { addWorldMember, befriend } from "@/backend/social/socialStore";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";
import { SOCIAL } from "@/Domain/social/socialConfig";

beforeEach(() => {
  resetRealtime();
  resetPresence();
  resetSocialRateLimit();
});

function friends() {
  const a = makeUser(uniqueNick());
  const b = makeUser(uniqueNick());
  befriend(a.id, b.id, Date.now());
  return { a, b };
}

const post = (token: string, room: string, body: unknown) =>
  callSocial("POST", "/api/social/rooms/:room/messages", token, { params: { room }, body: { body } });
const history = (token: string, room: string, query?: Record<string, string>) =>
  callSocial("GET", "/api/social/rooms/:room/messages", token, { params: { room }, query });

describe("direct messages", () => {
  test("friends write and read; the other side sees it under the sender's name", async () => {
    const { a, b } = friends();
    const sent = await post(a.token, `dm:${b.nickname}`, " oi! ");
    expect(sent.status).toBe(200);
    expect(sent.json).toEqual({
      room: `dm:${b.nickname}`,
      message: { id: expect.any(Number), from: a.nickname, mine: true, body: "oi!", at: expect.any(Number) },
    });
    const seen = await history(b.token, `dm:${a.nickname}`);
    expect(seen.json.messages).toEqual([{ ...sent.json.message, mine: false }]);
    expect(seen.json.hasMore).toBe(false);
    const list = await callSocial("GET", "/api/social/friends", b.token);
    expect(list.json.friends[0].unread).toBe(1);
    const read = await callSocial("POST", "/api/social/rooms/:room/read", b.token, {
      params: { room: `dm:${a.nickname}` },
      body: { lastReadId: sent.json.message.id },
    });
    expect(read.json).toEqual({ lastReadId: sent.json.message.id });
    expect((await callSocial("GET", "/api/social/friends", b.token)).json.friends[0].unread).toBe(0);
    for (const r of [sent, seen, list, read]) {
      for (const u of [a, b]) {
        expect(r.text).not.toContain(u.id);
        expect(r.text).not.toContain(u.email);
      }
    }
  });

  test("only between friends: a stranger, an unknown nickname and after a block get 403", async () => {
    const { a, b } = friends();
    const c = makeUser(uniqueNick());
    expect((await post(c.token, `dm:${a.nickname}`, "oi")).json).toEqual({ error: "noAccess" });
    expect((await post(a.token, `dm:${uniqueNick()}`, "oi")).status).toBe(403);
    await callSocial("POST", "/api/social/blocks", b.token, { body: { nickname: a.nickname } });
    expect((await post(a.token, `dm:${b.nickname}`, "oi")).status).toBe(403);
    expect((await post(b.token, `dm:${a.nickname}`, "oi")).status).toBe(403);
  });

  test("the blocker no longer sees the blocked's old messages", async () => {
    const { a, b } = friends();
    await post(b.token, `dm:${a.nickname}`, "antes");
    await post(a.token, `dm:${b.nickname}`, "minha");
    await callSocial("POST", "/api/social/blocks", a.token, { body: { nickname: b.nickname } });
    expect((await history(a.token, `dm:${b.nickname}`)).json.messages.map((m: { body: string }) => m.body)).toEqual(["minha"]);
  });

  test("invalid bodies and the 10-in-10 s limit", async () => {
    const { a, b } = friends();
    const room = `dm:${b.nickname}`;
    expect((await post(a.token, room, "   ")).json).toEqual({ error: "invalidBody" });
    expect((await post(a.token, room, "x".repeat(SOCIAL.MESSAGE_MAX + 1))).status).toBe(400);
    expect((await post(a.token, room, 7)).status).toBe(400);
    for (let i = 0; i < SOCIAL.RATE_MAX; i++) expect((await post(a.token, room, `m${i}`)).status).toBe(200);
    expect((await post(a.token, room, "one too many")).json).toEqual({ error: "rateLimited" });
  });

  test("history pages of 50 with before", async () => {
    const { a, b } = friends();
    const room = `dm:${b.nickname}`;
    for (let i = 0; i < 55; i++) {
      resetSocialRateLimit();
      await post(a.token, room, `m${i}`);
    }
    const first = await history(a.token, room);
    expect(first.json.messages).toHaveLength(50);
    expect(first.json.hasMore).toBe(true);
    const older = await history(a.token, room, { before: String(first.json.messages[0].id) });
    expect(older.json.messages.map((m: { body: string }) => m.body)).toEqual(["m0", "m1", "m2", "m3", "m4"]);
    expect((await history(a.token, room, { limit: "51" })).status).toBe(400);
    expect((await history(a.token, room, { before: "-3" })).status).toBe(400);
  });

  test("read needs a valid id and access", async () => {
    const { a, b } = friends();
    expect((await callSocial("POST", "/api/social/rooms/:room/read", a.token, {
      params: { room: `dm:${b.nickname}` }, body: { lastReadId: "x" },
    })).status).toBe(400);
    expect((await callSocial("POST", "/api/social/rooms/:room/read", a.token, {
      params: { room: "world:not-a-save" }, body: { lastReadId: 1 },
    })).status).toBe(403);
  });
});

describe("world rooms", () => {
  test("only members of a world with two members; it shows in the friends response", async () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    const c = makeUser(uniqueNick());
    const saveId = randomUUID();
    const room = `world:${saveId}`;
    recordSaveOwnership(saveId, a.id);
    expect((await post(a.token, room, "sozinho")).status).toBe(403);
    addWorldMember(saveId, b.id, "member");
    expect((await post(a.token, room, "bem-vindo")).status).toBe(200);
    expect((await history(b.token, room)).json.messages.map((m: { body: string }) => m.body)).toEqual(["bem-vindo"]);
    expect((await history(c.token, room)).status).toBe(403);
    expect((await post(c.token, room, "oi")).status).toBe(403);
    const list = await callSocial("GET", "/api/social/friends", b.token);
    expect(list.json.worlds).toEqual([{ room, saveId, name: "", unread: 1 }]);
  });
});
```

- [ ] **Passo 2: rodar e passar**

Run: `bun test src/backend/social/socialRooms.test.ts`
Expected: PASS (7 testes). Se algum falhar, a correção vai em `socialRoutes.ts` (Tarefa 9), nunca no teste.

- [ ] **Passo 3: commit**

```bash
git add src/backend/social/socialRooms.test.ts
git commit -m "test(social): salas, histórico, lido e limite de envio" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 11: Servidor — `/api/ws`, rotas, manutenção e teste com sockets reais

**Arquivos:**
- Criar: `src/backend/social/maintenance.ts`
- Modificar: `src/backend/routes.ts` (import e `...socialRoutes` depois de `...newsRoutes`, linha ~124)
- Modificar: `src/index.ts`
- Teste: `src/backend/social/realtime.server.test.ts`

- [ ] **Passo 1: escrever o teste que falha**

`src/backend/social/realtime.server.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { resetPresence } from "@/backend/presence";
import { withJsonErrors } from "@/backend/routeErrors";
import { handleSocialUpgrade, resetRealtime, setClubNameResolver, socialWebSocket } from "@/backend/social/realtime";
import { resetSocialRateLimit, socialRoutes } from "@/backend/social/socialRoutes";
import { befriend } from "@/backend/social/socialStore";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";
import type { ServerEvent } from "@/types/socialTypes";

let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    routes: withJsonErrors(socialRoutes),
    fetch(req, srv) {
      if (new URL(req.url).pathname === "/api/ws") return handleSocialUpgrade(req, srv);
      return new Response("Not Found", { status: 404 });
    },
    websocket: socialWebSocket,
  });
});

afterAll(() => {
  server.stop(true);
});

beforeEach(() => {
  resetRealtime();
  resetPresence();
  resetSocialRateLimit();
});

interface Client {
  ws: WebSocket;
  events: ServerEvent[];
}

function connect(token: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    const events: ServerEvent[] = [];
    // Bun's WebSocket takes request headers as a second-argument option.
    const ws = new WebSocket(`ws://localhost:${server.port}/api/ws`, {
      headers: { cookie: `fs_session=${token}` },
    } as unknown as string[]);
    ws.onmessage = (e) => events.push(JSON.parse(String(e.data)) as ServerEvent);
    ws.onopen = () => resolve({ ws, events });
    ws.onerror = (e) => reject(e);
  });
}

async function waitFor(events: ServerEvent[], pred: (e: ServerEvent) => boolean, ms = 2000): Promise<ServerEvent> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const hit = events.find(pred);
    if (hit) return hit;
    await Bun.sleep(10);
  }
  throw new Error("timed out waiting for a socket event");
}

const base = () => `http://localhost:${server.port}`;

test("the socket needs a session (checked before the upgrade)", async () => {
  const res = await fetch(`${base()}/api/ws`);
  expect(res.status).toBe(401);
});

test("a message sent over HTTP reaches the friend's socket", async () => {
  const a = makeUser(uniqueNick());
  const b = makeUser(uniqueNick());
  befriend(a.id, b.id, Date.now());
  const cb = await connect(b.token);
  const res = await fetch(`${base()}/api/social/rooms/${encodeURIComponent(`dm:${b.nickname}`)}/messages`, {
    method: "POST",
    headers: { cookie: `fs_session=${a.token}`, "content-type": "application/json" },
    body: JSON.stringify({ body: "jogo às 20h?" }),
  });
  expect(res.status).toBe(200);
  const got = await waitFor(cb.events, (e) => e.type === "message");
  expect(got).toMatchObject({ type: "message", room: `dm:${a.nickname}`, message: { from: a.nickname, body: "jogo às 20h?", mine: false } });
  cb.ws.close();
});

test("hello with an own save shows the friend as playing with the club", async () => {
  const a = makeUser(uniqueNick());
  const b = makeUser(uniqueNick());
  befriend(a.id, b.id, Date.now());
  const saveId = randomUUID();
  recordSaveOwnership(saveId, a.id);
  setClubNameResolver(async () => "Fluminense");
  const cb = await connect(b.token);
  const ca = await connect(a.token);
  ca.ws.send(JSON.stringify({ type: "hello", saveId }));
  const got = await waitFor(cb.events, (e) => e.type === "presence" && e.status === "playing");
  expect(got).toEqual({ type: "presence", nickname: a.nickname, status: "playing", club: "Fluminense" });
  await waitFor(ca.events, (e) => e.type === "pong");
  ca.ws.close();
  cb.ws.close();
});

test("a blocked user receives nothing from the one who blocked", async () => {
  const a = makeUser(uniqueNick());
  const b = makeUser(uniqueNick());
  befriend(a.id, b.id, Date.now());
  await fetch(`${base()}/api/social/blocks`, {
    method: "POST",
    headers: { cookie: `fs_session=${a.token}`, "content-type": "application/json" },
    body: JSON.stringify({ nickname: b.nickname }),
  });
  const cb = await connect(b.token);
  const ca = await connect(a.token);
  ca.ws.send(JSON.stringify({ type: "ping" }));
  const res = await fetch(`${base()}/api/social/rooms/${encodeURIComponent(`dm:${b.nickname}`)}/messages`, {
    method: "POST",
    headers: { cookie: `fs_session=${a.token}`, "content-type": "application/json" },
    body: JSON.stringify({ body: "oi" }),
  });
  expect(res.status).toBe(403);
  await Bun.sleep(300);
  expect(cb.events.filter((e) => e.type === "message" || e.type === "presence")).toEqual([]);
  ca.ws.close();
  cb.ws.close();
});
```

- [ ] **Passo 2: rodar** (o teste usa só módulos já prontos; ele confere o `Bun.serve` com `routes` + `fetch` + `websocket`)

Run: `bun test src/backend/social/realtime.server.test.ts`
Expected: PASS (4 testes). Se o socket de teste não abrir com o cookie, confira a versão do Bun (`bun --version`,
1.4.x) antes de mexer no código.

- [ ] **Passo 3: criar a manutenção**

`src/backend/social/maintenance.ts`:

```ts
import { logError } from "@/Logger";
import { sweepStatuses } from "@/backend/social/realtime";
import { purgeOldMessages } from "@/backend/social/socialStore";

const PURGE_EVERY_MS = 24 * 60 * 60 * 1000;
const SWEEP_EVERY_MS = 30_000;

/** Daily 90-day cleanup (also once at start) and the 30-second presence sweep. Returns a stop function. */
export function startSocialMaintenance(): () => void {
  const purge = () => {
    try {
      purgeOldMessages(Date.now());
    } catch (e) {
      logError("social", "purge of old chat messages failed", e);
    }
  };
  purge();
  const purgeTimer = setInterval(purge, PURGE_EVERY_MS);
  const sweepTimer = setInterval(() => sweepStatuses(Date.now()), SWEEP_EVERY_MS);
  return () => {
    clearInterval(purgeTimer);
    clearInterval(sweepTimer);
  };
}
```

- [ ] **Passo 4: ligar as rotas e o socket**

Em `src/backend/routes.ts`, junto dos imports (depois de `import { newsRoutes } from "@/backend/newsRoutes";`):

```ts
import { socialRoutes } from "@/backend/social/socialRoutes";
```

e dentro de `withJsonErrors({ ... })`, depois de `...newsRoutes,`:

```ts
  ...socialRoutes,
```

Em `src/index.ts`, acrescentar os imports depois de `import { apiRoutes } from "@/backend/routes";`:

```ts
import { handleSocialUpgrade, socialWebSocket } from "@/backend/social/realtime";
import { startSocialMaintenance } from "@/backend/social/maintenance";
```

e trocar o trecho

```ts
    ...apiRoutes,
  },

  idleTimeout: 120,
```

por

```ts
    ...apiRoutes,
  },

  // Friends and chat (`.claude/rules/social.md`): the WebSocket upgrade lives in `fetch` (the fallback for paths
  // no route matched), the socket handlers in `websocket`.
  fetch(req, srv) {
    if (new URL(req.url).pathname === "/api/ws") return handleSocialUpgrade(req, srv);
    return new Response("Not Found", { status: 404 });
  },

  websocket: socialWebSocket,

  idleTimeout: 120,
```

e, depois do `console.log` do fim do arquivo:

```ts
startSocialMaintenance();
```

- [ ] **Passo 5: conferir que o servidor sobe**

Run: `NODE_ENV=development timeout 15 bun src/index.ts` (no PowerShell: `$env:NODE_ENV="development"; Start-Process bun -ArgumentList "src/index.ts" -WorkingDirectory "C:\Projects\FMProject-chat"` e pare depois de ver a linha)
Expected: `🚀 Server running at http://localhost:3000/` sem erro; `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/ws` → `401`.

- [ ] **Passo 6: rodar os testes do backend social**

Run: `bun test src/backend/social src/backend/db.social.test.ts src/backend/auth`
Expected: PASS.

- [ ] **Passo 7: commit**

```bash
git add src/backend/social/maintenance.ts src/backend/social/realtime.server.test.ts src/backend/routes.ts src/index.ts
git commit -m "feat(social): WebSocket em /api/ws, rotas e limpeza diária" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 12: Dev-login com um segundo usuário (só em desenvolvimento)

Para testar o chat no navegador são precisos dois usuários. O dev-login ganha `?as=<apelido curto>`
(`[a-z0-9]{1,16}`) que entra como `dev-<as>@localhost`, **depois** das quatro travas que já existem (nada muda em
produção: a rota continua 404 fora de `DEV_AUTO_LOGIN=1` + `NODE_ENV=development` + host e socket de loopback, e
`devAutoLogin` continua recusando `NODE_ENV=production`). Duas sessões no mesmo navegador: uma aba em
`http://localhost:3000` e outra em `http://127.0.0.1:3000` (o cookie é por host).

**Arquivos:**
- Modificar: `src/backend/auth/routes.ts` (rota `/api/auth/dev-login`, linhas 120–131)
- Teste: `src/backend/auth/devLogin.test.ts` (acrescentar um `describe` ao fim)

- [ ] **Passo 1: escrever o teste que falha** — acrescentar ao fim de `src/backend/auth/devLogin.test.ts`:

```ts
describe("GET /api/auth/dev-login?as= (second dev user)", () => {
  test("logs in as dev-<as>@localhost", async () => {
    process.env.DEV_AUTO_LOGIN = "1";
    process.env.NODE_ENV = "development";
    const res = await handler()(new Request("http://127.0.0.1:3000/api/auth/dev-login?as=2"), LOOPBACK);
    expect(res.status).toBe(302);
    const token = decodeURIComponent(res.headers.get("Set-Cookie")!.split(";")[0]!.split("=")[1]!);
    const { getSessionByToken } = await import("@/backend/auth/AuthService");
    expect(getSessionByToken(token)!.user.email).toBe("dev-2@localhost");
  });

  test("400 for an alias outside [a-z0-9]{1,16}", async () => {
    process.env.DEV_AUTO_LOGIN = "1";
    process.env.NODE_ENV = "development";
    for (const as of ["", "Two", "a@b", "x".repeat(17)]) {
      const res = await handler()(new Request(`http://localhost:3000/api/auth/dev-login?as=${encodeURIComponent(as)}`), LOOPBACK);
      expect(res.status).toBe(400);
    }
  });

  test("still 404 in production, with or without as", async () => {
    process.env.DEV_AUTO_LOGIN = "1";
    process.env.NODE_ENV = "production";
    const res = await handler()(new Request("http://localhost:3000/api/auth/dev-login?as=2"), LOOPBACK);
    expect(res.status).toBe(404);
  });

  test("still 404 from a non-loopback socket", async () => {
    process.env.DEV_AUTO_LOGIN = "1";
    process.env.NODE_ENV = "development";
    const res = await handler()(new Request("http://localhost:3000/api/auth/dev-login?as=2"), stubServer("10.0.0.5"));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `bun test src/backend/auth/devLogin.test.ts`
Expected: FAIL — o primeiro teste novo recebe `dev@localhost` e o segundo recebe 302.

- [ ] **Passo 3: implementar** — em `src/backend/auth/routes.ts`, logo abaixo de `const DEV_LOGIN_EMAIL = "dev@localhost";`:

```ts
/** `?as=<alias>` logs in as `dev-<alias>@localhost` — a second local user to test friends and chat. */
const DEV_LOGIN_ALIAS_RE = /^[a-z0-9]{1,16}$/;
```

e trocar o corpo da rota `"/api/auth/dev-login"` por:

```ts
  "/api/auth/dev-login": async (req: Request, server: RequestIPServer) => {
    if (!isDevAutoLoginAllowed(req, server)) return new Response("Not Found", { status: 404 });

    const alias = new URL(req.url).searchParams.get("as");
    if (alias !== null && !DEV_LOGIN_ALIAS_RE.test(alias)) return new Response("Bad Request", { status: 400 });
    const email = alias === null ? DEV_LOGIN_EMAIL : `dev-${alias}@localhost`;

    const { session } = devAutoLogin(email);
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/start",
        "Set-Cookie": setSessionCookieHeader(session.token, session.expiresAt),
      },
    });
  },
```

- [ ] **Passo 4: rodar e passar**

Run: `bun test src/backend/auth`
Expected: PASS (os testes antigos do dev-login continuam verdes).

- [ ] **Passo 5: documentar** — em `.claude/rules/dev-login.md`, acrescentar ao fim da seção "Usage":

```markdown
**Second user (friends and chat):** `http://127.0.0.1:3000/api/auth/dev-login?as=2` logs in as
`dev-2@localhost` (alias `[a-z0-9]{1,16}`, 400 otherwise). Same four gates as above, checked first: in
production and from a non-loopback socket it is still 404. Use `localhost` in one tab and `127.0.0.1` in another:
the session cookie is per host, so the two tabs stay two users.
```

- [ ] **Passo 6: commit**

```bash
git add src/backend/auth/routes.ts src/backend/auth/devLogin.test.ts .claude/rules/dev-login.md
git commit -m "feat(auth): segundo usuário no dev-login para testar o chat" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 13: Cliente — API, estado puro e janelas

**Arquivos:**
- Criar: `src/GameInterface/Social/socialApi.ts`, `socialState.ts`, `chatDock.ts`
- Teste: `src/GameInterface/Social/socialState.test.ts`, `src/GameInterface/Social/chatDock.test.ts`

- [ ] **Passo 1: escrever os testes que falham**

`src/GameInterface/Social/socialState.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  applyPresence,
  groupFriends,
  mergeMessages,
  onlineFriendCount,
  parseServerEvent,
  totalUnread,
  unreadFromLists,
} from "@/GameInterface/Social/socialState";
import type { FriendView } from "@/types/socialTypes";

const f = (nickname: string, status: FriendView["status"], club: string | null = null): FriendView =>
  ({ nickname, status, club, unread: 0, since: 0 });

test("groups by status, sorted by nickname ignoring case", () => {
  const g = groupFriends([f("bia", "online"), f("Ana", "online"), f("Caio", "playing", "Flu"), f("Davi", "offline")]);
  expect(g.playing.map((x) => x.nickname)).toEqual(["Caio"]);
  expect(g.online.map((x) => x.nickname)).toEqual(["Ana", "bia"]);
  expect(g.offline.map((x) => x.nickname)).toEqual(["Davi"]);
  expect(onlineFriendCount([f("a", "online"), f("b", "playing"), f("c", "offline")])).toBe(2);
});

test("mergeMessages dedupes by id and sorts ascending", () => {
  const m = (id: number) => ({ id, from: "x", mine: false, body: String(id), at: id });
  expect(mergeMessages([m(3), m(1)], [m(2), m(3)]).map((x) => x.id)).toEqual([1, 2, 3]);
});

test("unread from the lists and the total", () => {
  const unread = unreadFromLists({
    friends: [{ ...f("Ana", "online"), unread: 2 }, f("Bia", "offline")],
    incoming: [],
    outgoing: [],
    worlds: [{ room: "world:x", saveId: "x", name: "Mundo", unread: 1 }],
  });
  expect(unread).toEqual({ "dm:Ana": 2, "world:x": 1 });
  expect(totalUnread(unread)).toBe(3);
});

test("applyPresence updates only the matching friend", () => {
  const next = applyPresence([f("Ana", "offline"), f("Bia", "online")], { nickname: "Ana", status: "playing", club: "Bahia" });
  expect(next).toEqual([f("Ana", "playing", "Bahia"), f("Bia", "online")]);
});

describe("parseServerEvent", () => {
  test("accepts known events", () => {
    expect(parseServerEvent(JSON.stringify({ type: "pong", online: 3 }))).toEqual({ type: "pong", online: 3 });
    expect(parseServerEvent(JSON.stringify({ type: "friend_update" }))).toEqual({ type: "friend_update" });
  });
  test("rejects garbage", () => {
    expect(parseServerEvent("nope")).toBeNull();
    expect(parseServerEvent(JSON.stringify({ type: "message", room: 1 }))).toBeNull();
    expect(parseServerEvent(JSON.stringify({ type: "other" }))).toBeNull();
  });
});
```

`src/GameInterface/Social/chatDock.test.ts`:

```ts
import { expect, test } from "bun:test";
import { closeInDock, isRoomVisible, openInDock, parseDock, toggleInDock } from "@/GameInterface/Social/chatDock";

test("opening a fourth chat minimizes the oldest open one", () => {
  let dock = openInDock([], "dm:a");
  dock = openInDock(dock, "dm:b");
  dock = openInDock(dock, "dm:c");
  dock = openInDock(dock, "dm:d");
  expect(dock).toEqual([
    { room: "dm:a", minimized: true },
    { room: "dm:b", minimized: false },
    { room: "dm:c", minimized: false },
    { room: "dm:d", minimized: false },
  ]);
});

test("reopening a minimized chat brings it to the end, open", () => {
  const dock = toggleInDock([{ room: "dm:a", minimized: true }, { room: "dm:b", minimized: false }], "dm:a");
  expect(dock).toEqual([{ room: "dm:b", minimized: false }, { room: "dm:a", minimized: false }]);
  expect(toggleInDock(dock, "dm:a")).toEqual([{ room: "dm:b", minimized: false }, { room: "dm:a", minimized: true }]);
  expect(closeInDock(dock, "dm:b")).toEqual([{ room: "dm:a", minimized: false }]);
  expect(isRoomVisible(dock, "dm:a")).toBe(true);
  expect(isRoomVisible([{ room: "dm:a", minimized: true }], "dm:a")).toBe(false);
});

test("parseDock keeps only valid entries and the open limit", () => {
  const raw = JSON.stringify([
    { room: "dm:a", minimized: false },
    { room: "lobby", minimized: false },
    { room: "dm:b", minimized: "no" },
    { room: "dm:c", minimized: false },
    { room: "dm:d", minimized: false },
    { room: "world:x", minimized: false },
  ]);
  expect(parseDock(raw)).toEqual([
    { room: "dm:a", minimized: true },
    { room: "dm:c", minimized: false },
    { room: "dm:d", minimized: false },
    { room: "world:x", minimized: false },
  ]);
  expect(parseDock("not json")).toEqual([]);
  expect(parseDock(null)).toEqual([]);
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `bun test src/GameInterface/Social`
Expected: FAIL — módulos não encontrados.

- [ ] **Passo 3: implementar**

`src/GameInterface/Social/socialApi.ts`:

```ts
import type {
  ChatMessageView,
  FriendsResponse,
  MessagesResponse,
  SearchResult,
  SocialErrorCode,
  SocialMe,
} from "@/types/socialTypes";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: SocialErrorCode };

export interface RequestAnswer {
  status: "requested" | "friends";
  nickname: string;
}

const KNOWN_ERRORS: ReadonlySet<string> = new Set<SocialErrorCode>([
  "invalidNickname", "nicknameTaken", "tooSoon", "noNickname", "invalidQuery", "notFound", "alreadyFriends",
  "limit", "invalidBody", "noAccess", "rateLimited", "unauthorized", "network",
]);

async function call<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as unknown;
    if (res.ok) return { ok: true, data: data as T };
    const code = (data as { error?: unknown } | null)?.error;
    const error: SocialErrorCode =
      typeof code === "string" && KNOWN_ERRORS.has(code) ? (code as SocialErrorCode) : res.status === 401 ? "unauthorized" : "network";
    return { ok: false, status: res.status, error };
  } catch {
    return { ok: false, status: 0, error: "network" };
  }
}

const seg = encodeURIComponent;

export const socialApi = {
  me: () => call<SocialMe>("GET", "/api/social/me"),
  setNickname: (nickname: string) => call<SocialMe>("PUT", "/api/social/nickname", { nickname }),
  search: (q: string) => call<{ results: SearchResult[] }>("GET", `/api/social/search?q=${seg(q)}`),
  requestByNickname: (nickname: string) => call<RequestAnswer>("POST", "/api/social/requests", { nickname }),
  requestByCode: (code: string) => call<RequestAnswer>("POST", "/api/social/requests", { code }),
  accept: (nickname: string) => call<RequestAnswer>("POST", `/api/social/requests/${seg(nickname)}/accept`),
  decline: (nickname: string) => call<{ ok: true }>("POST", `/api/social/requests/${seg(nickname)}/decline`),
  cancel: (nickname: string) => call<{ ok: true }>("DELETE", `/api/social/requests/${seg(nickname)}`),
  friends: () => call<FriendsResponse>("GET", "/api/social/friends"),
  unfriend: (nickname: string) => call<{ ok: true }>("DELETE", `/api/social/friends/${seg(nickname)}`),
  block: (nickname: string) => call<{ ok: true }>("POST", "/api/social/blocks", { nickname }),
  unblock: (nickname: string) => call<{ ok: true }>("DELETE", `/api/social/blocks/${seg(nickname)}`),
  blocks: () => call<{ blocked: { nickname: string }[] }>("GET", "/api/social/blocks"),
  messages: (room: string, before?: number) =>
    call<MessagesResponse>("GET", `/api/social/rooms/${seg(room)}/messages${before ? `?before=${before}` : ""}`),
  send: (room: string, body: string) =>
    call<{ room: string; message: ChatMessageView }>("POST", `/api/social/rooms/${seg(room)}/messages`, { body }),
  read: (room: string, lastReadId: number) =>
    call<{ lastReadId: number }>("POST", `/api/social/rooms/${seg(room)}/read`, { lastReadId }),
};
```

`src/GameInterface/Social/socialState.ts`:

```ts
import { dmRoomParam } from "@/Domain/social/rooms";
import type { ChatMessageView, FriendStatus, FriendView, FriendsResponse, ServerEvent } from "@/types/socialTypes";

export interface FriendGroups {
  playing: FriendView[];
  online: FriendView[];
  offline: FriendView[];
}

const byNickname = (a: FriendView, b: FriendView) => a.nickname.localeCompare(b.nickname, undefined, { sensitivity: "base" });

export function groupFriends(friends: readonly FriendView[]): FriendGroups {
  const sorted = [...friends].sort(byNickname);
  return {
    playing: sorted.filter((f) => f.status === "playing"),
    online: sorted.filter((f) => f.status === "online"),
    offline: sorted.filter((f) => f.status === "offline"),
  };
}

export function onlineFriendCount(friends: readonly FriendView[]): number {
  return friends.filter((f) => f.status !== "offline").length;
}

export function mergeMessages(prev: readonly ChatMessageView[], incoming: readonly ChatMessageView[]): ChatMessageView[] {
  const byId = new Map<number, ChatMessageView>();
  for (const m of prev) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/** Unread count per room as the client names it (only rooms with something unread). */
export function unreadFromLists(lists: FriendsResponse): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of lists.friends) if (f.unread > 0) out[dmRoomParam(f.nickname)] = f.unread;
  for (const w of lists.worlds) if (w.unread > 0) out[w.room] = w.unread;
  return out;
}

export function totalUnread(unread: Readonly<Record<string, number>>): number {
  return Object.values(unread).reduce((sum, n) => sum + n, 0);
}

export function applyPresence(
  friends: readonly FriendView[],
  p: { nickname: string; status: FriendStatus; club: string | null },
): FriendView[] {
  return friends.map((f) => (f.nickname === p.nickname ? { ...f, status: p.status, club: p.club } : f));
}

const STATUSES: ReadonlySet<string> = new Set(["online", "offline", "playing"]);

/** A socket frame from the server, validated; null for anything unexpected. */
export function parseServerEvent(raw: unknown): ServerEvent | null {
  if (typeof raw !== "string") return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const e = v as Record<string, unknown>;
  const str = (x: unknown): x is string => typeof x === "string";
  switch (e.type) {
    case "message": {
      const m = e.message as Record<string, unknown> | undefined;
      if (!str(e.room) || !m || typeof m.id !== "number" || !str(m.from) || typeof m.mine !== "boolean" || !str(m.body) || typeof m.at !== "number") return null;
      return { type: "message", room: e.room, message: { id: m.id, from: m.from, mine: m.mine, body: m.body, at: m.at } };
    }
    case "presence":
      if (!str(e.nickname) || !str(e.status) || !STATUSES.has(e.status) || !(e.club === null || str(e.club))) return null;
      return { type: "presence", nickname: e.nickname, status: e.status as FriendStatus, club: e.club as string | null };
    case "friend_request":
      return str(e.from) ? { type: "friend_request", from: e.from } : null;
    case "friend_update":
      return { type: "friend_update" };
    case "read":
      return str(e.room) && typeof e.lastReadId === "number" ? { type: "read", room: e.room, lastReadId: e.lastReadId } : null;
    case "typing":
      return str(e.room) && str(e.from) ? { type: "typing", room: e.room, from: e.from } : null;
    case "pong":
      return typeof e.online === "number" ? { type: "pong", online: e.online } : null;
    default:
      return null;
  }
}
```

`src/GameInterface/Social/chatDock.ts`:

```ts
import { SOCIAL } from "@/Domain/social/socialConfig";

/** One conversation in the dock above the status bar: open (a window) or minimized (a tab). */
export interface DockChat {
  room: string;
  minimized: boolean;
}

/** Per tab (each game screen is its own page, so the dock is restored on every screen). */
export const DOCK_STORAGE_KEY = "fm.social.chats.v1";
const MAX_DOCK = 10;
const ROOM_RE = /^(dm|world):[A-Za-z0-9_.-]{1,40}$/;

function limitOpen(dock: DockChat[], maxOpen: number): DockChat[] {
  let open = dock.filter((c) => !c.minimized).length;
  return dock.map((c) => {
    if (!c.minimized && open > maxOpen) {
      open--;
      return { ...c, minimized: true };
    }
    return c;
  });
}

/** Opens (or brings back) a chat as the newest window; the oldest open ones minimize past the limit. */
export function openInDock(dock: readonly DockChat[], room: string, maxOpen: number = SOCIAL.MAX_OPEN_CHATS): DockChat[] {
  const next = [...dock.filter((c) => c.room !== room), { room, minimized: false }];
  return limitOpen(next, maxOpen).slice(-MAX_DOCK);
}

export function closeInDock(dock: readonly DockChat[], room: string): DockChat[] {
  return dock.filter((c) => c.room !== room);
}

export function toggleInDock(dock: readonly DockChat[], room: string, maxOpen: number = SOCIAL.MAX_OPEN_CHATS): DockChat[] {
  const chat = dock.find((c) => c.room === room);
  if (!chat) return [...dock];
  if (chat.minimized) return openInDock(dock, room, maxOpen);
  return dock.map((c) => (c.room === room ? { ...c, minimized: true } : c));
}

export function isRoomVisible(dock: readonly DockChat[], room: string): boolean {
  return dock.some((c) => c.room === room && !c.minimized);
}

export function parseDock(raw: string | null): DockChat[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    const out: DockChat[] = [];
    for (const e of v) {
      const entry = e as { room?: unknown; minimized?: unknown } | null;
      if (entry && typeof entry.room === "string" && ROOM_RE.test(entry.room) && typeof entry.minimized === "boolean") {
        out.push({ room: entry.room, minimized: entry.minimized });
      }
    }
    return limitOpen(out.slice(-MAX_DOCK), SOCIAL.MAX_OPEN_CHATS);
  } catch {
    return [];
  }
}
```

- [ ] **Passo 4: rodar e passar**

Run: `bun test src/GameInterface/Social`
Expected: PASS.

- [ ] **Passo 5: commit**

```bash
git add src/GameInterface/Social/socialApi.ts src/GameInterface/Social/socialState.ts src/GameInterface/Social/chatDock.ts src/GameInterface/Social/socialState.test.ts src/GameInterface/Social/chatDock.test.ts
git commit -m "feat(social): API do cliente, estado e janelas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 14: Ícones e textos (i18n)

**Arquivos:**
- Modificar: `src/GameInterface/Icons.tsx`
- Modificar: `src/i18n/locales/en.json`, `src/i18n/locales/pt-BR.json`
- Teste: `src/i18n/social.keys.test.ts`

- [ ] **Passo 1: escrever o teste que falha**

`src/i18n/social.keys.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import en from "@/i18n/locales/en.json";
import pt from "@/i18n/locales/pt-BR.json";
import type { SocialErrorCode } from "@/types/socialTypes";

const ERRORS: Record<SocialErrorCode, true> = {
  invalidNickname: true, nicknameTaken: true, tooSoon: true, noNickname: true, invalidQuery: true, notFound: true,
  alreadyFriends: true, limit: true, invalidBody: true, noAccess: true, rateLimited: true, unauthorized: true,
  network: true,
};

const get = (o: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o);

const keys = [
  "button", "buttonShort", "unreadBadge", "panelTitle", "close", "loading", "yourCode", "copy", "copied",
  "changeNickname", "changeableOn", "tabs.friends", "tabs.requests", "tabs.add", "groups.playing", "groups.online",
  "groups.offline", "groups.worlds", "status.playing", "status.online", "status.offline", "noFriends", "actions",
  "unfriend", "block", "confirmUnfriend", "confirmBlock", "requests.incoming", "requests.outgoing", "requests.none",
  "requests.accept", "requests.decline", "requests.cancel", "add.searchLabel", "add.searchHint", "add.noResults",
  "add.add", "add.sent", "add.friend", "add.accept", "add.codeLabel", "add.sendCode", "add.requested",
  "add.befriended", "add.blocked", "add.noBlocked", "add.unblock", "nickname.title", "nickname.hint",
  "nickname.label", "nickname.save", "nickname.cancel", "chat.minimize", "chat.close", "chat.loadMore", "chat.empty",
  "chat.placeholder", "chat.send", "chat.counter", "chat.typing", "chat.readOnly", "chat.unavailable", "chat.world",
  "chat.minimizedTab",
  ...Object.keys(ERRORS).map((e) => `errors.${e}`),
].map((k) => `social.${k}`);

describe("social i18n", () => {
  for (const [name, lang] of [["en", en], ["pt-BR", pt]] as const) {
    for (const k of keys) test(`${name} ${k}`, () => expect(typeof get(lang, k)).toBe("string"));
  }
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `bun test src/i18n/social.keys.test.ts`
Expected: FAIL — chaves ausentes.

- [ ] **Passo 3: acrescentar os textos**

Em `src/i18n/locales/pt-BR.json`, trocar

```json
    "players": "Jogadores"
  },
  "tactics": {
```

por

```json
    "players": "Jogadores"
  },
  "social": {
    "button": "Amigos: {{count}} online",
    "buttonShort": "Amigos · {{count}}",
    "unreadBadge": "{{count}} não lidas",
    "panelTitle": "Amigos",
    "close": "Fechar",
    "loading": "Carregando…",
    "yourCode": "Seu código",
    "copy": "Copiar",
    "copied": "Copiado",
    "changeNickname": "Trocar apelido",
    "changeableOn": "Troca em {{date}}",
    "tabs": { "friends": "Amigos", "requests": "Pedidos", "add": "Adicionar" },
    "groups": { "playing": "Jogando", "online": "Online", "offline": "Offline", "worlds": "Mundos" },
    "status": { "playing": "Jogando · {{club}}", "online": "Online", "offline": "Offline" },
    "noFriends": "Nenhum amigo ainda. Adicione pelo apelido ou pelo código.",
    "actions": "Ações",
    "unfriend": "Desfazer amizade",
    "block": "Bloquear",
    "confirmUnfriend": "Confirmar",
    "confirmBlock": "Confirmar bloqueio",
    "requests": {
      "incoming": "Recebidos",
      "outgoing": "Enviados",
      "none": "Nenhum pedido.",
      "accept": "Aceitar",
      "decline": "Recusar",
      "cancel": "Cancelar"
    },
    "add": {
      "searchLabel": "Buscar apelido",
      "searchHint": "Digite pelo menos 3 caracteres.",
      "noResults": "Nenhum técnico encontrado.",
      "add": "Adicionar",
      "sent": "Pedido enviado",
      "friend": "Amigo",
      "accept": "Aceitar",
      "codeLabel": "Código de amigo",
      "sendCode": "Adicionar",
      "requested": "Pedido enviado para {{nickname}}.",
      "befriended": "Agora você e {{nickname}} são amigos.",
      "blocked": "Bloqueados",
      "noBlocked": "Ninguém bloqueado.",
      "unblock": "Desbloquear"
    },
    "nickname": {
      "title": "Escolha seu apelido",
      "hint": "3 a 20 caracteres: letras, números, _ . -. Os outros técnicos acham você por ele.",
      "label": "Apelido",
      "save": "Salvar",
      "cancel": "Cancelar"
    },
    "chat": {
      "minimize": "Minimizar",
      "close": "Fechar",
      "loadMore": "Carregar mais",
      "empty": "Nenhuma mensagem ainda.",
      "placeholder": "Escreva uma mensagem",
      "send": "Enviar",
      "counter": "{{count}}/{{max}}",
      "typing": "{{nickname}} está digitando…",
      "readOnly": "Vocês não são mais amigos: a conversa é só leitura.",
      "unavailable": "Conversa indisponível.",
      "world": "Mundo",
      "minimizedTab": "Abrir conversa com {{name}}"
    },
    "errors": {
      "invalidNickname": "Apelido inválido.",
      "nicknameTaken": "Esse apelido já está em uso.",
      "tooSoon": "Você só pode trocar o apelido a cada 30 dias.",
      "noNickname": "Escolha um apelido primeiro.",
      "invalidQuery": "Busca inválida.",
      "notFound": "Técnico não encontrado.",
      "alreadyFriends": "Vocês já são amigos.",
      "limit": "Limite de amigos ou de pedidos atingido.",
      "invalidBody": "Mensagem inválida.",
      "noAccess": "Você não pode escrever nesta conversa.",
      "rateLimited": "Muitas mensagens seguidas. Espere alguns segundos.",
      "unauthorized": "Sessão expirada. Entre de novo.",
      "network": "Sem conexão. Tente de novo."
    }
  },
  "tactics": {
```

Em `src/i18n/locales/en.json`, trocar

```json
    "players": "Players"
  },
  "tactics": {
```

por

```json
    "players": "Players"
  },
  "social": {
    "button": "Friends: {{count}} online",
    "buttonShort": "Friends · {{count}}",
    "unreadBadge": "{{count}} unread",
    "panelTitle": "Friends",
    "close": "Close",
    "loading": "Loading…",
    "yourCode": "Your code",
    "copy": "Copy",
    "copied": "Copied",
    "changeNickname": "Change nickname",
    "changeableOn": "Change on {{date}}",
    "tabs": { "friends": "Friends", "requests": "Requests", "add": "Add" },
    "groups": { "playing": "Playing", "online": "Online", "offline": "Offline", "worlds": "Worlds" },
    "status": { "playing": "Playing · {{club}}", "online": "Online", "offline": "Offline" },
    "noFriends": "No friends yet. Add someone by nickname or code.",
    "actions": "Actions",
    "unfriend": "Remove friend",
    "block": "Block",
    "confirmUnfriend": "Confirm",
    "confirmBlock": "Confirm block",
    "requests": {
      "incoming": "Received",
      "outgoing": "Sent",
      "none": "No requests.",
      "accept": "Accept",
      "decline": "Decline",
      "cancel": "Cancel"
    },
    "add": {
      "searchLabel": "Search nickname",
      "searchHint": "Type at least 3 characters.",
      "noResults": "No manager found.",
      "add": "Add",
      "sent": "Request sent",
      "friend": "Friend",
      "accept": "Accept",
      "codeLabel": "Friend code",
      "sendCode": "Add",
      "requested": "Request sent to {{nickname}}.",
      "befriended": "You and {{nickname}} are now friends.",
      "blocked": "Blocked",
      "noBlocked": "Nobody blocked.",
      "unblock": "Unblock"
    },
    "nickname": {
      "title": "Choose your nickname",
      "hint": "3 to 20 characters: letters, digits, _ . -. Other managers find you by it.",
      "label": "Nickname",
      "save": "Save",
      "cancel": "Cancel"
    },
    "chat": {
      "minimize": "Minimize",
      "close": "Close",
      "loadMore": "Load more",
      "empty": "No messages yet.",
      "placeholder": "Write a message",
      "send": "Send",
      "counter": "{{count}}/{{max}}",
      "typing": "{{nickname}} is typing…",
      "readOnly": "You are no longer friends: this chat is read-only.",
      "unavailable": "Chat unavailable.",
      "world": "World",
      "minimizedTab": "Open chat with {{name}}"
    },
    "errors": {
      "invalidNickname": "Invalid nickname.",
      "nicknameTaken": "That nickname is taken.",
      "tooSoon": "You can change your nickname once every 30 days.",
      "noNickname": "Choose a nickname first.",
      "invalidQuery": "Invalid search.",
      "notFound": "Manager not found.",
      "alreadyFriends": "You are already friends.",
      "limit": "Friend or request limit reached.",
      "invalidBody": "Invalid message.",
      "noAccess": "You can't write in this chat.",
      "rateLimited": "Too many messages in a row. Wait a few seconds.",
      "unauthorized": "Session expired. Sign in again.",
      "network": "No connection. Try again."
    }
  },
  "tactics": {
```

- [ ] **Passo 4: acrescentar os ícones** — em `src/GameInterface/Icons.tsx`:
  - no import do `lucide-react`, depois de `MessagesSquare,`, acrescentar `Ban,` e `Ellipsis,`;
  - em `IconName`, depois de `| "lock"`, acrescentar `| "users"`, `| "ban"` e `| "more"`;
  - em `ICON_MAP`, depois de `"talk": MessagesSquare,`, acrescentar:

```ts
  "users": Users,
  "ban": Ban,
  "more": Ellipsis,
```

- [ ] **Passo 5: rodar e passar**

Run: `bun test src/i18n/social.keys.test.ts src/GameInterface/ui/uiAudit.test.ts`
Expected: PASS.

- [ ] **Passo 6: commit**

```bash
git add src/GameInterface/Icons.tsx src/i18n/locales/en.json src/i18n/locales/pt-BR.json src/i18n/social.keys.test.ts
git commit -m "feat(social): textos e ícones de amigos e chat" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 15: `SocialProvider` e `useSocial` (estado + socket)

**Arquivos:**
- Criar: `src/GameInterface/Social/useSocial.tsx`

Sem teste unitário próprio (a lógica testável ficou em `socialState.ts` e `chatDock.ts`); conferido no navegador
(Tarefa 21).

- [ ] **Passo 1: implementar**

`src/GameInterface/Social/useSocial.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SOCIAL } from "@/Domain/social/socialConfig";
import { socialApi } from "@/GameInterface/Social/socialApi";
import {
  DOCK_STORAGE_KEY,
  closeInDock,
  isRoomVisible,
  openInDock,
  parseDock,
  toggleInDock,
  type DockChat,
} from "@/GameInterface/Social/chatDock";
import {
  applyPresence,
  mergeMessages,
  parseServerEvent,
  totalUnread,
  unreadFromLists,
} from "@/GameInterface/Social/socialState";
import type {
  ChatMessageView,
  ClientEvent,
  FriendsResponse,
  ServerEvent,
  SocialErrorCode,
  SocialMe,
} from "@/types/socialTypes";

const RECONNECT_MS = [1_000, 2_000, 5_000, 10_000, 30_000];
const EMPTY_LISTS: FriendsResponse = { friends: [], incoming: [], outgoing: [], worlds: [] };

export interface TypingInfo {
  from: string;
  at: number;
}

export interface SocialContextValue {
  me: SocialMe | null;
  setMe: (me: SocialMe) => void;
  lists: FriendsResponse;
  refreshFriends: () => Promise<void>;
  unread: Record<string, number>;
  totalUnread: number;
  /** People with the game open (from the socket's pong); null until known. */
  online: number | null;
  connected: boolean;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  dock: DockChat[];
  openChat: (room: string) => void;
  closeChat: (room: string) => void;
  toggleChat: (room: string) => void;
  messages: Record<string, ChatMessageView[]>;
  hasMore: Record<string, boolean>;
  roomErrors: Record<string, SocialErrorCode>;
  typing: Record<string, TypingInfo>;
  loadMessages: (room: string, older: boolean) => Promise<void>;
  send: (room: string, body: string) => Promise<SocialErrorCode | null>;
  markRoomRead: (room: string) => void;
  sendTyping: (room: string) => void;
}

const SocialContext = createContext<SocialContextValue | null>(null);

export function useSocial(): SocialContextValue {
  const ctx = useContext(SocialContext);
  if (!ctx) throw new Error("useSocial must be used within SocialProvider");
  return ctx;
}

function readDock(): DockChat[] {
  try {
    return parseDock(sessionStorage.getItem(DOCK_STORAGE_KEY));
  } catch {
    return [];
  }
}

function writeDock(dock: DockChat[]): void {
  try {
    sessionStorage.setItem(DOCK_STORAGE_KEY, JSON.stringify(dock));
  } catch {
    // private window or blocked storage: the dock just isn't restored on the next screen
  }
}

/** Friends, chat windows and the socket of one game page (`.claude/rules/social.md`). */
export function SocialProvider({ saveId, children }: { saveId: string | null; children: ReactNode }) {
  const [me, setMe] = useState<SocialMe | null>(null);
  const [lists, setLists] = useState<FriendsResponse>(EMPTY_LISTS);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [messages, setMessages] = useState<Record<string, ChatMessageView[]>>({});
  const [hasMore, setHasMore] = useState<Record<string, boolean>>({});
  const [roomErrors, setRoomErrors] = useState<Record<string, SocialErrorCode>>({});
  const [typing, setTyping] = useState<Record<string, TypingInfo>>({});
  const [online, setOnline] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [dock, setDock] = useState<DockChat[]>(readDock);
  // The socket opens only once `/api/social/me` answered: the lab's /simulate page reuses the Layout on a server
  // without the social routes, and there it must not retry a socket forever.
  const [available, setAvailable] = useState(false);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const unreadRef = useRef(unread);
  unreadRef.current = unread;
  const dockRef = useRef(dock);
  dockRef.current = dock;
  const wsRef = useRef<WebSocket | null>(null);
  const lastTypingRef = useRef<Record<string, number>>({});

  useEffect(() => {
    writeDock(dock);
  }, [dock]);

  const refreshFriends = useCallback(async () => {
    const r = await socialApi.friends();
    if (!r.ok) return;
    setLists(r.data);
    setUnread(unreadFromLists(r.data));
  }, []);

  useEffect(() => {
    void socialApi.me().then((r) => {
      if (!r.ok) return;
      setMe(r.data);
      setAvailable(true);
    });
    void refreshFriends();
  }, [refreshFriends]);

  const sendWs = useCallback((event: ClientEvent) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
  }, []);

  const markRoomRead = useCallback((room: string) => {
    const list = messagesRef.current[room];
    const last = list?.[list.length - 1];
    if (!last || !((unreadRef.current[room] ?? 0) > 0)) return;
    setUnread((prev) => ({ ...prev, [room]: 0 }));
    void socialApi.read(room, last.id);
  }, []);

  const handleEvent = useCallback(
    (event: ServerEvent) => {
      switch (event.type) {
        case "message": {
          // Merge only into a room already loaded; an unloaded room fetches its history when it opens.
          setMessages((prev) =>
            prev[event.room] ? { ...prev, [event.room]: mergeMessages(prev[event.room]!, [event.message]) } : prev,
          );
          setTyping((prev) => {
            if (!prev[event.room]) return prev;
            const next = { ...prev };
            delete next[event.room];
            return next;
          });
          if (event.message.mine) break;
          if (isRoomVisible(dockRef.current, event.room) && !document.hidden) {
            void socialApi.read(event.room, event.message.id);
          } else {
            setUnread((prev) => ({ ...prev, [event.room]: (prev[event.room] ?? 0) + 1 }));
          }
          break;
        }
        case "presence":
          setLists((prev) => ({ ...prev, friends: applyPresence(prev.friends, event) }));
          break;
        case "friend_request":
        case "friend_update":
          void refreshFriends();
          break;
        case "read":
          setUnread((prev) => ({ ...prev, [event.room]: 0 }));
          break;
        case "typing":
          setTyping((prev) => ({ ...prev, [event.room]: { from: event.from, at: Date.now() } }));
          break;
        case "pong":
          setOnline(event.online);
          break;
      }
    },
    [refreshFriends],
  );
  const handleRef = useRef(handleEvent);
  handleRef.current = handleEvent;

  useEffect(() => {
    if (!available) return;
    let stopped = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (stopped) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${window.location.host}/api/ws`);
      wsRef.current = ws;
      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
        ws.send(JSON.stringify({ type: "hello", saveId } satisfies ClientEvent));
      };
      ws.onmessage = (e) => {
        const event = parseServerEvent(e.data);
        if (event) handleRef.current(event);
      };
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        setConnected(false);
        if (stopped) return;
        const delay = RECONNECT_MS[Math.min(attempt, RECONNECT_MS.length - 1)]!;
        attempt++;
        reconnectTimer = setTimeout(connect, delay);
      };
      ws.onerror = () => ws.close();
    };

    connect();
    const pingTimer = setInterval(() => {
      if (!document.hidden) sendWs({ type: "ping" });
    }, SOCIAL.PING_MS);
    const onVisibility = () => {
      if (document.hidden) return;
      sendWs({ type: "ping" });
      for (const c of dockRef.current) if (!c.minimized) markRoomRead(c.room);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearInterval(pingTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [available, saveId, sendWs, markRoomRead]);

  const loadMessages = useCallback(async (room: string, older: boolean) => {
    const current = messagesRef.current[room];
    const before = older ? current?.[0]?.id : undefined;
    if (older && before === undefined) return;
    const r = await socialApi.messages(room, before);
    if (!r.ok) {
      setRoomErrors((prev) => ({ ...prev, [room]: r.error }));
      return;
    }
    setRoomErrors((prev) => {
      if (!prev[room]) return prev;
      const next = { ...prev };
      delete next[room];
      return next;
    });
    setMessages((prev) => ({ ...prev, [room]: mergeMessages(prev[room] ?? [], r.data.messages) }));
    setHasMore((prev) => ({ ...prev, [room]: r.data.hasMore }));
  }, []);

  const send = useCallback(async (room: string, body: string): Promise<SocialErrorCode | null> => {
    const r = await socialApi.send(room, body);
    if (!r.ok) return r.error;
    setMessages((prev) => ({ ...prev, [room]: mergeMessages(prev[room] ?? [], [r.data.message]) }));
    return null;
  }, []);

  const sendTyping = useCallback(
    (room: string) => {
      const now = Date.now();
      if (now - (lastTypingRef.current[room] ?? 0) < SOCIAL.TYPING_THROTTLE_MS) return;
      lastTypingRef.current[room] = now;
      sendWs({ type: "typing", room });
    },
    [sendWs],
  );

  const openChat = useCallback((room: string) => setDock((d) => openInDock(d, room)), []);
  const closeChat = useCallback((room: string) => setDock((d) => closeInDock(d, room)), []);
  const toggleChat = useCallback((room: string) => setDock((d) => toggleInDock(d, room)), []);

  const value = useMemo<SocialContextValue>(
    () => ({
      me, setMe, lists, refreshFriends, unread, totalUnread: totalUnread(unread), online, connected,
      panelOpen, setPanelOpen, dock, openChat, closeChat, toggleChat, messages, hasMore, roomErrors, typing,
      loadMessages, send, markRoomRead, sendTyping,
    }),
    [me, lists, refreshFriends, unread, online, connected, panelOpen, dock, openChat, closeChat, toggleChat, messages,
      hasMore, roomErrors, typing, loadMessages, send, markRoomRead, sendTyping],
  );

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}
```

- [ ] **Passo 2: conferir os tipos do arquivo**

Run: `bunx tsc --noEmit 2>&1 | grep -E "Social/" ; echo done`
Expected: só `done` (nenhum erro nos arquivos `Social/`).

- [ ] **Passo 3: commit**

```bash
git add src/GameInterface/Social/useSocial.tsx
git commit -m "feat(social): provedor com socket, reconexão e não lidas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 16: Botão Amigos na barra inferior

**Arquivos:**
- Criar: `src/GameInterface/Social/FriendsButton.tsx`
- Modificar: `src/GameInterface/usePresence.ts`, `src/GameInterface/Components/StatusBar.tsx`, `src/GameInterface/Components/Layout.tsx`

- [ ] **Passo 1: o botão**

`src/GameInterface/Social/FriendsButton.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { onlineFriendCount } from "@/GameInterface/Social/socialState";
import { useSocial } from "@/GameInterface/Social/useSocial";

const ITEM = "flex items-center gap-2 text-base text-muted-foreground tabular-nums";

/** "Amigos · 3" in the status bar (friends online), with a badge of unread messages and pending requests. */
export function FriendsButton() {
  const { t } = useTranslation();
  const s = useSocial();
  const count = onlineFriendCount(s.lists.friends);
  const badge = s.totalUnread + s.lists.incoming.length;
  return (
    <button
      type="button"
      onClick={() => s.setPanelOpen(!s.panelOpen)}
      aria-expanded={s.panelOpen}
      aria-label={t("social.button", { count })}
      title={t("social.button", { count })}
      className={`${ITEM} h-10 px-1 border-0 bg-transparent cursor-pointer hover:text-foreground whitespace-nowrap ${s.panelOpen ? "text-foreground" : ""}`}
    >
      <Icon name="users" size={18} />
      {t("social.buttonShort", { count })}
      {badge > 0 && (
        <span
          className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-sm font-bold leading-5 text-center tabular-nums"
          aria-label={t("social.unreadBadge", { count: badge })}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Passo 2: `usePresence` para de pingar quando o socket pinga** — em `src/GameInterface/usePresence.ts`:
  - trocar `export function usePresence(): number | null {` por `export function usePresence(skip = false): number | null {`;
  - no início do `useEffect`, antes de `let alive = true;`, acrescentar `if (skip) return;`;
  - trocar o fechamento `}, []);` do efeito por `}, [skip]);`;
  - na documentação acima da função, acrescentar a linha ` * With \`skip\` (the friends socket is open and pings itself) no HTTP ping is sent.`

- [ ] **Passo 3: a barra** — em `src/GameInterface/Components/StatusBar.tsx`:
  - imports: acrescentar
    ```ts
    import { FriendsButton } from "@/GameInterface/Social/FriendsButton";
    import { useSocial } from "@/GameInterface/Social/useSocial";
    ```
  - trocar
    ```ts
      const online = usePresence();
    ```
    por
    ```ts
      // The friends socket pings while open (and answers the count); the HTTP ping is the fallback.
      const social = useSocial();
      const httpOnline = usePresence(social.connected);
      const online = social.online ?? httpOnline;
    ```
  - no bloco da direita (`<div className="flex items-center justify-end gap-4">`), como primeiro filho, antes do
    comentário `{/* Version (opens the changelog)...`:
    ```tsx
          <FriendsButton />
    ```

- [ ] **Passo 4: o provedor no Layout** — em `src/GameInterface/Components/Layout.tsx`:
  - import: `import { SocialProvider } from "@/GameInterface/Social/useSocial";`
  - envolver o `<div className="h-screen overflow-hidden bg-background">…</div>` inteiro do `return` em
    `<SocialProvider saveId={session?.saveId ?? null}>` … `</SocialProvider>`.

- [ ] **Passo 5: conferir**

Run: `bun run ui:audit 2>&1 | grep -E "Social/|StatusBar|Layout" ; bunx tsc --noEmit 2>&1 | grep -E "Social/|StatusBar|Layout|usePresence" ; echo done`
Expected: só `done`.

- [ ] **Passo 6: commit**

```bash
git add src/GameInterface/Social/FriendsButton.tsx src/GameInterface/usePresence.ts src/GameInterface/Components/StatusBar.tsx src/GameInterface/Components/Layout.tsx
git commit -m "feat(social): botão Amigos na barra inferior" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 17: Painel de amigos

**Arquivos:**
- Criar: `src/GameInterface/Social/FriendsPanel.tsx`
- Modificar: `src/GameInterface/Components/Layout.tsx` (renderizar o painel)

- [ ] **Passo 1: implementar**

`src/GameInterface/Social/FriendsPanel.tsx`:

```tsx
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { dmRoomParam } from "@/Domain/social/rooms";
import { Icon } from "@/GameInterface/Icons";
import { socialApi, type ApiResult, type RequestAnswer } from "@/GameInterface/Social/socialApi";
import { groupFriends } from "@/GameInterface/Social/socialState";
import { useSocial } from "@/GameInterface/Social/useSocial";
import { Button } from "@/GameInterface/ui/Button";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { TextField } from "@/GameInterface/ui/TextField";
import type { FriendStatus, FriendView, SearchResult, SocialErrorCode } from "@/types/socialTypes";

type PanelTab = "friends" | "requests" | "add";

const ICON_BUTTON =
  "flex items-center justify-center w-8 h-8 rounded text-muted-foreground hover:text-foreground cursor-pointer border-0 bg-transparent";
const GROUP_LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";
const BADGE =
  "min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-sm font-bold leading-5 text-center tabular-nums";
const DOT: Record<FriendStatus, string> = {
  playing: "bg-primary",
  online: "bg-chart-2",
  offline: "bg-muted-foreground/50",
};

/** Friends panel above the status bar, bottom right (Steam style). Escape closes it. */
export function FriendsPanel() {
  const { t } = useTranslation();
  const s = useSocial();
  const [tab, setTab] = useState<PanelTab>("friends");
  const [editingNick, setEditingNick] = useState(false);
  const { panelOpen, setPanelOpen } = s;

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen, setPanelOpen]);

  if (!panelOpen) return null;
  const me = s.me;
  const requestCount = s.lists.incoming.length;

  return (
    <section
      role="dialog"
      aria-label={t("social.panelTitle")}
      className="fixed bottom-14 right-6 z-40 w-[340px] max-h-[60vh] flex flex-col rounded-md border border-border bg-card"
    >
      <header className="flex items-center justify-between gap-2 px-4 pt-3">
        <h2 className="font-display font-black uppercase text-xl leading-none">{t("social.panelTitle")}</h2>
        <button type="button" className={ICON_BUTTON} onClick={() => setPanelOpen(false)} aria-label={t("social.close")} title={t("social.close")}>
          <Icon name="close" size={16} />
        </button>
      </header>
      {me === null ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">{t("social.loading")}</p>
      ) : !me.nickname || editingNick ? (
        <NicknameForm current={me.nickname} onDone={() => setEditingNick(false)} />
      ) : (
        <>
          <IdentityRow onChangeNickname={() => setEditingNick(true)} />
          <div className="px-4 pt-3">
            <SegmentedTabs
              fill
              compact
              aria-label={t("social.panelTitle")}
              active={tab}
              onChange={setTab}
              tabs={[
                { key: "friends", label: t("social.tabs.friends") },
                { key: "requests", label: requestCount > 0 ? `${t("social.tabs.requests")} · ${requestCount}` : t("social.tabs.requests") },
                { key: "add", label: t("social.tabs.add") },
              ]}
            />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
            {tab === "friends" ? <FriendsTab /> : tab === "requests" ? <RequestsTab /> : <AddTab />}
          </div>
        </>
      )}
    </section>
  );
}

function IdentityRow({ onChangeNickname }: { onChangeNickname: () => void }) {
  const { t, i18n } = useTranslation();
  const { me } = useSocial();
  const [copied, setCopied] = useState(false);
  if (!me?.nickname) return null;
  const copy = () => {
    void navigator.clipboard
      ?.writeText(me.friendCode)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };
  const changeDate = me.nicknameChangeableOn
    ? new Date(`${me.nicknameChangeableOn}T00:00:00`).toLocaleDateString(i18n.language)
    : null;
  return (
    <div className="px-4 pt-3 flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-foreground truncate">{me.nickname}</span>
        {changeDate ? (
          <span className="text-sm text-muted-foreground whitespace-nowrap">{t("social.changeableOn", { date: changeDate })}</span>
        ) : (
          <Button variant="secondary" flush onClick={onChangeNickname}>
            {t("social.changeNickname")}
          </Button>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          {t("social.yourCode")} <span className="font-semibold text-foreground tabular-nums">{me.friendCode}</span>
        </span>
        <Button variant="secondary" flush onClick={copy}>
          <Icon name={copied ? "check" : "copy"} size={16} />
          {copied ? t("social.copied") : t("social.copy")}
        </Button>
      </div>
    </div>
  );
}

function NicknameForm({ current, onDone }: { current: string | null; onDone: () => void }) {
  const { t } = useTranslation();
  const { setMe } = useSocial();
  const [value, setValue] = useState(current ?? "");
  const [error, setError] = useState<SocialErrorCode | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const r = await socialApi.setNickname(value);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setMe(r.data);
    onDone();
  }

  return (
    <form onSubmit={(e) => void save(e)} className="px-4 py-3 flex flex-col gap-3">
      {!current && <h3 className="font-display font-black uppercase text-xl leading-none">{t("social.nickname.title")}</h3>}
      <TextField
        id="social-nickname"
        variant="box"
        label={t("social.nickname.label")}
        value={value}
        maxLength={20}
        autoComplete="off"
        onChange={(e) => setValue(e.target.value)}
      />
      <p className="text-sm text-muted-foreground">{t("social.nickname.hint")}</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(`social.errors.${error}`)}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy || value.trim().length < 3}>
          {t("social.nickname.save")}
        </Button>
        {current && (
          <Button variant="secondary" onClick={onDone}>
            {t("social.nickname.cancel")}
          </Button>
        )}
      </div>
    </form>
  );
}

function FriendsTab() {
  const { t } = useTranslation();
  const s = useSocial();
  const groups = groupFriends(s.lists.friends);
  if (s.lists.friends.length === 0 && s.lists.worlds.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("social.noFriends")}</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {s.lists.worlds.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className={GROUP_LABEL}>{t("social.groups.worlds")}</p>
          {s.lists.worlds.map((w) => {
            const unread = s.unread[w.room] ?? 0;
            return (
              <button
                key={w.room}
                type="button"
                onClick={() => s.openChat(w.room)}
                className="flex items-center gap-3 rounded-md px-2 py-2 text-left cursor-pointer border-0 bg-transparent hover:bg-secondary/30"
              >
                <Icon name="globe" size={16} className="text-muted-foreground" />
                <span className="font-semibold text-foreground truncate">{w.name || t("social.chat.world")}</span>
                {unread > 0 && <span className={`ml-auto ${BADGE}`}>{unread}</span>}
              </button>
            );
          })}
        </div>
      )}
      {(["playing", "online", "offline"] as const).map(
        (k) =>
          groups[k].length > 0 && (
            <div key={k} className="flex flex-col gap-1">
              <p className={GROUP_LABEL}>
                {t(`social.groups.${k}`)} · {groups[k].length}
              </p>
              {groups[k].map((f) => (
                <FriendRow key={f.nickname} friend={f} />
              ))}
            </div>
          ),
      )}
    </div>
  );
}

function FriendRow({ friend }: { friend: FriendView }) {
  const { t } = useTranslation();
  const s = useSocial();
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<"unfriend" | "block" | null>(null);
  const room = dmRoomParam(friend.nickname);
  const unread = s.unread[room] ?? 0;
  const statusText =
    friend.status === "playing" && friend.club
      ? t("social.status.playing", { club: friend.club })
      : t(`social.status.${friend.status === "playing" ? "online" : friend.status}`);

  async function run(kind: "unfriend" | "block") {
    if (confirm !== kind) {
      setConfirm(kind);
      return;
    }
    const r = kind === "unfriend" ? await socialApi.unfriend(friend.nickname) : await socialApi.block(friend.nickname);
    if (r.ok) {
      s.closeChat(room);
      await s.refreshFriends();
    }
    setConfirm(null);
    setMenu(false);
  }

  return (
    <div className="rounded-md hover:bg-secondary/30">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => s.openChat(room)}
          className="flex-1 min-w-0 flex items-center gap-3 px-2 py-2 text-left cursor-pointer border-0 bg-transparent"
        >
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${DOT[friend.status]}`} aria-hidden="true" />
          <span className="min-w-0 flex flex-col">
            <span className="font-semibold text-foreground truncate">{friend.nickname}</span>
            <span className="text-sm text-muted-foreground truncate">{statusText}</span>
          </span>
          {unread > 0 && (
            <span className={`ml-auto ${BADGE}`} aria-label={t("social.unreadBadge", { count: unread })}>
              {unread}
            </span>
          )}
        </button>
        <button
          type="button"
          className={ICON_BUTTON}
          aria-expanded={menu}
          aria-label={t("social.actions")}
          title={t("social.actions")}
          onClick={() => {
            setMenu(!menu);
            setConfirm(null);
          }}
        >
          <Icon name="more" size={16} />
        </button>
      </div>
      {menu && (
        <div className="flex items-center gap-4 px-2 pb-2">
          <Button variant="secondary" flush onClick={() => void run("unfriend")}>
            {confirm === "unfriend" ? t("social.confirmUnfriend") : t("social.unfriend")}
          </Button>
          <Button variant="danger" flush onClick={() => void run("block")}>
            <Icon name="ban" size={16} />
            {confirm === "block" ? t("social.confirmBlock") : t("social.block")}
          </Button>
        </div>
      )}
    </div>
  );
}

function RequestsTab() {
  const { t } = useTranslation();
  const s = useSocial();
  const [error, setError] = useState<SocialErrorCode | null>(null);
  const { incoming, outgoing } = s.lists;

  async function act(p: Promise<ApiResult<unknown>>) {
    const r = await p;
    setError(r.ok ? null : r.error);
    await s.refreshFriends();
  }

  if (incoming.length === 0 && outgoing.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("social.requests.none")}</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(`social.errors.${error}`)}
        </p>
      )}
      {incoming.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className={GROUP_LABEL}>
            {t("social.requests.incoming")} · {incoming.length}
          </p>
          {incoming.map((r) => (
            <div key={r.nickname} className="flex items-center justify-between gap-2">
              <span className="font-semibold text-foreground truncate">{r.nickname}</span>
              <div className="flex items-center gap-3">
                <Button onClick={() => void act(socialApi.accept(r.nickname))}>{t("social.requests.accept")}</Button>
                <Button variant="secondary" flush onClick={() => void act(socialApi.decline(r.nickname))}>
                  {t("social.requests.decline")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {outgoing.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className={GROUP_LABEL}>
            {t("social.requests.outgoing")} · {outgoing.length}
          </p>
          {outgoing.map((r) => (
            <div key={r.nickname} className="flex items-center justify-between gap-2">
              <span className="font-semibold text-foreground truncate">{r.nickname}</span>
              <Button variant="secondary" flush onClick={() => void act(socialApi.cancel(r.nickname))}>
                {t("social.requests.cancel")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddTab() {
  const { t } = useTranslation();
  const s = useSocial();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [code, setCode] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [blocked, setBlocked] = useState<string[] | null>(null);

  useEffect(() => {
    void socialApi.blocks().then((r) => setBlocked(r.ok ? r.data.blocked.map((b) => b.nickname) : []));
  }, []);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 3) {
      setResults(null);
      return;
    }
    const timer = setTimeout(() => {
      void socialApi.search(query).then((r) => setResults(r.ok ? r.data.results : []));
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  function report(r: ApiResult<RequestAnswer>) {
    if (r.ok) {
      const key = r.data.status === "friends" ? "social.add.befriended" : "social.add.requested";
      setFeedback({ ok: true, text: t(key, { nickname: r.data.nickname }) });
    } else {
      setFeedback({ ok: false, text: t(`social.errors.${r.error}`) });
    }
  }

  async function add(nickname: string) {
    const r = await socialApi.requestByNickname(nickname);
    report(r);
    if (!r.ok) return;
    const relation = r.data.status === "friends" ? "friend" : "pending_out";
    setResults((prev) => prev?.map((x) => (x.nickname === nickname ? { ...x, relation } : x)) ?? null);
    await s.refreshFriends();
  }

  async function addByCode(e: FormEvent) {
    e.preventDefault();
    const r = await socialApi.requestByCode(code);
    report(r);
    if (r.ok) {
      setCode("");
      await s.refreshFriends();
    }
  }

  async function unblock(nickname: string) {
    const r = await socialApi.unblock(nickname);
    if (r.ok) setBlocked((prev) => prev?.filter((n) => n !== nickname) ?? null);
  }

  const typed = q.trim().length;
  return (
    <div className="flex flex-col gap-4">
      <TextField
        id="social-search"
        variant="box"
        label={t("social.add.searchLabel")}
        value={q}
        maxLength={20}
        autoComplete="off"
        onChange={(e) => setQ(e.target.value)}
      />
      {typed > 0 && typed < 3 && <p className="text-sm text-muted-foreground">{t("social.add.searchHint")}</p>}
      {results &&
        (results.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("social.add.noResults")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {results.map((r) => (
              <li key={r.nickname} className="flex items-center justify-between gap-2 py-1">
                <span className="font-semibold text-foreground truncate">{r.nickname}</span>
                {r.relation === "none" || r.relation === "pending_in" ? (
                  <Button onClick={() => void add(r.nickname)}>
                    {t(r.relation === "none" ? "social.add.add" : "social.add.accept")}
                  </Button>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {t(r.relation === "friend" ? "social.add.friend" : "social.add.sent")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ))}
      <form onSubmit={(e) => void addByCode(e)} className="flex items-end gap-3">
        <TextField
          id="social-code"
          variant="box"
          className="flex-1"
          label={t("social.add.codeLabel")}
          placeholder="FM-XXXX-XXXX"
          value={code}
          maxLength={14}
          autoComplete="off"
          onChange={(e) => setCode(e.target.value)}
        />
        <Button type="submit" disabled={code.trim().length < 8}>
          {t("social.add.sendCode")}
        </Button>
      </form>
      {feedback && (
        <p role="status" className={`text-sm ${feedback.ok ? "text-chart-2" : "text-destructive"}`}>
          {feedback.text}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <p className={GROUP_LABEL}>{t("social.add.blocked")}</p>
        {blocked !== null &&
          (blocked.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("social.add.noBlocked")}</p>
          ) : (
            blocked.map((n) => (
              <div key={n} className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground truncate">{n}</span>
                <Button variant="secondary" flush onClick={() => void unblock(n)}>
                  {t("social.add.unblock")}
                </Button>
              </div>
            ))
          ))}
      </div>
    </div>
  );
}
```

- [ ] **Passo 2: no Layout** — em `src/GameInterface/Components/Layout.tsx`, import
  `import { FriendsPanel } from "@/GameInterface/Social/FriendsPanel";` e, logo depois do `<StatusBar … />`,
  `<FriendsPanel />`.

- [ ] **Passo 3: conferir**

Run: `bun run ui:audit 2>&1 | grep -E "Social/" ; bunx tsc --noEmit 2>&1 | grep -E "Social/|Layout" ; echo done`
Expected: só `done`.

- [ ] **Passo 4: commit**

```bash
git add src/GameInterface/Social/FriendsPanel.tsx src/GameInterface/Components/Layout.tsx
git commit -m "feat(social): painel de amigos, pedidos e busca" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 18: Janelas de conversa

**Arquivos:**
- Criar: `src/GameInterface/Social/ChatWindow.tsx`, `src/GameInterface/Social/ChatDock.tsx`
- Modificar: `src/GameInterface/Components/Layout.tsx` (renderizar o dock)

- [ ] **Passo 1: implementar**

`src/GameInterface/Social/ChatWindow.tsx`:

```tsx
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { SOCIAL } from "@/Domain/social/socialConfig";
import { Icon } from "@/GameInterface/Icons";
import { useSocial } from "@/GameInterface/Social/useSocial";
import { Button } from "@/GameInterface/ui/Button";
import type { FriendStatus, SocialErrorCode } from "@/types/socialTypes";

const ICON_BUTTON =
  "flex items-center justify-center w-8 h-8 rounded text-muted-foreground hover:text-foreground cursor-pointer border-0 bg-transparent";
const DOT: Record<FriendStatus, string> = {
  playing: "bg-primary",
  online: "bg-chart-2",
  offline: "bg-muted-foreground/50",
};

/** Title of a room as the screens show it: the friend's nickname or the world's name. */
export function useRoomTitle(room: string): string {
  const { t } = useTranslation();
  const { lists } = useSocial();
  if (room.startsWith("dm:")) return room.slice(3);
  return lists.worlds.find((w) => w.room === room)?.name || t("social.chat.world");
}

export function ChatWindow({ room }: { room: string }) {
  const { t, i18n } = useTranslation();
  const s = useSocial();
  const title = useRoomTitle(room);
  const msgs = s.messages[room];
  const loadError = s.roomErrors[room];
  const [text, setText] = useState("");
  const [error, setError] = useState<SocialErrorCode | null>(null);
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const listRef = useRef<HTMLDivElement>(null);
  const { loadMessages, markRoomRead } = s;

  const friend = room.startsWith("dm:") ? s.lists.friends.find((f) => f.nickname === room.slice(3)) : undefined;
  const canWrite = room.startsWith("world:") || friend !== undefined;
  const typing = s.typing[room];
  const showTyping = typing !== undefined && now - typing.at < SOCIAL.TYPING_SHOW_MS;

  useEffect(() => {
    if (!msgs && !loadError) void loadMessages(room, false);
  }, [room, msgs, loadError, loadMessages]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    if (msgs && msgs.length > 0 && !document.hidden) markRoomRead(room);
  }, [room, msgs?.length, markRoomRead]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!typing) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [typing]);

  async function submit() {
    if (!text.trim() || sending) return;
    setSending(true);
    const err = await s.send(room, text);
    setSending(false);
    if (err) {
      setError(err);
      return;
    }
    setText("");
    setError(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  const length = [...text].length;
  const time = (at: number) => new Date(at).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });

  return (
    <section
      aria-label={title}
      className="pointer-events-auto w-[300px] h-[420px] flex flex-col rounded-md border border-border bg-card"
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        {friend && <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${DOT[friend.status]}`} aria-hidden="true" />}
        {!friend && room.startsWith("world:") && <Icon name="globe" size={16} className="text-muted-foreground" />}
        <span className="font-semibold text-foreground truncate flex-1">{title}</span>
        <button type="button" className={ICON_BUTTON} onClick={() => s.toggleChat(room)} aria-label={t("social.chat.minimize")} title={t("social.chat.minimize")}>
          <Icon name="minus" size={16} />
        </button>
        <button type="button" className={ICON_BUTTON} onClick={() => s.closeChat(room)} aria-label={t("social.chat.close")} title={t("social.chat.close")}>
          <Icon name="close" size={16} />
        </button>
      </header>

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-2 flex flex-col gap-2">
        {loadError ? (
          <p className="text-sm text-muted-foreground">{t("social.chat.unavailable")}</p>
        ) : !msgs ? (
          <p className="text-sm text-muted-foreground">{t("social.loading")}</p>
        ) : (
          <>
            {s.hasMore[room] && (
              <Button variant="secondary" flush className="self-center" onClick={() => void loadMessages(room, true)}>
                {t("social.chat.loadMore")}
              </Button>
            )}
            {msgs.length === 0 && <p className="text-sm text-muted-foreground">{t("social.chat.empty")}</p>}
            {msgs.map((m) => (
              <div key={m.id} className={`flex flex-col max-w-[85%] ${m.mine ? "self-end items-end" : "self-start items-start"}`}>
                <div className={`rounded-md px-3 py-1.5 text-sm whitespace-pre-wrap break-words ${m.mine ? "bg-primary/15 text-foreground" : "bg-secondary/40 text-foreground"}`}>
                  {room.startsWith("world:") && !m.mine && <span className="block font-semibold">{m.from}</span>}
                  {m.body}
                </div>
                <span className="text-sm text-muted-foreground tabular-nums">{time(m.at)}</span>
              </div>
            ))}
          </>
        )}
      </div>

      {showTyping && (
        <p className="px-3 text-sm text-muted-foreground">{t("social.chat.typing", { nickname: typing!.from })}</p>
      )}

      <div className="border-t border-border px-3 py-2 flex flex-col gap-1">
        {canWrite ? (
          <>
            <textarea
              aria-label={t("social.chat.placeholder")}
              placeholder={t("social.chat.placeholder")}
              rows={2}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (e.target.value.trim()) s.sendTyping(room);
              }}
              onKeyDown={onKeyDown}
              className="w-full resize-none rounded border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <div className="flex items-center justify-between gap-2">
              <span className={`text-sm tabular-nums ${length > SOCIAL.MESSAGE_MAX ? "text-destructive" : "text-muted-foreground"}`}>
                {t("social.chat.counter", { count: length, max: SOCIAL.MESSAGE_MAX })}
              </span>
              <Button onClick={() => void submit()} disabled={sending || !text.trim() || length > SOCIAL.MESSAGE_MAX}>
                <Icon name="send" size={16} />
                {t("social.chat.send")}
              </Button>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {t(`social.errors.${error}`)}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("social.chat.readOnly")}</p>
        )}
      </div>
    </section>
  );
}
```

`src/GameInterface/Social/ChatDock.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { ChatWindow, useRoomTitle } from "@/GameInterface/Social/ChatWindow";
import { useSocial } from "@/GameInterface/Social/useSocial";

const BADGE =
  "min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-sm font-bold leading-5 text-center tabular-nums";

function MinimizedTab({ room }: { room: string }) {
  const { t } = useTranslation();
  const s = useSocial();
  const title = useRoomTitle(room);
  const unread = s.unread[room] ?? 0;
  return (
    <button
      type="button"
      onClick={() => s.toggleChat(room)}
      aria-label={t("social.chat.minimizedTab", { name: title })}
      title={title}
      className="h-10 max-w-[180px] px-3 flex items-center gap-2 rounded-md border border-border bg-card text-sm font-semibold text-foreground cursor-pointer hover:border-primary/40"
    >
      <span className="truncate">{title}</span>
      {unread > 0 && <span className={BADGE}>{unread}</span>}
    </button>
  );
}

/** Chat windows above the status bar, left of the friends panel; minimized chats become tabs (Steam style). */
export function ChatDock() {
  const s = useSocial();
  if (s.dock.length === 0) return null;
  const open = s.dock.filter((c) => !c.minimized);
  const minimized = s.dock.filter((c) => c.minimized);
  return (
    <div className={`fixed bottom-14 ${s.panelOpen ? "right-[376px]" : "right-6"} z-40 flex items-end gap-3 pointer-events-none`}>
      {minimized.length > 0 && (
        <div className="pointer-events-auto flex flex-col gap-1">
          {minimized.map((c) => (
            <MinimizedTab key={c.room} room={c.room} />
          ))}
        </div>
      )}
      {open.map((c) => (
        <ChatWindow key={c.room} room={c.room} />
      ))}
    </div>
  );
}
```

- [ ] **Passo 2: no Layout** — em `src/GameInterface/Components/Layout.tsx`, import
  `import { ChatDock } from "@/GameInterface/Social/ChatDock";` e, logo depois de `<FriendsPanel />`, `<ChatDock />`.

- [ ] **Passo 3: conferir**

Run: `bun run ui:audit 2>&1 | grep -E "Social/" ; bunx tsc --noEmit 2>&1 | grep -E "Social/|Layout" ; echo done`
Expected: só `done`.

- [ ] **Passo 4: commit**

```bash
git add src/GameInterface/Social/ChatWindow.tsx src/GameInterface/Social/ChatDock.tsx src/GameInterface/Components/Layout.tsx
git commit -m "feat(social): janelas de conversa e abas minimizadas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 19: Auditoria visual e tipos

**Arquivos:** os que a auditoria apontar (só `src/GameInterface/Social/*`, `StatusBar.tsx`, `Layout.tsx`).

- [ ] **Passo 1: auditoria**

Run: `bun run ui:audit`
Expected: nenhuma linha em `src/GameInterface/Social/*`, `StatusBar.tsx` ou `Layout.tsx` (duras e leves). Se aparecer
algo, corrija o componente pela regra apontada (`ui-standard.md`), nunca acrescente à `ALLOWLIST` sem motivo escrito.

- [ ] **Passo 2: teste da auditoria**

Run: `bun test src/GameInterface/ui/uiAudit.test.ts`
Expected: PASS.

- [ ] **Passo 3: tipos**

Run: `bunx tsc --noEmit 2>&1 | grep -E "social|Social|realtime|db\.ts|index\.ts|StatusBar|Layout|usePresence|Icons|auth/routes" ; echo done`
Expected: só `done`.

- [ ] **Passo 4: commit** (só se algo mudou)

```bash
git add src/GameInterface/Social src/GameInterface/Components/StatusBar.tsx src/GameInterface/Components/Layout.tsx
git commit -m "fix(social): auditoria visual limpa" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 20: Regra, changelog, versão e roadmap

**Arquivos:**
- Criar: `.claude/rules/social.md`
- Modificar: `.claude/rules/project-structure.md`, `src/GameInterface/changelog/changelog.ts`, `package.json`, `docs/ROADMAP.md`

- [ ] **Passo 1: a regra** — `.claude/rules/social.md`:

```markdown
# Amigos e chat

Spec: `docs/superpowers/specs/2026-10-14-friends-chat-design.md`. Etapa 44 do `docs/ROADMAP.md` (#153), versão
**4.24**. Visual: `.claude/rules/ui-standard.md`. Por **usuário**, não por save.

## Regra

- Apelido único (3–20, `[A-Za-z0-9_.-]`, sem diferenciar maiúsculas, sem `admin`/`fmproject`/`westlab`/moderador e
  afins), escolhido na primeira abertura de Amigos, troca a cada 30 dias. Código de amigo `FM-XXXX-XXXX` (base32 sem
  0/1/I/O), gerado na primeira chamada de `GET /api/social/me`.
- Amizade só por pedido aceito (apelido ou código); pedido cruzado vira amizade na hora. Máximo 200 amigos e 50
  pedidos enviados pendentes.
- Bloqueio: desfaz a amizade e os pedidos entre os dois; o bloqueado não acha o outro, não pede nem escreve (404 /
  403, nunca "bloqueado"); as mensagens dele somem para quem bloqueou. Desbloquear não refaz a amizade.
- Salas internas `dm:<idA>:<idB>` (ids em ordem) e `world:<saveId>`. O cliente só vê `dm:<apelido do outro>` e
  `world:<saveId>`. DM: escreve quem é amigo sem bloqueio; o participante lê o histórico. Mundo: dono (`saves`) ou
  membro (`save_members`) de um mundo com 2+ membros.
- Mensagem: texto puro de 1–500 caracteres, 10 a cada 10 s por usuário (429), apagadas depois de 90 dias
  (`startSocialMaintenance`, na subida e a cada 24 h).
- Status de amigo: `playing` (com o clube do save aberto numa aba, `hello`), `online` (visto nos últimos 2,5 min, pelo
  ping do socket ou pelo `POST /api/presence/ping`), `offline`. Só amigos recebem.
- Nenhuma resposta nem evento carrega e-mail ou id de usuário.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/Domain/social/socialConfig.ts` | Constantes (`SOCIAL`) |
| `src/Domain/social/nickname.ts`, `rooms.ts`, `message.ts` (+ testes) | Apelido, código, salas, corpo, limite |
| `src/types/socialTypes.ts` | Respostas, eventos do socket, códigos de erro |
| `src/backend/db.ts` (`migrateSocialSchema`) | Colunas `users.nickname/nickname_changed_at/friend_code` e tabelas `friend_requests`, `friendships`, `blocks`, `chat_messages`, `chat_reads`, `save_members` — só acrescenta |
| `src/backend/social/socialStore.ts` | Consultas |
| `src/backend/social/roomAccess.ts` | Parâmetro de sala ↔ sala interna, escrita, destinatários |
| `src/backend/social/realtime.ts` | Sockets por usuário, presença, entrega, upgrade de `/api/ws` |
| `src/backend/social/socialRoutes.ts` | Rotas |
| `src/backend/social/maintenance.ts` | Limpeza de 90 dias e varredura de presença (30 s) |
| `src/GameInterface/Social/*` | `SocialProvider`/`useSocial`, `FriendsButton`, `FriendsPanel`, `ChatDock`, `ChatWindow`, `socialApi`, `socialState`, `chatDock` |

## Rotas (todas exigem login)

| Rota | Faz |
|---|---|
| `GET /api/social/me` | `{ nickname, friendCode, nicknameChangeableOn }` |
| `PUT /api/social/nickname { nickname }` | 400 `invalidNickname`, 409 `nicknameTaken`, 409 `tooSoon { nicknameChangeableOn }` |
| `GET /api/social/search?q=` | até 20 `{ nickname, relation }`; 409 `noNickname`, 400 `invalidQuery` |
| `POST /api/social/requests { nickname \| code }` | `{ status: requested \| friends, nickname }`; 404 `notFound`, 409 `alreadyFriends` / `limit` / `noNickname` |
| `POST …/requests/:nickname/accept` · `/decline` · `DELETE …/requests/:nickname` | aceitar, recusar, cancelar |
| `GET /api/social/friends` | `{ friends, incoming, outgoing, worlds }` com status e não lidas |
| `DELETE /api/social/friends/:nickname` | desfaz a amizade |
| `GET/POST /api/social/blocks`, `DELETE /api/social/blocks/:nickname` | listar, bloquear, desbloquear |
| `GET /api/social/rooms/:room/messages?before=&limit=` | página de até 50, 403 `noAccess` |
| `POST /api/social/rooms/:room/messages { body }` | 400 `invalidBody`, 403 `noAccess`, 429 `rateLimited`, 409 `noNickname` |
| `POST /api/social/rooms/:room/read { lastReadId }` | marca lido (só avança) |

## Socket (`/api/ws`)

Upgrade no `fetch` do `Bun.serve` (`src/index.ts`), autenticado pelo cookie (401) e com `Origin` do próprio host (403).
Cliente → servidor: `hello { saveId }` (status "jogando" quando o usuário é dono/membro do save), `ping` (a cada 60 s
com a página visível; responde `pong { online }`, a contagem da barra), `typing { room }`. Servidor → cliente:
`message { room, message }`, `presence { nickname, status, club }`, `friend_request { from }`, `friend_update`,
`read { room, lastReadId }`, `typing { room, from }`, `pong { online }`. Frames acima de 2 KB ou inválidos são
ignorados. O envio de mensagem é sempre HTTP; sem socket a tela continua funcionando e busca o histórico ao abrir.

## Telas

- Barra inferior: "Amigos · N" (amigos online) com o selo de não lidas + pedidos; abre o painel (340px, até 60% da
  altura, acima da barra, à direita; Escape fecha).
- Painel: apelido e código (copiar, trocar apelido), abas Amigos (Jogando / Online / Offline / Mundos, menu da linha
  com desfazer amizade e bloquear, com confirmação), Pedidos, Adicionar (busca, código, bloqueados). Sem apelido: só o
  formulário.
- Janelas: até 3 abertas à esquerda do painel, as outras como abas minimizadas; "Carregar mais", Enter envia,
  Shift+Enter quebra linha, contador de 500, "digitando…". Estado por aba no `sessionStorage`
  (`fm.social.chats.v1`); o socket reconecta a cada tela.
- A partida ao vivo não tem a barra: o selo aparece ao voltar.

## Testes

```
bun test src/Domain/social src/backend/social src/backend/db.social.test.ts src/backend/auth \
  src/GameInterface/Social src/i18n/social.keys.test.ts
```

Navegador: `DEV_AUTO_LOGIN=1 bun run dev`; aba 1 `http://localhost:3000/api/auth/dev-login`, aba 2
`http://127.0.0.1:3000/api/auth/dev-login?as=2` (dois usuários, cookie por host; `.claude/rules/dev-login.md`).

## Limitações

- Um processo só (sockets e presença em memória); o mundo público vai precisar de um barramento entre processos.
- Sem sala pública, denúncia ou moderação; sem anexos, emojis especiais ou edição.
- A sala do mundo só tem membros quando a parte 2 do multiplayer gravar `save_members`.
- Um participante de DM lê o histórico mesmo depois de a amizade acabar (só não escreve).
```

- [ ] **Passo 2: estrutura do projeto** — em `.claude/rules/project-structure.md`, antes de `## Save version (#155, 4.22)`:

```markdown
## Realtime: WebSocket `/api/ws` (Etapa 44, 4.24)
The only server → browser push channel. `Bun.serve` in `src/index.ts` upgrades `/api/ws` in `fetch` (the fallback
for paths no route matched) and hands the socket to `socialWebSocket` (`src/backend/social/realtime.ts`). Auth is the
session cookie at the upgrade; the payloads are typed in `src/types/socialTypes.ts` (`ClientEvent`, `ServerEvent`) and
carry nicknames, never user ids. Writes stay HTTP; the socket only delivers. Connections live in memory per process.
A new push feature adds a `ServerEvent` member there instead of opening another socket. See `.claude/rules/social.md`.

```

- [ ] **Passo 3: changelog e versão** — em `src/GameInterface/changelog/changelog.ts`, como primeira entrada de
  `changelog` (antes da entrada `version: "4.23"`):

```ts
  {
    version: "4.24",
    date: "2026-10-14",
    items: [
      {
        pt: "Amigos na barra de baixo: escolha um apelido, adicione técnicos pelo apelido ou pelo código de amigo e veja quem está online ou jogando, com o clube",
        en: "Friends in the bottom bar: pick a nickname, add managers by nickname or friend code and see who is online or playing, with their club",
      },
      {
        pt: "Converse com seus amigos em janelas de chat que ficam abertas enquanto você joga; dá para bloquear quem incomoda",
        en: "Chat with your friends in windows that stay open while you play; you can block anyone who bothers you",
      },
    ],
  },
```

  e em `upcoming` apagar a linha
  `  { pt: "Chat e amigos: converse com outros técnicos", en: "Chat and friends: talk to other managers" },`.

  Em `package.json`, com a ferramenta Edit (sem BOM), trocar `"version": "4.23",` por `"version": "4.24",`.

- [ ] **Passo 4: roadmap** — em `docs/ROADMAP.md`, trocar a linha

```
| 44 | Chat e amigos | #153 | Chat global e por país/idioma, lista de amigos com status e bloqueio; depende do multiplayer |
```

por

```
| 44 ✅ | Amigos e chat (4.24) | #153 | Apelido único e código de amigo, pedidos (apelido ou código), bloqueio, status online/offline/jogando com o clube, conversas diretas em janelas acima da barra inferior (estilo Steam) por WebSocket, histórico de 90 dias, limite de 10 mensagens em 10 s; sala por mundo pronta para o multiplayer (`save_members`); sem sala pública. Spec `docs/superpowers/specs/2026-10-14-friends-chat-design.md`, regra `.claude/rules/social.md` |
```

e trocar

```
**43–44 · Multiplayer e chat (a 42, imprensa, saiu na 4.23):** cada uma com desenho próprio quando chegar a vez.
```

por

```
**43 · Multiplayer (a 42, imprensa, saiu na 4.23; a 44, amigos e chat, na 4.24):** desenho próprio em `docs/superpowers/specs/2026-10-14-multiplayer-design.md`; a sala do mundo do chat espera a parte 2 (`save_members`).
```

- [ ] **Passo 5: conferir**

Run: `bun test src/GameInterface/changelog && head -c 3 package.json | od -An -tx1`
Expected: PASS; os 3 primeiros bytes do `package.json` são `7b 0a 20` (sem BOM `ef bb bf`).

- [ ] **Passo 6: commit**

```bash
git add .claude/rules/social.md .claude/rules/project-structure.md src/GameInterface/changelog/changelog.ts package.json docs/ROADMAP.md
git commit -m "docs(social): regra, changelog 4.24 e roadmap" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 21: Verificação final

**Arquivos:** nenhum novo (correções, se aparecerem, voltam à tarefa do arquivo).

- [ ] **Passo 1: suíte em partes** (uma de cada vez; se o processo morrer por memória, rode a mesma parte de novo)

```bash
bun test src/Domain/social src/backend/social src/backend/db.social.test.ts src/backend/auth src/GameInterface/Social src/i18n
bun test src/backend
bun test src/Domain
bun test src/GameInterface src/GameEngine src/lab scripts
```

Expected: todas verdes.

- [ ] **Passo 2: auditoria e tipos**

Run: `bun run ui:audit 2>&1 | tail -5 ; bunx tsc --noEmit 2>&1 | grep -E "social|Social|realtime" ; echo done`
Expected: auditoria sem regressão em relação à `main`; nenhum erro de tipo nos arquivos novos.

- [ ] **Passo 3: navegador com dois usuários**

Subir o servidor de desenvolvimento a partir do caminho real do worktree (PowerShell):

```powershell
$env:DEV_AUTO_LOGIN = "1"; Start-Process bun -ArgumentList "run","dev" -WorkingDirectory "C:\Projects\FMProject-chat"
```

1. Aba A: `http://localhost:3000/api/auth/dev-login` → `/start` → novo jogo (qualquer clube) → Painel.
2. Aba B: `http://127.0.0.1:3000/api/auth/dev-login?as=2` → novo jogo com outro clube → Painel.
3. Em A: clicar "Amigos · 0" → escolher o apelido → copiar o código. Em B: escolher o apelido → aba Adicionar →
   colar o código de A → "Pedido enviado para …".
4. Em A: o selo da barra mostra 1 → aba Pedidos → Aceitar. Os dois veem o outro em "Jogando · <clube>".
5. Em A: clicar no amigo → janela abre → escrever e Enter. Em B: o selo sobe para 1 sem recarregar; abrir a conversa
   zera o selo; responder; A recebe na hora; "digitando…" aparece enquanto o outro escreve.
6. Abrir 4 conversas é impossível com 1 amigo: abrir a mesma, minimizar (vira aba), trocar de tela (Elenco) → a aba
   minimizada volta, o socket reconecta, as mensagens vêm do servidor.
7. Enviar 11 mensagens seguidas → a 11ª mostra "Muitas mensagens seguidas".
8. Em B: menu da linha → Bloquear → Confirmar bloqueio. Em A: o amigo some, a janela fica só leitura ou some ao
   recarregar; a busca de A não acha B; mensagens antigas de A somem para B.
9. Console do navegador sem erros nas duas abas; nenhuma resposta de `/api/social/*` com e-mail ou id (aba Network).

Expected: tudo acima acontece; anotar qualquer desvio e corrigir antes de seguir.

- [ ] **Passo 4: commit final** (só se houve correção na verificação)

```bash
git add -A src .claude docs package.json
git commit -m "fix(social): ajustes da verificação no navegador" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Autorrevisão (feita ao escrever o plano)

- **Cobertura da spec:** apelido (regras, unicidade sem caixa, 30 dias) — T1, T4, T9; código — T1, T4, T9; amizade
  por pedido, cruzado, limites 200/50 — T5, T9; bloqueio (desfaz, cancela pedidos, busca nos dois sentidos, sem pedido
  nem mensagem, mensagens antigas somem, desbloquear não refaz) — T5, T6, T9, T10, T11; salas DM e mundo — T2, T6, T7,
  T10; mensagem 1–500, 10/10 s, 90 dias — T2, T6, T10, T11; status online/offline/playing só para amigos — T7, T8, T11;
  sem e-mail/id — T9, T10; esquema sem apagar — T3; WebSocket com cookie, várias abas, `hello`/`ping`/`typing`,
  eventos — T8, T11; HTTP para envio — T9; rotas da seção 4 — T9, T10; telas (botão, painel, abas, janelas, 3 abertas,
  minimizadas, `sessionStorage`, Enter/Shift+Enter, contador, aviso de limite) — T15–T18; i18n e ícones — T14;
  testes da seção 7 (puros, store/rotas, dois sockets reais, navegador) — T1–T11, T21.
- **Placeholders:** nenhum "TBD"/"adicione validação"; todo código de lógica, store, rotas e componentes está
  completo.
- **Consistência de nomes:** `setNickname`/`SetNicknameResult`, `sendFriendRequest`/`RequestResult`,
  `acceptRequest`/`AcceptResult`, `resolveRoom`/`ResolvedRoom`, `roomParamFor`, `roomRecipients`, `deliverMessage`,
  `notifyUser`, `notifyFriendUpdate`, `statusOf`, `publishStatus`, `sweepStatuses`, `handleSocialUpgrade`,
  `socialWebSocket`, `socialRoutes`, `resetSocialRateLimit`, `socialApi`, `RequestAnswer`, `useSocial`/`SocialProvider`,
  `openInDock`/`closeInDock`/`toggleInDock`, `useRoomTitle` — usados com o mesmo nome em todas as tarefas.
```
