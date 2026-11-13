import { useTranslation } from "react-i18next";
import { formatEuros } from "@/Domain/money";
import { formatGameDate } from "@/GameInterface/formatDate";
import { Button } from "@/GameInterface/ui/Button";
import { navigate } from "@/GameInterface/router/navigation";
import type { InboxMessage } from "@/types/inboxTypes";

type SponsorMessage = Extract<InboxMessage, { category: "sponsor" }>;
type T = (key: string, opts?: Record<string, unknown>) => string;

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";
const SPONSORS_HREF = "/finances?tab=sponsors";

/** "Master sponsor (3), Pitch boards (6)". */
function offerList(message: SponsorMessage, t: T): string {
  return (message.offers ?? []).map((o) => t("inbox.sponsor.offerCount", { slot: t(`sponsors.slot.${o.slot}`), count: o.count })).join(", ");
}

/** Subject and preview of a sponsor message, in the player's language (the stored text is an English fallback). */
export function sponsorInboxTexts(message: SponsorMessage, t: T, lang: string): { subject: string; preview: string } {
  const subject = t(`inbox.sponsor.subject.${message.kind}`);
  if (message.kind === "offers") {
    return { subject, preview: t("inbox.sponsor.preview.offers", { list: offerList(message, t), date: formatGameDate(message.expires, lang) }) };
  }
  if (message.kind === "auto_signed") {
    return { subject, preview: (message.signed ?? []).map((s) => s.company).join(", ") };
  }
  const total = (message.bonuses ?? []).reduce((sum, b) => sum + b.amount, 0);
  return {
    subject,
    preview: t("inbox.sponsor.preview.season_review", {
      bonus: formatEuros(total), renewals: (message.renewals ?? []).length, left: (message.left ?? []).length,
    }),
  };
}

function Lines({ title, lines }: { title: string; lines: { key: string; name: string; detail: string }[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className={LABEL}>{title}</span>
      <ul className="m-0 p-0 list-none flex flex-col gap-0.5">
        {lines.map((l) => (
          <li key={l.key} className="text-sm text-foreground tabular-nums">
            <span className="font-semibold">{l.name}</span>
            <span className="text-muted-foreground">{` · ${l.detail}`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Sponsor news (`.claude/rules/game/sponsors.md`): offers on the table, what the director signed, the season's review. */
export function SponsorInboxBody({ message }: { message: SponsorMessage }) {
  const { t, i18n } = useTranslation();
  const slot = (s: string) => t(`sponsors.slot.${s}`);
  const bonuses = message.bonuses ?? [];
  const renewals = message.renewals ?? [];
  const left = message.left ?? [];
  return (
    <div className="flex flex-col gap-3 text-sm">
      {message.kind === "offers" && (
        <p className="m-0 text-foreground">
          {t("inbox.sponsor.body.offers", { list: offerList(message, t), date: formatGameDate(message.expires, i18n.language) })}
        </p>
      )}
      {message.kind === "auto_signed" && (
        <>
          <p className="m-0 text-foreground">{t("inbox.sponsor.body.auto_signed")}</p>
          <Lines
            title={t("inbox.sponsor.signed")}
            lines={(message.signed ?? []).map((s, i) => ({
              key: `${s.company}${i}`, name: s.company,
              detail: t("inbox.sponsor.signedLine", { slot: slot(s.slot), value: formatEuros(s.annual), count: s.years }),
            }))}
          />
        </>
      )}
      {message.kind === "season_review" && (
        <>
          <p className="m-0 text-foreground">
            {bonuses.length + renewals.length + left.length === 0 ? t("inbox.sponsor.body.season_review_quiet") : t("inbox.sponsor.body.season_review")}
          </p>
          <Lines
            title={t("inbox.sponsor.bonuses")}
            lines={bonuses.map((b, i) => ({ key: `${b.company}${i}`, name: b.company, detail: `${slot(b.slot)} · +${formatEuros(b.amount)}` }))}
          />
          <Lines
            title={t("inbox.sponsor.renewals")}
            lines={renewals.map((r, i) => ({
              key: `${r.company}${i}`, name: r.company,
              detail: `${slot(r.slot)} · ${t("sponsors.perSeason", { value: formatEuros(r.annual) })}`,
            }))}
          />
          <Lines
            title={t("inbox.sponsor.left")}
            lines={left.map((l, i) => ({ key: `${l.company}${i}`, name: l.company, detail: `${slot(l.slot)} · ${t(`inbox.sponsor.leftReason.${l.reason}`)}` }))}
          />
        </>
      )}
      <Button className="w-fit" onClick={() => { navigate(SPONSORS_HREF); }}>{t("inbox.sponsor.open")}</Button>
    </div>
  );
}
