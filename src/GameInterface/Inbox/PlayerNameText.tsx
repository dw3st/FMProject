import { Fragment, useState } from "react";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { navigate } from "@/GameInterface/router/navigation";

export interface NamedPlayer { id: string; name: string }

/** Splits `text` around the names, longest first, so a name inside another never breaks it. Pure. */
export function splitByNames(text: string, players: readonly NamedPlayer[]): (string | NamedPlayer)[] {
  const named = [...players].filter((p) => p.name.length > 0).sort((a, b) => b.name.length - a.name.length);
  if (named.length === 0) return [text];
  const out: (string | NamedPlayer)[] = [];
  let rest = text;
  while (rest.length > 0) {
    let at = -1;
    let hit: NamedPlayer | null = null;
    for (const p of named) {
      const i = rest.indexOf(p.name);
      if (i >= 0 && (at < 0 || i < at)) { at = i; hit = p; }
    }
    if (!hit) { out.push(rest); break; }
    if (at > 0) out.push(rest.slice(0, at));
    out.push(hit);
    rest = rest.slice(at + hit.name.length);
  }
  return out;
}

/** A player's name that opens his page, wherever he plays now. */
export function PlayerNameLink({ player }: { player: NamedPlayer }) {
  const { session } = useGameSave();
  const [gone, setGone] = useState(false);
  if (gone || !session) return <span className="font-semibold">{player.name}</span>;
  async function open() {
    const res = await fetch(`/api/saves/${session!.saveId}/players/${encodeURIComponent(player.id)}/where`).catch(() => null);
    if (!res?.ok) { setGone(true); return; }
    const at = (await res.json()) as { league: string; squadId: string };
    navigate(`/player/${encodeURIComponent(at.league)}/${encodeURIComponent(at.squadId)}/${encodeURIComponent(player.id)}`);
  }
  return <a href="#" onClick={(e) => { e.preventDefault(); void open(); }} className="font-semibold text-primary hover:underline">{player.name}</a>;
}

/** A line of text with the players' names as links. */
export function PlayerNameText({ text, players }: { text: string; players: readonly NamedPlayer[] }) {
  return <>{splitByNames(text, players).map((part, i) => <Fragment key={i}>{typeof part === "string" ? part : <PlayerNameLink player={part} />}</Fragment>)}</>;
}
