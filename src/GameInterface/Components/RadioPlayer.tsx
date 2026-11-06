import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { nextStationIndex, RADIO_STATIONS, stationIndexOf } from "@/GameInterface/Components/radioStations";

const VOLUME_KEY = "fm.radio.volume";
const STATION_KEY = "fm.radio.station";

function readVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.6;
  } catch {
    return 0.6;
  }
}

function readStation(): number {
  try {
    return stationIndexOf(localStorage.getItem(STATION_KEY));
  } catch {
    return 0;
  }
}

/**
 * Play / pause the radio from the footer. Never starts on its own (the browser would block it anyway); the footer
 * stays mounted in the game frame, so it keeps playing from screen to screen and during the match. The arrow inside
 * the pill goes to the next station (8.8.16); playing, the next one starts at once.
 */
export function RadioPlayer() {
  const { t } = useTranslation();
  const audio = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<"off" | "loading" | "on" | "error">("off");
  const [volume, setVolume] = useState(readVolume);
  const [stationIdx, setStationIdx] = useState(readStation);
  const station = RADIO_STATIONS[stationIdx]!;

  useEffect(() => () => { audio.current?.pause(); audio.current = null; }, []);
  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
    try { localStorage.setItem(VOLUME_KEY, String(volume)); } catch { /* per-viewer convenience only */ }
  }, [volume]);

  const stop = () => {
    audio.current?.pause();
    if (audio.current) audio.current.src = "";
    audio.current = null;
  };

  const start = (stream: string) => {
    // A fresh element each time: a live stream resumed after a pause would play minutes behind.
    const a = new Audio(stream);
    a.volume = volume;
    a.addEventListener("playing", () => { if (audio.current === a) setState("on"); });
    a.addEventListener("error", () => { if (audio.current === a) setState("error"); });
    audio.current = a;
    setState("loading");
    a.play().catch(() => { if (audio.current === a) setState("error"); });
  };

  const playing = state === "on" || state === "loading";

  const toggle = () => {
    if (playing) {
      stop();
      setState("off");
      return;
    }
    start(station.stream);
  };

  const next = () => {
    const idx = nextStationIndex(stationIdx);
    setStationIdx(idx);
    try { localStorage.setItem(STATION_KEY, RADIO_STATIONS[idx]!.id); } catch { /* per-viewer convenience only */ }
    if (playing) {
      stop();
      start(RADIO_STATIONS[idx]!.stream);
    } else {
      setState("off");
    }
  };

  const title = state === "error" ? t("radio.error") : playing ? t("radio.stop", { name: station.name }) : t("radio.play", { name: station.name });
  const nextName = RADIO_STATIONS[nextStationIndex(stationIdx)]!.name;
  return (
    <span className="flex items-center gap-2">
      <span
        className={`flex items-center h-8 rounded-full border transition-colors ${
          playing
            ? "border-primary bg-primary/15 text-primary"
            : state === "error"
              ? "border-destructive text-destructive"
              : "border-border text-muted-foreground hover:border-primary"
        }`}
      >
        <button
          type="button"
          onClick={toggle}
          title={title}
          aria-label={title}
          aria-pressed={playing}
          className="flex items-center gap-2 h-full pl-3 pr-2 border-0 bg-transparent text-inherit cursor-pointer whitespace-nowrap text-sm font-semibold hover:text-foreground"
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
          {station.name}
        </button>
        {RADIO_STATIONS.length > 1 && (
          <button
            type="button"
            onClick={next}
            title={t("radio.next", { name: nextName })}
            aria-label={t("radio.next", { name: nextName })}
            className="flex items-center justify-center h-full w-8 border-0 border-l border-solid border-current/25 bg-transparent text-inherit cursor-pointer rounded-r-full hover:text-foreground"
          >
            <Icon name="chevron-right" size={16} />
          </button>
        )}
      </span>
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
