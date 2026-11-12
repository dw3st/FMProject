/**
 * Flag images (`flag-icons`, 4x3 SVGs) are served as separate, cacheable files by
 * `src/backend/staticAssets.ts` — never bundled into the page CSS (the package's stylesheet inlines
 * all ~270 flags as data URIs, ~4.5 MB). Bump the version if the flag files change.
 */
export const FLAG_ASSET_VERSION = "v1";

/** `gb`, `gb-eng`, `es-ct`... — the flag-icons file stems. */
const FLAG_CODE_RE = /^[a-z]{2}(-[a-z]{2,3})?$/;

/** URL of a country flag, or `undefined` for a code that can't be a flag. */
export function flagUrl(code: string): string | undefined {
  const c = code.toLowerCase();
  return FLAG_CODE_RE.test(c) ? `/assets/flags/${FLAG_ASSET_VERSION}/${c}.svg` : undefined;
}

/** The square (1x1) flags: what a national team shows where a club shows its crest. */
export const SQUARE_FLAG_PREFIX = `/assets/flags/${FLAG_ASSET_VERSION}/1x1/`;

/** URL of a country's square flag, or `undefined` for a code that can't be a flag. */
export function squareFlagUrl(code: string): string | undefined {
  const c = code.toLowerCase();
  return FLAG_CODE_RE.test(c) ? `${SQUARE_FLAG_PREFIX}${c}.svg` : undefined;
}

export function isSquareFlagUrl(url: string): boolean {
  return url.startsWith(SQUARE_FLAG_PREFIX);
}
