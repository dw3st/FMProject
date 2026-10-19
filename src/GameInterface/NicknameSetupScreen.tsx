import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { PitchBackdrop } from "@/GameInterface/Components/PitchBackdrop";
import { Wordmark } from "@/GameInterface/Components/Wordmark";
import { socialApi } from "@/GameInterface/Social/socialApi";
import type { SocialErrorCode } from "@/types/socialTypes";

/**
 * First sign-in: the account's nickname, chosen once and tied to the e-mail for good. Shown by the `AuthGate`
 * before any screen of the game while `/api/auth/me` has no nickname (`.claude/rules/social.md`).
 */
export function NicknameSetupScreen({ onDone }: { onDone: (nickname: string) => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
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
    if (r.data.nickname) onDone(r.data.nickname);
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background">
      <PitchBackdrop players={false} />
      <div className="relative w-full max-w-[360px] px-4">
        <Wordmark size="lg" className="mb-8 block text-center" />
        <form onSubmit={(e) => void save(e)}>
          <h1 className="mb-2 text-center font-display font-black uppercase tracking-tight text-3xl leading-none">
            {t("social.nickname.title")}
          </h1>
          <p className="mb-5 text-center text-sm text-muted-foreground">{t("social.nickname.setupLead")}</p>
          <label
            htmlFor="setup-nickname"
            className="mb-2 block font-display text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
          >
            {t("social.nickname.label")}
          </label>
          <input
            id="setup-nickname"
            type="text"
            autoFocus
            autoComplete="off"
            maxLength={20}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={busy}
            className="h-10 w-full rounded border border-border bg-transparent px-3 text-foreground focus-visible:border-primary focus-visible:outline-none disabled:opacity-50"
          />
          <p className="mt-2 text-sm text-muted-foreground">{t("social.nickname.hint")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("social.nicknameFinal")}</p>
          {error && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {t(`social.errors.${error}`)}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || value.trim().length < 3}
            className="mt-4 inline-flex h-10 w-full items-center justify-center rounded border-0 bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
          >
            {t("social.nickname.save")}
          </button>
        </form>
      </div>
    </div>
  );
}
