import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { CURRENT_VERSION } from "@/GameInterface/changelog/changelog";
import { Wordmark } from "@/GameInterface/Components/Wordmark";
import { PitchBackdrop } from "@/GameInterface/Components/PitchBackdrop";

type Stage = "email" | "code";

export function LoginScreen() {
  const { t } = useTranslation();
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter your email");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/request-code", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: trimmed }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Could not send code");
        return;
      }
      setStage("code");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCodeSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedCode = code.trim();
    if (trimmedCode.length !== 6) {
      setError("Code must be 6 digits");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/verify", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email.trim(), code: trimmedCode }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Invalid code");
        return;
      }
      window.location.href = "/start";
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "h-10 w-full rounded border border-border bg-transparent px-3 text-foreground placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:outline-none disabled:opacity-50";
  const buttonClass =
    "mt-4 inline-flex h-10 w-full items-center justify-center rounded border-0 bg-primary font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary cursor-pointer disabled:opacity-40 disabled:pointer-events-none";

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background">
      <PitchBackdrop players={false} />

      <div className="relative w-full max-w-[320px] px-4">
        <Wordmark size="md" className="mb-7 block text-center" />

        {stage === "email" ? (
          <form onSubmit={handleEmailSubmit}>
            <label htmlFor="login-email" className="mb-1.5 block text-sm text-muted-foreground">
              {t("login.email")}
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={submitting}
              className={inputClass}
            />
            {error && <p role="alert" className="mt-1.5 text-sm text-destructive">{error}</p>}
            <button type="submit" disabled={submitting} className={buttonClass}>
              {submitting ? "Sending…" : t("login.sendCode")}
            </button>
            <p className="mt-3.5 text-center text-sm text-muted-foreground">{t("login.help")}</p>
          </form>
        ) : (
          <form onSubmit={handleCodeSubmit}>
            <p className="mb-3 text-center text-sm text-muted-foreground">
              {t("common.sentTo")} <span className="text-foreground">{email}</span>
            </p>
            <label htmlFor="login-code" className="mb-1.5 block text-sm text-muted-foreground">
              {t("login.code")}
            </label>
            <input
              id="login-code"
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              disabled={submitting}
              className={`${inputClass} text-center font-mono tracking-[0.5em]`}
            />
            {error && <p role="alert" className="mt-1.5 text-sm text-destructive">{error}</p>}
            <button type="submit" disabled={submitting} className={buttonClass}>
              {submitting ? "Verifying…" : t("login.signIn")}
            </button>
            <button
              type="button"
              onClick={() => { setStage("email"); setCode(""); setError(null); }}
              className="mt-3.5 block w-full cursor-pointer border-0 bg-transparent p-0 text-center text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("common.useADifferentEmail")}
            </button>
          </form>
        )}
      </div>

      <div className="absolute bottom-4 text-sm text-muted-foreground">
        {t("common.version", { version: CURRENT_VERSION })}
      </div>
    </div>
  );
}
