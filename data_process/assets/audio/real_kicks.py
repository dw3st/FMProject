"""Real ball strikes (CC0, Freesound): downloads the previews listed in a rows JSON, cuts each hit out of the recording
and builds a listening page with them. Run with ComfyUI's embedded python (av, numpy, scipy).

    ConfyUI/python_embeded/python.exe -I data_process/assets/audio/real_kicks.py <rows.json> <out dir>
"""
import base64
import json
import sys
import urllib.request
from pathlib import Path

import av
import numpy as np
from scipy.signal import butter, sosfilt

AUDIO = Path(__file__).resolve().parents[2].parent / "src" / "example_data" / "assets" / "audio"
SR = 44100
HITS_PER_SOURCE = 3
SKIP_LONGER_THAN_S = 60  # A whole match recorded from far away: the kicks drown.


def load(path: Path) -> np.ndarray:
    c = av.open(str(path))
    res = av.AudioResampler(format="fltp", layout="mono", rate=SR)
    out = [g.to_ndarray()[0] for f in c.decode(c.streams.audio[0]) for g in res.resample(f)]
    return np.concatenate(out).astype(np.float32)


def save(path: Path, mono: np.ndarray) -> None:
    x = np.clip(np.vstack([mono, mono]), -1, 1).astype(np.float32)
    c = av.open(str(path), "w")
    st = c.add_stream("mp3", rate=SR)
    st.layout = "stereo"
    frame = av.AudioFrame.from_ndarray(np.ascontiguousarray(x), format="fltp", layout="stereo")
    frame.sample_rate = SR
    for p in st.encode(frame):
        c.mux(p)
    for p in st.encode(None):
        c.mux(p)
    c.close()


def hits(x: np.ndarray) -> list[int]:
    """Strongest onsets, at least 250 ms apart: where the short-term energy jumps."""
    win = int(0.005 * SR)
    energy = np.convolve(x ** 2, np.ones(win) / win, "same")
    rise = np.maximum(0, energy[win:] - energy[:-win])
    order = np.argsort(rise)[::-1]
    picked: list[int] = []
    floor = rise[order[0]] * 0.15
    for i in order[:20000]:
        if rise[i] < floor or len(picked) >= HITS_PER_SOURCE:
            break
        if all(abs(int(i) - p) > int(0.25 * SR) for p in picked):
            picked.append(int(i))
    return sorted(picked)


def cut(x: np.ndarray, at: int, seconds: float = 0.3) -> np.ndarray:
    sos = butter(2, 60.0, "high", fs=SR, output="sos")
    y = sosfilt(sos, x)
    start = max(0, at - int(0.002 * SR))
    y = y[start: start + int(seconds * SR)].astype(np.float32).copy()
    fade_in = int(0.001 * SR)
    y[:fade_in] *= np.linspace(0, 1, fade_in)
    tail = min(int(0.1 * SR), len(y))
    y[-tail:] *= np.linspace(1, 0, tail)
    return y / (np.abs(y).max() or 1.0) * 0.9


def measure(x: np.ndarray) -> str:
    env = np.abs(x) / (np.abs(x).max() or 1.0)
    after = np.nonzero(env > 0.05)[0]
    spec = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2
    f = np.fft.rfftfreq(len(x), 1 / SR)
    total = spec.sum() or 1
    return f"last above 5% {after[-1] / SR * 1000:.0f} ms, <150 Hz {100 * spec[f < 150].sum() / total:.0f}%, 500-8000 Hz {100 * spec[(f >= 500) & (f < 8000)].sum() / total:.0f}%"


def b64(p: Path) -> str:
    return base64.b64encode(p.read_bytes()).decode()


