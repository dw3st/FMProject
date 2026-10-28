/**
 * A big game for the stadium atmosphere (flares and fireworks, drawing only, 4.39): any continental game, a national
 * cup tie from the quarter-finals, a derby of the same city.
 */
export function isBigMatch(args: { continental: boolean; cupStage: string | null; derby: boolean }): boolean {
  if (args.continental || args.derby) return true;
  return args.cupStage === "qf" || args.cupStage === "sf" || args.cupStage === "final";
}
