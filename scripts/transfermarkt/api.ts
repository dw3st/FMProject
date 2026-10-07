// Parsers das respostas da API local felipeall/transfermarkt-api (ver data_process/transfermarkt/README.md).
export interface TmClub { id: string; name: string }
export interface TmPlayer {
  id: string;
  name: string;
  position: string | null;
  birthDate: string | null;
  age: number | null;
  heightCm: number | null;
  value: number | null;
  nationality: string | null;
}

const asString = (v: unknown): string | null => {
  if (typeof v === "string") return v.trim() === "" ? null : v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
};

const asNumber = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Número passa; "€45.00m" → 45e6, "€500k" → 5e5, "€1.20bn" → 1.2e9; null/"-" → null. */
export function parseMarketValue(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const m = v.trim().toLowerCase().replace(/[€$£\s,]/g, "").match(/^(\d+(?:\.\d+)?)(bn|m|k)?$/);
  if (!m) return null;
  const mult = m[2] === "bn" ? 1e9 : m[2] === "m" ? 1e6 : m[2] === "k" ? 1e3 : 1;
  return Math.round(Number(m[1]) * mult);
}

/** 184 → 184; 1.84 → 184; "1,84 m" → 184; null → null. */
export function parseHeightCm(v: unknown): number | null {
  let n: number;
  if (typeof v === "number") n = v;
  else if (typeof v === "string") {
    const m = v.replace(",", ".").match(/\d+(?:\.\d+)?/);
    if (!m) return null;
    n = Number(m[0]);
  } else return null;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n < 3 ? n * 100 : n);
}

export function parseCompetitionClubs(body: unknown): TmClub[] {
  const clubs = (body as { clubs?: unknown } | null)?.clubs;
  if (!Array.isArray(clubs)) throw new Error("resposta sem array clubs");
  return clubs.map((c, i) => {
    const id = asString((c as any)?.id);
    const name = asString((c as any)?.name);
    if (!id || !name) throw new Error(`clube ${i} sem id/name`);
    return { id, name };
  });
}

export function parseClubPlayers(body: unknown): TmPlayer[] {
  const players = (body as { players?: unknown } | null)?.players;
  if (!Array.isArray(players)) throw new Error("resposta sem array players");
  return players.map((p, i) => {
    const id = asString((p as any)?.id);
    const name = asString((p as any)?.name);
    if (!id || !name) throw new Error(`jogador ${i} sem id/name`);
    const nat = (p as any).nationality;
    return {
      id,
      name,
      position: asString((p as any).position),
      birthDate: asString((p as any).dateOfBirth),
      age: asNumber((p as any).age),
      heightCm: parseHeightCm((p as any).height),
      value: parseMarketValue((p as any).marketValue),
      nationality: Array.isArray(nat) ? asString(nat[0]) : asString(nat),
    };
  });
}
