import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Mail, KeyRound, ArrowLeft, ArrowRight } from "lucide-react";

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

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">
      {/* Football Field Background — same as StartScreen */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-[oklch(0.08_0.02_var(--team-hue))] to-transparent">
          <div className="absolute top-4 left-1/2 -translate-x-1/2 w-80 h-24 border-2 border-muted/30 rounded-b-lg">
            <div
              className="w-full h-full"
              style={{
                backgroundImage: `
                  linear-gradient(to right, oklch(0.3 0.02 var(--team-hue)) 1px, transparent 1px),
                  linear-gradient(to bottom, oklch(0.3 0.02 var(--team-hue)) 1px, transparent 1px)
                `,
                backgroundSize: "12px 12px",
              }}
            />
          </div>
        </div>

        <div className="absolute top-28 left-0 right-0 bottom-0 bg-gradient-to-b from-[oklch(0.18_0.04_var(--team-hue))] via-[oklch(0.14_0.03_var(--team-hue))] to-[oklch(0.10_0.02_var(--team-hue))]">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full border-2 border-muted/20" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-muted/20" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-96 h-32 border-t-2 border-l-2 border-r-2 border-muted/15 rounded-t-lg" />
        </div>

        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,oklch(0.08_0.02_var(--team-hue))_100%)]" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4">
        <div className="text-center mb-12">
          <h1 className="text-6xl md:text-8xl font-black tracking-tight font-display">
            <span className="text-foreground">TOUCH</span>
            <span className="text-primary glow-text">LINES</span>
          </h1>
          <p className="mt-4 text-sm md:text-base tracking-[0.4em] text-muted-foreground uppercase font-medium">
            {stage === "email" ? "Sign in to your account" : "Enter the 6-digit code"}
          </p>
        </div>

        {stage === "email" ? (
          <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4 w-full max-w-sm">
            <div className="card-arcade rounded-xl p-1.5">
              <div className="relative flex items-center">
                <Mail className="absolute left-4 w-5 h-5 text-muted-foreground pointer-events-none" />
                <input
                  type="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={submitting}
                  className="w-full bg-transparent border-0 pl-12 pr-4 py-3 text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50"
                />
              </div>
            </div>

            {error && (
              <p className="text-xs text-center text-destructive uppercase tracking-wider font-semibold">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex items-center justify-center gap-3 w-full py-4 px-8 bg-primary text-primary-foreground rounded-xl font-bold text-lg uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-[0.98] glow-primary border-0 cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
            >
              {submitting ? "Sending…" : "Send login code"}
              {!submitting && <ArrowRight className="w-5 h-5" />}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCodeSubmit} className="flex flex-col gap-4 w-full max-w-sm">
            <p className="text-center text-xs text-muted-foreground uppercase tracking-wider">
              {t("common.sentTo")} <span className="text-foreground font-semibold normal-case">{email}</span>
            </p>

            <div className="card-arcade rounded-xl p-1.5">
              <div className="relative flex items-center">
                <KeyRound className="absolute left-4 w-5 h-5 text-muted-foreground pointer-events-none" />
                <input
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
                  className="w-full bg-transparent border-0 pl-12 pr-4 py-3 text-base font-mono tracking-[0.5em] text-center text-foreground placeholder:text-muted-foreground/40 focus:outline-none disabled:opacity-50"
                />
              </div>
            </div>

            {error && (
              <p className="text-xs text-center text-destructive uppercase tracking-wider font-semibold">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex items-center justify-center gap-3 w-full py-4 px-8 bg-primary text-primary-foreground rounded-xl font-bold text-lg uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-[0.98] glow-primary border-0 cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
            >
              {submitting ? "Verifying…" : "Sign in"}
              {!submitting && <ArrowRight className="w-5 h-5" />}
            </button>

            <button
              type="button"
              onClick={() => { setStage("email"); setCode(""); setError(null); }}
              className="flex items-center justify-center gap-2 w-full py-3 px-6 text-muted-foreground font-semibold uppercase tracking-wider text-xs transition-all hover:text-primary cursor-pointer bg-transparent border-0"
            >
              <ArrowLeft className="w-4 h-4" />
              {t("common.useADifferentEmail")}
            </button>
          </form>
        )}

        <div className="absolute bottom-6 text-xs text-muted-foreground/50 font-mono">
          {t("common.version")}
        </div>
      </div>
    </div>
  );
}
