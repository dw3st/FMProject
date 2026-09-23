import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  Play,
  Shield,
  Search,
  BarChart3,
  Zap,
  Monitor,
  Smartphone,
  Gamepad2,
  Globe,
  Twitter,
  Github,
} from "lucide-react";

const getNavLinks = (t: any) => [
  { name: t("landing.navHome"), href: "#" },
  { name: t("landing.navPlay"), href: "/start" },
  { name: t("landing.navFeatures"), href: "#features" },
  { name: t("landing.navFaq"), href: "#faq" },
];

const getStats = (t: any) => [
  { label: t("landing.managersOnline"), value: "7 MIN" },
  { label: t("landing.transferVolume"), value: "5" },
  { label: t("landing.simEfficiency"), value: "3" },
  { label: t("landing.matchSpeed"), value: "HYPER" },
];

const getFeatures = (t: any) => [
  {
    icon: Shield,
    title: t("landing.featureManageTitle"),
    description: t("landing.featureManageDescription"),
  },
  {
    icon: Search,
    title: t("landing.featureScoutTitle"),
    description: t("landing.featureScoutDescription"),
  },
  {
    icon: BarChart3,
    title: t("landing.featureFinanceTitle"),
    description: t("landing.featureFinanceDescription"),
  },
  {
    icon: Zap,
    title: t("landing.featureArcadeTitle"),
    description: t("landing.featureArcadeDescription"),
  },
];

const getFaqs = (t: any) => [
  {
    question: t("landing.faqQ1"),
    answer: t("landing.faqA1"),
  },
  {
    question: t("landing.faqQ2"),
    answer: t("landing.faqA2"),
  },
  {
    question: t("landing.faqQ3"),
    answer: t("landing.faqA3"),
  },
  {
    question: t("landing.faqQ4"),
    answer: t("landing.faqA4"),
  },
  {
    question: t("landing.faqQ5"),
    answer: t("landing.faqA5"),
  },
  {
    question: t("landing.faqQ6"),
    answer: t("landing.faqA6"),
  },
];

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-bold uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-[0.98] glow-primary no-underline border-0 cursor-pointer";

const OUTLINE_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-border/50 bg-transparent text-foreground font-bold uppercase tracking-wider transition-all hover:border-foreground/50 hover:bg-card/30 no-underline cursor-pointer";

// Public source repository. AGPL-3.0 requires network users be able to obtain the source.
const SOURCE_REPO_URL = "https://github.com/brenosss/touchlines";
const LICENSE_URL = "https://www.gnu.org/licenses/agpl-3.0.html";
// Promo video, served from Cloudflare R2.
const PROMO_VIDEO_URL =
  "https://pub-4082975a6d4d4fa8b72dbaa31298f847.r2.dev/touchlines-promo.mp4";

