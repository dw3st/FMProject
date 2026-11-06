import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";

/** Rádio Mundo Livre FM (Curitiba, 93.9), the station's public stream (StreamTheWorld), the user's pick (8.8.10). */
export const RADIO_STATION = {
  name: "Mundo Livre FM",
  place: "93,9 · Curitiba",
  stream: "https://playerservices.streamtheworld.com/api/livestream-redirect/MUNDOLIVRE_CWBAAC_64.aac",
} as const;

const VOLUME_KEY = "fm.radio.volume";

function readVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.6;
  } catch {
    return 0.6;
  }
}

/**
 * Play / pause the radio from the footer. Never starts on its own (the browser would block it anyway); the footer
 * stays mounted in the game frame, so it keeps playing from screen to screen and during the match.
 */
export function RadioPlayer() {
  const { t } = useTranslation();
  const audio = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<"off" | "loading" | "on" | "error">("off");
  const [volume, setVolume] = useState(readVolume);

  useEffect(() => () => { audio.current?.pause(); audio.current = null; }, []);
  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
    try { localStorage.setItem(VOLUME_KEY, String(volume)); } catch { /* per-viewer convenience only */ }
  }, [volume]);

  const toggle = () => {
    if (state === "on" || state === "loading") {
      audio.current?.pause();
      if (audio.current) audio.current.src = "";
      audio.current = null;
      setState("off");
      return;
    }
    // A fresh element each time: a live stream resumed after a pause would play minutes behind.
    const a = new Audio(RADIO_STATION.stream);
    a.volume = volume;
    a.addEventListener("playing", () => setState("on"));
    a.addEventListener("error", () => setState("error"));
    audio.current = a;
    setState("loading");
    a.play().catch(() => setState("error"));
  };

  const playing = state === "on" || state === "loading";
  const title = state === "error" ? t("radio.error") : playing ? t("radio.stop", { name: RADIO_STATION.name }) : t("radio.play", { name: RADIO_STATION.name });
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        title={title}
        aria-label={title}
        aria-pressed={playing}
        className="group flex items-center gap-2.5 h-10 px-1 border-0 bg-transparent cursor-pointer whitespace-nowrap text-left"
      >
        <span
          className={`flex items-center justify-center w-8 h-8 rounded-full border transition-colors ${
            playing
              ? "bg-primary border-primary text-primary-foreground"
              : state === "error"
                ? "border-destructive text-destructive"
                : "border-border text-muted-foreground group-hover:border-primary group-hover:text-foreground"
          }`}
        >
          <Icon name={playing ? "pause" : "play"} size={16} className={state === "loading" ? "motion-safe:animate-pulse" : undefined} />
        </span>
        <span className="flex flex-col leading-tight">
          <span className={`text-sm font-semibold ${playing ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"}`}>
            {RADIO_STATION.name}
          </span>
          <span className={`font-display font-bold uppercase tracking-[0.08em] text-[13px] ${playing ? "text-primary" : "text-muted-foreground"}`}>
            {playing ? t("radio.live") : RADIO_STATION.place}
          </span>
        </span>
      </button>
      {playing && (
        <input
          id="radio-volume"
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-label={t("radio.volume")}
          className="w-20 accent-primary cursor-pointer"
        />
      )}
    </span>
  );
}
