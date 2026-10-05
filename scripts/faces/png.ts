/**
 * Minimal PNG decoder (8-bit RGB/RGBA/grey, non-interlaced) — enough for ESPN headshots, no
 * dependency. Returns RGBA bytes.
 */
import { inflateSync } from "node:zlib";

export interface Rgba { width: number; height: number; data: Uint8Array }

export function decodePng(buf: Uint8Array): Rgba {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat: Uint8Array[] = [];
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  while (pos < buf.length) {
    const len = dv.getUint32(pos);
    const type = String.fromCharCode(...buf.subarray(pos + 4, pos + 8));
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = dv.getUint32(pos + 8); height = dv.getUint32(pos + 12);
      bitDepth = body[8]!; colorType = body[9]!; interlace = body[12]!;
    } else if (type === "PLTE") palette = body;
    else if (type === "tRNS") trns = body;
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0) throw new Error(`unsupported PNG (depth ${bitDepth}, interlace ${interlace})`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType as 0 | 2 | 3 | 4 | 6];
  if (!channels) throw new Error(`unsupported colour type ${colorType}`);
  const total = idat.reduce((s, c) => s + c.length, 0);
  const joined = new Uint8Array(total);
  let o = 0;
  for (const c of idat) { joined.set(c, o); o += c.length; }
  const raw = inflateSync(joined);
  const stride = width * channels;
  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)]!;
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? px[dst + x - channels]! : 0;
      const b = y > 0 ? px[dst - stride + x]! : 0;
      const c = x >= channels && y > 0 ? px[dst - stride + x - channels]! : 0;
      let v = raw[src + x]!;
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[dst + x] = v & 255;
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels;
    if (colorType === 6) data.set(px.subarray(s, s + 4), i * 4);
    else if (colorType === 2) { data.set(px.subarray(s, s + 3), i * 4); data[i * 4 + 3] = 255; }
    else if (colorType === 0) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = px[s]!; data[i * 4 + 3] = 255; }
    else if (colorType === 4) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = px[s]!; data[i * 4 + 3] = px[s + 1]!; }
    else {
      const k = px[s]!;
      data[i * 4] = palette![k * 3]!; data[i * 4 + 1] = palette![k * 3 + 1]!; data[i * 4 + 2] = palette![k * 3 + 2]!;
      data[i * 4 + 3] = trns && k < trns.length ? trns[k]! : 255;
    }
  }
  return { width, height, data };
}
