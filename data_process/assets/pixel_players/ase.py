"""Reader of .aseprite files (the sources of the bought pixel-art pack): layers, tags, frame times and each cel as
RGBA pixels. Only what the pack uses: 32-bit RGBA sprites, raw / linked / compressed image cels."""
import struct
import zlib

import numpy as np


class Ase:
    def __init__(self, path):
        self.b = open(path, "rb").read()
        _, magic, nframes, self.w, self.h, depth = struct.unpack_from("<IHHHHH", self.b, 0)
        assert magic == 0xA5E0 and depth == 32, "a 32-bit RGBA .aseprite is expected"
        self.layers, self.tags, self.frames = [], [], []
        pos = 128
        for _ in range(nframes):
            fbytes, fmagic, old_chunks, dur, _, new_chunks = struct.unpack_from("<IHHH2sI", self.b, pos)
            assert fmagic == 0xF1FA
            cels, cp = {}, pos + 16
            for _ in range(new_chunks or old_chunks):
                csize, ctype = struct.unpack_from("<IH", self.b, cp)
                d = cp + 6
                if ctype == 0x2004:
                    flags, ltype, _child, _, _, _blend, opacity = struct.unpack_from("<HHHHHHB", self.b, d)
                    n = struct.unpack_from("<H", self.b, d + 16)[0]
                    self.layers.append({"name": self.b[d + 18:d + 18 + n].decode("utf-8", "replace"), "visible": bool(flags & 1), "type": ltype, "opacity": opacity})
                elif ctype == 0x2018:
                    count = struct.unpack_from("<H", self.b, d)[0]
                    tp = d + 10
                    for _ in range(count):
                        fr, to = struct.unpack_from("<HH", self.b, tp)
                        n = struct.unpack_from("<H", self.b, tp + 17)[0]
                        self.tags.append({"name": self.b[tp + 19:tp + 19 + n].decode("utf-8", "replace"), "from": fr, "to": to})
                        tp += 19 + n
                elif ctype == 0x2005:
                    layer, x, y, opacity, celtype = struct.unpack_from("<HhhBH", self.b, d)
                    cels[layer] = {"x": x, "y": y, "opacity": opacity, "type": celtype, "at": d + 16, "end": cp + csize}
                cp += csize
            self.frames.append({"dur": dur, "cels": cels})
            pos += fbytes

    def layer_index(self, name):
        for i, l in enumerate(self.layers):
            if l["name"] == name:
                return i
        raise KeyError(name)

    def tag(self, name, nth=0):
        """The nth tag with this name (the pack repeats `up` / `down` inside its jumps)."""
        found = [t for t in self.tags if t["name"] == name]
        return found[nth]

    def cel(self, frame, layer):
        """One layer of one frame as a full-canvas RGBA array (transparent where the layer has nothing)."""
        out = np.zeros((self.h, self.w, 4), dtype=np.uint8)
        c = self.frames[frame]["cels"].get(layer)
        hops = 0
        while c is not None and c["type"] == 1:      # linked: the same layer's cel of another frame
            link = struct.unpack_from("<H", self.b, c["at"])[0]
            c = self.frames[link]["cels"].get(layer)
            hops += 1
            assert hops < 1000
        if c is None:
            return out
        w, h = struct.unpack_from("<HH", self.b, c["at"])
        raw = self.b[c["at"] + 4:c["end"]]
        if c["type"] == 2:
            raw = zlib.decompress(raw)
        elif c["type"] != 0:
            return out
        px = np.frombuffer(raw[:w * h * 4], dtype=np.uint8).reshape(h, w, 4)
        x0, y0 = max(0, c["x"]), max(0, c["y"])
        x1, y1 = min(self.w, c["x"] + w), min(self.h, c["y"] + h)
        if x1 > x0 and y1 > y0:
            out[y0:y1, x0:x1] = px[y0 - c["y"]:y1 - c["y"], x0 - c["x"]:x1 - c["x"]]
        return out
