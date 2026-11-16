import { Icon } from "@/GameInterface/Icons";
import { REACTION_ICON } from "@/GameInterface/World/reactionIcons";
import { reactionArtUrl } from "@/GameInterface/World/reactionSounds";
import type { ReactionId } from "@/types/rivalsTypes";

/** A taunt reaction's icon: the painted medal with the new visual, else the drawn one. */
export function ReactionIcon({ id, size }: { id: ReactionId; size: number }) {
  const art = reactionArtUrl(id);
  if (art) return <img src={art} alt="" width={size} height={size} className="shrink-0 select-none" draggable={false} />;
  return <Icon name={REACTION_ICON[id]} size={size} />;
}