def main() -> None:
    rows = json.load(open(sys.argv[1], encoding="utf-8"))
    out = Path(sys.argv[2])
    (out / "src").mkdir(parents=True, exist_ok=True)
    entries = []
    for r in rows:
        sid = r["path"].split("/sounds/")[1].strip("/")
        if not r["audio"] or not r["cc0"]:
            continue
        minutes, seconds = (r["dur"].split(":") + ["0"])[:2] if ":" in r["dur"] else ("0", r["dur"] or "0")
        if int(minutes) * 60 + float(seconds) > SKIP_LONGER_THAN_S:
            continue
        src = out / "src" / f"{sid}.mp3"
        if not src.exists():
            req = urllib.request.Request(r["audio"], headers={"User-Agent": "Mozilla/5.0"})
            src.write_bytes(urllib.request.urlopen(req, timeout=30).read())
        x = load(src)
        for n, at in enumerate(hits(x), 1):
            y = cut(x, at)
            name = f"{sid}-{n}"
            target = out / f"{name}.mp3"
            save(target, y)
            print(name, "|", r["title"][:34].encode("ascii", "replace").decode(), "|", measure(y))
            entries.append({"name": f"{sid} golpe {n}", "title": r["title"], "kick": b64(target)})
    page = PAGE.replace("__ENTRIES__", json.dumps(entries)).replace("__BED__", b64(AUDIO / "crowd-bed.mp3"))
    (out / "ouvir-gravacoes.html").write_text(page, encoding="utf-8")
    print(len(entries), "hits; page:", out / "ouvir-gravacoes.html")


PAGE = """<!doctype html><meta charset="utf-8"><title>Chutes gravados</title>
<style>
body{font:16px system-ui;background:#0b0f14;color:#e8edf2;margin:0;padding:32px;max-width:860px}
h1{font-size:24px;margin:0 0 6px}p{color:#9aa7b4;margin:0 0 20px}
.row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 0;border-top:1px solid #243040}
.name{flex:1 1 300px}.name small{display:block;color:#9aa7b4}
button{font:inherit;background:#17212c;color:#e8edf2;border:1px solid #33465a;border-radius:6px;padding:8px 12px;cursor:pointer}
button:hover{border-color:#6ea8ff}label{display:block;margin:0 0 16px;color:#9aa7b4}
</style>
<h1>Chutes gravados</h1>
<p>Bolas de verdade, de gravações livres. Me diga os números dos que gostar.</p>
<label><input type="checkbox" id="bed" checked> Torcida ao fundo</label>
<div id="list"></div>
<script>
const entries = __ENTRIES__;
const bedData = "__BED__";
const ctx = new AudioContext();
const dec = (s) => ctx.decodeAudioData(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer);
let bedGain = null;
async function startBed() {
  if (bedGain) return;
  bedGain = ctx.createGain();
  bedGain.gain.value = document.getElementById("bed").checked ? 0.45 : 0;
  const src = ctx.createBufferSource();
  src.buffer = await dec(bedData);
  src.loop = true;
  src.connect(bedGain).connect(ctx.destination);
  src.start();
}
document.getElementById("bed").onchange = (e) => { if (bedGain) bedGain.gain.value = e.target.checked ? 0.45 : 0; };
function fire(buf, gain, rate, when) {
  const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
  const g = ctx.createGain(); g.gain.value = gain;
  s.connect(g).connect(ctx.destination); s.start(when);
}
const list = document.getElementById("list");
entries.forEach((e) => {
  const row = document.createElement("div"); row.className = "row";
  const name = document.createElement("div"); name.className = "name"; name.textContent = e.name;
  const small = document.createElement("small"); small.textContent = e.title; name.append(small); row.append(name);
  let buf = null;
  const load = async () => { await ctx.resume(); await startBed(); if (!buf) buf = await dec(e.kick); return buf; };
  const btn = (text, fn) => { const b = document.createElement("button"); b.textContent = text; b.onclick = async () => fn(await load()); row.append(b); };
  btn("Chute", (b) => fire(b, 0.7, 1, ctx.currentTime));
  btn("Passe", (b) => fire(b, 0.3, 1.12, ctx.currentTime));
  btn("Sequência", (b) => {
    const t = ctx.currentTime + 0.05;
    [[0, 0], [0.9, 0], [1.6, 0], [2.7, 0], [3.3, 1]].forEach(([d, kick]) => kick
      ? fire(b, 0.7, 0.97 + Math.random() * 0.06, t + d)
      : fire(b, 0.3, 1.12 * (0.97 + Math.random() * 0.06), t + d));
  });
  list.append(row);
});
</script>"""

main()
