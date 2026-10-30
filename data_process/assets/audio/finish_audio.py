"""Post-processing of the generated match sounds (run with ComfyUI's embedded python: it has av and numpy).

- crowd-bed: the steady stretch of the raw take, crossfaded into a seamless loop.
- crowd-rise: the cheer later in the same take.
- goal-roar: starts where the roar begins. near-miss: faded in and out.
Writes MP3 next to the others (src/example_data/assets/audio).

    ConfyUI/python_embeded/python.exe -I data_process/assets/audio/finish_audio.py
"""
from pathlib import Path

import av
import numpy as np

HERE = Path(__file__).resolve().parent
OUT = HERE.parents[2] / "src" / "example_data" / "assets" / "audio"


def load(path: Path) -> tuple[np.ndarray, int]:
    c = av.open(str(path))
    s = c.streams.audio[0]
    frames = [f.to_ndarray() for f in c.decode(s)]
    x = np.concatenate(frames, axis=1).astype(np.float32)  # (channels, samples)
    if x.shape[0] == 1:
        x = np.vstack([x, x])
    return x, s.rate


def save(path: Path, x: np.ndarray, sr: int) -> None:
    x = np.clip(x, -1, 1).astype(np.float32)
    c = av.open(str(path), "w")
    st = c.add_stream("mp3", rate=sr)
    st.layout = "stereo"
    frame = av.AudioFrame.from_ndarray(np.ascontiguousarray(x), format="fltp", layout="stereo")
    frame.sample_rate = sr
    for p in st.encode(frame):
        c.mux(p)
    for p in st.encode(None):
        c.mux(p)
    c.close()


def cut(x: np.ndarray, sr: int, a: float, b: float) -> np.ndarray:
    return x[:, int(a * sr):int(b * sr)]


def fade(x: np.ndarray, sr: int, fin: float, fout: float) -> np.ndarray:
    y = x.copy()
    n_in, n_out = int(fin * sr), int(fout * sr)
    if n_in:
        y[:, :n_in] *= np.linspace(0, 1, n_in)
    if n_out:
        y[:, -n_out:] *= np.linspace(1, 0, n_out)
    return y


def normalize(x: np.ndarray, peak: float = 0.9) -> np.ndarray:
    m = np.abs(x).max()
    return x * (peak / m) if m > 0 else x


def loop(x: np.ndarray, sr: int, xfade: float) -> np.ndarray:
    """The last `xfade` seconds blended into the first ones: the end flows into the start."""
    n = int(xfade * sr)
    body, tail = x[:, :-n], x[:, -n:]
    w = np.linspace(0, 1, n)
    body = body.copy()
    body[:, :n] = body[:, :n] * np.sqrt(w) + tail * np.sqrt(1 - w)
    return body


def main() -> None:
    raw, sr = load(HERE / "crowd-bed-raw.mp3")
    save(OUT / "crowd-bed.mp3", normalize(loop(cut(raw, sr, 2.0, 14.5), sr, 1.5), 0.8), sr)
    save(OUT / "crowd-rise.mp3", normalize(fade(cut(raw, sr, 14.5, 20.0), sr, 0.4, 1.2)), sr)
    roar, sr2 = load(OUT / "goal-roar.mp3")
    save(OUT / "goal-roar.mp3", normalize(fade(cut(roar, sr2, 2.3, 9.0), sr2, 0.15, 1.5)), sr2)
    ooh, sr3 = load(OUT / "near-miss.mp3")
    save(OUT / "near-miss.mp3", normalize(fade(ooh, sr3, 0.2, 1.4)), sr3)
    print("ok")


if __name__ == "__main__":
    main()
