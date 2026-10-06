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
