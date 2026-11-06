import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";

/** Rádio Mundo Livre FM (Curitiba, 93.9), the station's public stream (StreamTheWorld), the user's pick (8.8.10). */
export const RADIO_STATION = {
  name: "Mundo Livre FM",
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
        className={`flex items-center gap-2 h-8 px-3 rounded-full border cursor-pointer whitespace-nowrap text-sm font-semibold transition-colors ${
          playing
            ? "border-primary bg-primary/15 text-primary"
            : state === "error"
              ? "border-destructive bg-transparent text-destructive"
              : "border-border bg-transparent text-muted-foreground hover:border-primary hover:text-foreground"
        }`}
      >
        {state === "on" ? (
          <span className="flex items-end gap-[2px] h-3.5 w-4" aria-hidden="true">
            <span className="radio-eq-bar w-[3px] h-full rounded-sm bg-primary" />
            <span className="radio-eq-bar w-[3px] h-full rounded-sm bg-primary" />
            <span className="radio-eq-bar w-[3px] h-full rounded-sm bg-primary" />
          </span>
        ) : (
          <Icon name="radio" size={16} className={state === "loading" ? "motion-safe:animate-pulse" : undefined} />
        )}
        {RADIO_STATION.name}
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
