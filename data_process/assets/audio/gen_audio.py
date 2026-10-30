"""Match sounds (leva 3) from the local ComfyUI with Stable Audio Open 1.0 (Stability AI Community License).

Needs ComfyUI on http://127.0.0.1:8188 with checkpoints/stable_audio_open_1.0.safetensors and
text_encoders/t5-base.safetensors. One job at a time. Writes MP3s to src/example_data/assets/audio/<name>.mp3;
raw outputs stay in ComfyUI's output folder.

    python data_process/assets/audio/gen_audio.py [name ...] [--seed N]
"""
from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

HOST = "http://127.0.0.1:8188"
OUT = Path(__file__).resolve().parents[3] / "src" / "example_data" / "assets" / "audio"
NEG = "music, melody, singing, speech, talking, commentary, low quality, distortion, clipping, silence"

SOUNDS: dict[str, tuple[str, float]] = {
    "crowd-bed": ("large football stadium crowd ambience, thousands of fans murmuring and chanting in the distance, steady, wide stereo", 24.0),
    "crowd-rise": ("football stadium crowd getting excited, noise rising, fans shouting encouragement", 6.0),
    "goal-roar": ("huge football stadium crowd erupts cheering a goal, massive roar and applause, celebration", 9.0),
    "near-miss": ("football stadium crowd groans oooh in disappointment after a missed chance", 4.0),
    "whistle-short": ("a single short blast of a referee pea whistle, outdoors", 1.5),
    "whistle-end": ("referee blows the final whistle three times, outdoors stadium", 4.0),
    "kick": ("a football kicked hard, single ball strike thud, close", 1.0),
    "net": ("a football hitting the goal net, swish of the net", 1.5),
}


def graph(prompt: str, seconds: float, seed: int, name: str) -> dict:
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "stable_audio_open_1.0.safetensors"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "t5-base.safetensors", "type": "stable_audio"}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": prompt}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": NEG}},
        "5": {"class_type": "ConditioningStableAudio", "inputs": {"positive": ["3", 0], "negative": ["4", 0], "seconds_start": 0.0, "seconds_total": seconds}},
        "6": {"class_type": "EmptyLatentAudio", "inputs": {"seconds": seconds, "batch_size": 1}},
        "7": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "seed": seed, "steps": 80, "cfg": 6.0,
                                                    "sampler_name": "dpmpp_3m_sde_gpu", "scheduler": "exponential",
                                                    "positive": ["5", 0], "negative": ["5", 1], "latent_image": ["6", 0], "denoise": 1.0}},
        "8": {"class_type": "VAEDecodeAudio", "inputs": {"samples": ["7", 0], "vae": ["1", 2]}},
        "9": {"class_type": "SaveAudioMP3", "inputs": {"audio": ["8", 0], "filename_prefix": f"fmproject_audio/{name}", "quality": "V0"}},
    }


def get(path: str) -> bytes:
    with urllib.request.urlopen(HOST + path, timeout=60) as r:
        return r.read()


def run(name: str, seed: int) -> None:
    prompt, seconds = SOUNDS[name]
    body = json.dumps({"prompt": graph(prompt, seconds, seed, name), "client_id": str(uuid.uuid4())}).encode()
    req = urllib.request.Request(HOST + "/prompt", body, {"Content-Type": "application/json"})
    pid = json.loads(urllib.request.urlopen(req, timeout=60).read())["prompt_id"]
    t0 = time.time()
    while True:
        hist = json.loads(get(f"/history/{pid}"))
        if pid in hist:
            entry = hist[pid]
            if entry.get("status", {}).get("status_str") == "error":
                raise RuntimeError(json.dumps(entry["status"])[:800])
            files = [a for o in entry["outputs"].values() for a in o.get("audio", [])]
            if files:
                f = files[0]
                q = urllib.parse.urlencode({"filename": f["filename"], "subfolder": f["subfolder"], "type": f["type"]})
                OUT.mkdir(parents=True, exist_ok=True)
                (OUT / f"{name}.mp3").write_bytes(get(f"/view?{q}"))
                print(f"{name}: {time.time() - t0:.0f}s -> {OUT / (name + '.mp3')}")
                return
        if time.time() - t0 > 900:
            raise TimeoutError(name)
        time.sleep(2)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    seed = int(sys.argv[sys.argv.index("--seed") + 1]) if "--seed" in sys.argv else 7
    if "--seed" in sys.argv:
        args = [a for a in args if a != str(seed)]
    for n in args or list(SOUNDS):
        run(n, seed)
