/**
 * The game's fonts: Barlow 400/500/600/700 (`font-sans`) and Barlow Condensed 600/700
 * (`font-display`), latin + latin-ext only. See `.claude/rules/frontend.md` → Tipografia.
 *
 * The woff2 files (from `@fontsource`) are served as separate, long-cached files by
 * `src/backend/staticAssets.ts` (`/assets/fonts/v1/...`). The `@font-face` rules are injected from
 * here at page start instead of living in `index.css`: Bun's CSS bundler inlines every `url()`
 * file it can resolve as a base64 data URI (and refuses a root-relative URL it can't), which is how
 * the fonts used to add ~0.66 MB to every page's CSS.
 *
 * Bump `FONT_ASSET_VERSION` if the font files change (the responses are `immutable`).
 */

export const FONT_ASSET_VERSION = "v1";

const FAMILIES = [
  { pkg: "barlow", family: "Barlow", weights: [400, 500, 600, 700] },
  { pkg: "barlow-condensed", family: "Barlow Condensed", weights: [600, 700] },
] as const;

/** Unicode ranges of the two @fontsource subsets we ship (same for both families). */
const SUBSETS = {
  latin:
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  "latin-ext":
    "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
} as const;

interface FontFace {
  pkg: string;
  family: string;
  weight: number;
  subset: keyof typeof SUBSETS;
  /** `@fontsource/<pkg>/files/<file>` */
  file: string;
}

export const FONT_FACES: readonly FontFace[] = FAMILIES.flatMap(({ pkg, family, weights }) =>
  (Object.keys(SUBSETS) as (keyof typeof SUBSETS)[]).flatMap((subset) =>
    weights.map((weight) => ({ pkg, family, weight, subset, file: `${pkg}-${subset}-${weight}-normal.woff2` })),
  ),
);

export function fontUrl(file: string): string {
  return `/assets/fonts/${FONT_ASSET_VERSION}/${file}`;
}

export function fontFacesCss(): string {
  return FONT_FACES.map(
    (f) =>
      `@font-face{font-family:"${f.family}";font-style:normal;font-display:swap;font-weight:${f.weight};` +
      `src:url("${fontUrl(f.file)}") format("woff2");unicode-range:${SUBSETS[f.subset]};}`,
  ).join("\n");
}

const STYLE_ID = "game-font-faces";

/** Adds the `@font-face` rules to the page once (idempotent). */
export function installFontFaces(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = fontFacesCss();
  doc.head.appendChild(style);
}
