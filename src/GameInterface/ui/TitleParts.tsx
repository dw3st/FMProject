import type { ReactNode } from "react";

/**
 * Screen title: two parts, the second (the key word) in primary — "CLUB <FINANCES>".
 * Every in-game screen passes both `children` (foreground) and `accent` (primary).
 */
export function TitleParts({ children, accent }: { children?: ReactNode; accent?: ReactNode }) {
  const hasMain = children != null && children !== false && children !== "";
  const hasAccent = accent != null && accent !== false && accent !== "";
  return (
    <>
      {hasMain && children}
      {hasMain && hasAccent && " "}
      {hasAccent && <span className="text-primary">{accent}</span>}
    </>
  );
}