export function LandingScreen() {
  const { t } = useTranslation();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const navLinks = getNavLinks(t);
  const stats = getStats(t);
  const features = getFeatures(t);
  const faqs = getFaqs(t);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/30">
        <nav className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <a
            href="/"
            className="text-xl font-black font-display tracking-wider no-underline text-foreground"
          >
{t("common.touchlines").split(" ")[0]}<span className="text-primary">{t("common.touchlines").split(" ")[1]}</span>
          </a>

          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link, index) => (
              <a
                key={link.name}
                href={link.href}
                className={`text-sm font-medium transition-colors uppercase tracking-wider no-underline ${
                  index === 0
                    ? "text-foreground border-b-2 border-primary pb-0.5"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.name}
              </a>
            ))}
          </div>

          <a href="/start" className={`${PRIMARY_BUTTON} h-9 px-4 text-sm`}>
            {t("landing.playNow")}
          </a>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center pt-16 px-6">
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/20 rounded-full blur-[150px]" />
        </div>

        <div className="relative z-10 text-center max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex flex-wrap items-center justify-center gap-2 mb-6">
            <span className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-primary/20 border border-primary/50 rounded text-xs font-bold uppercase tracking-widest text-primary">
              <Github className="w-3.5 h-3.5" />
              {t("landing.freeOpenSource")}
            </span>
            <span className="px-4 py-1.5 bg-card/40 border border-border/60 rounded text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {t("landing.heroBadge")}
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-black font-display uppercase leading-tight mb-6">
            {t("common.touchlines").split(" ")[0]}<span className="text-primary glow-text">{t("common.touchlines").split(" ")[1]}</span>
          </h1>

          {/* Subtitle */}
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
            {t("landing.heroSubtitle")}
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-4 mb-4">
            <a href="/start" className={`${PRIMARY_BUTTON} h-11 px-8`}>
              {t("landing.startYourLegacy")}
            </a>
            <a href="#trailer" className={`${OUTLINE_BUTTON} h-11 px-8`}>
              <Play className="w-4 h-4 mr-2 fill-current" />
              {t("landing.viewTrailer")}
            </a>
            <a
              href={SOURCE_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className={`${OUTLINE_BUTTON} h-11 px-8`}
            >
              <Github className="w-4 h-4 mr-2" />
              {t("landing.starOnGithub")}
            </a>
          </div>

          {/* Free / open-source reassurance */}
          <p className="text-xs text-muted-foreground/80 mb-16">
            {t("landing.freeTagline")}
          </p>

          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-12 pt-8 border-t border-border/30">
            {stats.map((stat, index) => (
              <div key={index} className="text-left">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  {stat.label}
                </p>
                <p className="text-xl md:text-2xl font-black font-display text-foreground">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Video Demo Section */}
      <section id="trailer" className="relative py-24 px-6 scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          {/* Section Header */}
          <div className="mb-8">
            <h2 className="text-3xl lg:text-4xl font-black font-display uppercase mb-3">
              {t("landing.tacticalDominance1")} <span className="text-primary italic">{t("landing.tacticalDominance2")}</span>
            </h2>
            <p className="text-muted-foreground text-sm max-w-lg">
              {t("landing.tacticalDescription")}
            </p>
          </div>

          {/* Video Player */}
          <div className="relative rounded-xl overflow-hidden border border-border/30 bg-black glow-primary">
            <video
              className="w-full aspect-video bg-black"
              controls
              playsInline
              preload="metadata"
            >
              <source src={PROMO_VIDEO_URL} type="video/mp4" />
            </video>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <div
                key={index}
                className="group p-6 rounded-xl bg-card/20 border border-border/20 hover:border-primary/30 hover:bg-card/40 transition-all duration-300"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary/20 transition-colors">
                  <feature.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-xs font-black font-display uppercase tracking-wider mb-3">
                  {feature.title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="relative py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-black font-display uppercase mb-3">
              {t("landing.faqTitle1")}{" "}
              <span className="text-primary italic underline underline-offset-4 decoration-2">
                {t("landing.faqTitle2")}
              </span>
            </h2>
            <p className="text-muted-foreground text-sm">
              {t("landing.faqSubtitle")}
            </p>
          </div>

          <div className="space-y-2">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="rounded-lg overflow-hidden border border-border/20 hover:border-border/40 transition-colors bg-card/10"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-card/20 transition-colors bg-transparent border-0 cursor-pointer"
                >
                  <span className="font-bold font-display uppercase tracking-wider text-xs pr-4">
                    {faq.question}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 flex-shrink-0 text-primary transition-transform duration-200 ${
                      openFaq === index ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ${
                    openFaq === index ? "max-h-40" : "max-h-0"
                  }`}
                >
                  <p className="px-4 pb-4 text-muted-foreground text-sm leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-24 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-primary/10 to-primary/5" />
        <div className="absolute inset-0 opacity-20">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(circle at 2px 2px, rgba(16, 185, 129, 0.3) 1px, transparent 0)`,
              backgroundSize: "24px 24px",
            }}
          />
        </div>

        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <h2 className="text-3xl lg:text-5xl font-black font-display uppercase mb-4">
            {t("landing.readyKick1")} <span className="text-primary glow-text italic">{t("landing.readyKick2")}</span>?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-lg mx-auto text-sm">
            {t("landing.joinArcadeRevolution")}
          </p>

          <a href="/start" className={`${PRIMARY_BUTTON} h-11 px-10`}>
            {t("landing.startPlayingFree")}
          </a>

          <div className="flex items-center justify-center gap-4 mt-10">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {t("landing.availableOn")}
            </span>
            <div className="flex items-center gap-3 text-muted-foreground/70">
              <Monitor className="w-4 h-4" />
              <span
                className="relative inline-flex items-center"
                title={t("landing.mobileComingSoon")}
              >
                <Smartphone className="w-4 h-4 opacity-30" />
                <span className="absolute -top-2 -right-3 px-1 py-px text-[7px] font-bold uppercase tracking-wider bg-primary/20 border border-primary/40 rounded text-primary leading-none">
                  {t("landing.soon")}
                </span>
              </span>
              <Gamepad2 className="w-4 h-4" />
              <Globe className="w-4 h-4" />
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/20 py-6 px-6">
        {/* Open-source notice */}
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center pb-5 mb-5 border-b border-border/10">
          <Github className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] text-muted-foreground">
            {t("landing.openSourceNote")}
          </span>
          <a
            href={SOURCE_REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] font-semibold text-primary hover:underline no-underline"
          >
            {t("landing.viewSource")}
          </a>
          <span className="text-[11px] text-muted-foreground/40">·</span>
          <span className="text-[11px] text-muted-foreground">
            {t("landing.licensedUnder")}
          </span>
          <a
            href={LICENSE_URL}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] font-semibold text-primary hover:underline no-underline"
          >
            AGPL-3.0
          </a>
        </div>

        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-col md:flex-row items-center gap-3">
            <span className="font-black font-display text-sm tracking-wider">
              {t("common.touchlines")}
            </span>
            <span className="text-[10px] text-muted-foreground/60">
              {t("landing.footerText")}
            </span>
          </div>

          <div className="flex items-center gap-6">
            <a
              href="#"
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider no-underline"
            >
              {t("landing.termsOfService")}
            </a>
            <a
              href="#"
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider no-underline"
            >
              {t("landing.privacyPolicy")}
            </a>
            <a
              href="#"
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider no-underline"
            >
              {t("landing.support")}
            </a>
            <a
              href="#"
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider no-underline"
            >
              {t("landing.pressKit")}
            </a>
            <div className="flex items-center gap-2 ml-2">
              <a
                href="#"
                className="text-muted-foreground/60 hover:text-foreground transition-colors no-underline"
              >
                <Twitter className="w-3.5 h-3.5" />
              </a>
              <a
                href={SOURCE_REPO_URL}
                target="_blank"
                rel="noreferrer"
                aria-label={t("landing.viewSource")}
                className="text-muted-foreground/60 hover:text-foreground transition-colors no-underline"
              >
                <Github className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
