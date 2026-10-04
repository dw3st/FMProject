import { flagUrl } from "@/Domain/world/flags";

/**
 * Country flag (4x3) as a lazily loaded image served from `/assets/flags/` — see
 * `src/Domain/world/flags.ts`. Decorative: the country name is always written next to it.
 */
export function Flag({ code, className = "w-5 h-[15px]" }: { code: string; className?: string }) {
  const src = flagUrl(code);
  if (!src) return <span className={`inline-block shrink-0 rounded-sm bg-border ${className}`} aria-hidden />;
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      className={`inline-block shrink-0 rounded-sm object-cover ${className}`}
    />
  );
}
