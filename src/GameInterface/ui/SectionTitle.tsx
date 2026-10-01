import type { HTMLAttributes } from "react";

/** Block title inside a screen. */
export function SectionTitle({ className = "", ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={`font-display font-black uppercase text-xl leading-none m-0 ${className}`} {...rest} />;
}
