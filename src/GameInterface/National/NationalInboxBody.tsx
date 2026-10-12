import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { Flag } from "@/GameInterface/Components/Flag";
import { formatDay } from "@/GameInterface/Dashboard/HomeCards";
import { playerHref } from "@/GameInterface/Scouting/scoutingApi";
import { nationalityDisplayName } from "@/Domain/world/labels";
import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";
import type { NationalInboxMessage } from "@/types/inboxTypes";

/** Body of the `national` inbox message: who was called up (and until when) or who came back. */
export function NationalInboxBody({ message }: { message: NationalInboxMessage }) {
  const { t, i18n } = useTranslation();
  const { session } = useGameSave();
  const clubId = session?.clubId ?? "";
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-foreground m-0">{t(`national.inbox.body.${message.kind}`, { count: message.players.length })}</p>
      <ul className="m-0 p-0 list-none flex flex-col gap-1">
        {message.players.map((p) => {
          const code = nationalityFlagCode(p.nation);
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
              {code && <Flag code={code} />}
              <a href={playerHref(p.id, clubId)} className="font-semibold text-foreground no-underline hover:underline">{p.name}</a>
              <span className="text-muted-foreground">{nationalityDisplayName(p.nation, i18n.language, t)}</span>
              {message.kind === "called_up" && p.until && (
                <span className="text-muted-foreground tabular-nums">{t("national.inbox.until", { date: formatDay(p.until, i18n.language) })}</span>
              )}
              {message.kind === "returned" && (
                <span className="text-muted-foreground tabular-nums">{t("national.inbox.tally", { apps: p.apps ?? 0, goals: p.goals ?? 0 })}</span>
              )}
              {message.kind === "returned" && p.injured && <span className="text-destructive">{t("national.inbox.injured")}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
