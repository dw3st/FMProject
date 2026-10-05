import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { formatDay } from "@/GameInterface/Dashboard/HomeCards";
import { MORALE } from "@/Domain/morale/moraleConfig";
import type { PlayerPromise, TalkRequest } from "@/types/moraleTypes";

/** One promise with its deadline: minutes in the next 5 matches, or a sale / renewal by a date. */
export function PromiseLine({ promise, showName = true }: { promise: PlayerPromise; showName?: boolean }) {
  const { t, i18n } = useTranslation();
  const text = promise.kind === "minutes"
    ? t("morale.promise.minutes", {
        target: promise.target ?? 1, played: promise.played ?? 0,
        left: MORALE.WINDOW - (promise.matches ?? 0),
      })
    : t(`morale.promise.${promise.kind}`, { date: formatDay(promise.until ?? "", i18n.language) });
  return (
    <span className="inline-flex items-center gap-2 text-sm text-foreground">
      <Icon name="handshake" size={16} className="text-chart-4 shrink-0" />
      {showName && <span className="font-semibold">{promise.playerName}</span>}
      <span className="text-muted-foreground">{text}</span>
    </span>
  );
}

/**
 * Promises block of the own squad (`.claude/rules/game/morale.md`): open talk requests and promises
 * with their deadlines. Hidden when nothing is open.
 */
export function MoralePromises({
  talks, promises, playerHref,
}: {
  talks: TalkRequest[];
  promises: PlayerPromise[];
  playerHref: (playerId: string) => string;
}) {
  const { t, i18n } = useTranslation();
  if (talks.length === 0 && promises.length === 0) return null;
  return (
    <section className="border border-border rounded-md p-4 space-y-2">
      <h2 className="font-display font-black uppercase text-xl leading-none m-0">{t("morale.promisesTitle")}</h2>
      <ul className="list-none m-0 p-0 grid gap-1 sm:grid-cols-2">
        {talks.map((x) => (
          <li key={x.id}>
            <a href={playerHref(x.playerId)} className="inline-flex items-center gap-2 text-sm text-foreground no-underline hover:text-primary">
              <Icon name="talk" size={16} className="text-chart-4 shrink-0" />
              <span className="font-semibold">{x.playerName}</span>
              <span className="text-muted-foreground">
                {t(`morale.reason.${x.reason}`, { club: x.clubName ?? "" })} · {t("morale.until", { date: formatDay(x.expires, i18n.language) })}
              </span>
            </a>
          </li>
        ))}
        {promises.map((p) => (
          <li key={p.id}>
            <a href={playerHref(p.playerId)} className="no-underline hover:text-primary">
              <PromiseLine promise={p} />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
