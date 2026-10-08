import { useTranslation } from "react-i18next";
import { AwardBadge } from "@/GameInterface/Awards/AwardBadge";
import { goalOfSeasonText, managerResultText, xiLines } from "@/GameInterface/Awards/awardsText";
import { playerHref } from "@/GameInterface/Scouting/scoutingApi";
import type { AwardedPlayer, LeagueAwardKind } from "@/types/awardTypes";
import type { AwardsInboxMessage } from "@/types/inboxTypes";

type T = (key: string, opts?: Record<string, unknown>) => string;

/** Translated subject and preview of an `awards` message (the stored ones are the English fallback). */
export function awardsTexts(message: AwardsInboxMessage, t: T): { subject: string; preview: string } {
  if (message.kind === "league" && message.awards) {
    const a = message.awards;
    return {
      subject: t("inbox.awards.leagueSubject", { league: message.leagueName ?? a.league, season: a.season }),
      preview: a.bestPlayer ? t("inbox.awards.leaguePreview", { player: a.bestPlayer.name }) : message.preview,
    };
  }
  if (message.kind === "world" && message.world) {
    const w = message.world;
    return {
      subject: t("inbox.awards.worldSubject", { year: w.year }),
      preview: t("inbox.awards.worldPreview", { player: w.player[0]?.name ?? "—", manager: w.manager[0]?.name ?? "—" }),
    };
  }
  return { subject: message.subject, preview: message.preview };
}

function PlayerLink({ p, league, mine }: { p: { playerId: string; name: string; squadId: string }; league: string; mine: boolean }) {
  return (
    <a
      href={playerHref(p.playerId, p.squadId, league)}
      className={`font-semibold no-underline hover:text-primary ${mine ? "text-primary" : "text-foreground"}`}
    >
      {p.name}
    </a>
  );
}

/** Body of an `awards` message: the league's winners (the player's club highlighted) or the world ceremony. */
export function AwardsInboxBody({ message }: { message: AwardsInboxMessage }) {
  const { t } = useTranslation();
  if (message.kind === "world" && message.world) {
    const w = message.world;
    return (
      <div className="space-y-4">
        <p className="text-sm text-foreground m-0">{t("inbox.awards.worldLead", { year: w.year })}</p>
        {(["player", "manager"] as const).map((k) => (
          <div key={k}>
            <div className="mb-1"><AwardBadge kind={k === "player" ? "world_player" : "world_manager"} title={String(w.year)} /></div>
            <ol className="m-0 pl-5 space-y-1">
              {w[k].slice(0, 3).map((e) => (
                <li key={e.id} className="text-sm text-foreground">
                  {k === "player"
                    ? <PlayerLink p={{ playerId: e.id, name: e.name, squadId: e.squadId }} league={e.league} mine={false} />
                    : <span className="font-semibold">{e.name}</span>}
                  <span className="text-muted-foreground"> · {e.clubName} · </span>
                  <span className="tabular-nums text-muted-foreground">{t("awards.points", { value: e.score.toFixed(2) })}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    );
  }
  const a = message.awards;
  if (!a) return <p className="text-sm text-foreground m-0">{message.preview}</p>;
  const mine = (squadId: string) => !!message.myClubId && squadId === message.myClubId;
  const singles: [LeagueAwardKind, AwardedPlayer | undefined][] = [
    ["best_player", a.bestPlayer],
    ["young_player", a.youngPlayer],
    ["top_scorer", a.topScorer],
    ["best_goalkeeper", a.bestGoalkeeper],
  ];
  return (
    <div className="space-y-4">
      <ul className="m-0 p-0 list-none space-y-2">
        {singles.map(([kind, p]) => p && (
          <li key={kind} className="flex flex-wrap items-center gap-2 text-sm">
            <AwardBadge kind={kind} title={`${message.leagueName ?? a.league} ${a.season}`} />
            <PlayerLink p={p} league={a.league} mine={mine(p.squadId)} />
            <span className="text-muted-foreground">· {p.clubName} ·</span>
            <span className="tabular-nums text-muted-foreground">
              {kind === "top_scorer" ? t("awards.goals", { count: p.value }) : t("awards.rating", { value: p.value.toFixed(2) })}
            </span>
          </li>
        ))}
      </ul>
      {a.teamOfSeason.length > 0 && (
        <div>
          <div className="mb-1"><AwardBadge kind="team_of_season" /></div>
          <div className="space-y-1">
            {xiLines(a.teamOfSeason).map(([line, players]) => (
              <p key={line} className="text-sm m-0">
                <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground mr-2">
                  {t(`awards.line.${line}`)}
                </span>
                {players.map((p, i) => (
                  <span key={p.playerId}>
                    {i > 0 && <span className="text-muted-foreground">, </span>}
                    <PlayerLink p={p} league={a.league} mine={mine(p.squadId)} />
                  </span>
                ))}
              </p>
            ))}
          </div>
        </div>
      )}
      {a.bestManager && (
        <p className="flex flex-wrap items-center gap-2 text-sm m-0">
          <AwardBadge kind="best_manager" />
          <span className={`font-semibold ${mine(a.bestManager.squadId) ? "text-primary" : "text-foreground"}`}>{a.bestManager.name}</span>
          <span className="text-muted-foreground">· {a.bestManager.clubName} · {managerResultText(a.bestManager, t)}</span>
        </p>
      )}
      {a.goalOfSeason && (
        <p className="flex flex-wrap items-center gap-2 text-sm m-0">
          <AwardBadge kind="goal_of_season" />
          <span className={mine(a.goalOfSeason.squadId) ? "text-primary" : "text-foreground"}>{goalOfSeasonText(a.goalOfSeason, t)}</span>
        </p>
      )}
    </div>
  );
}
