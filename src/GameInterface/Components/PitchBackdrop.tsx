const TEAM_A = [
  [10, 65], [38, 25], [36, 55], [36, 78], [40, 106], [72, 40],
  [70, 95], [118, 30], [116, 100], [78, 68], [128, 64],
] as const;
const TEAM_B = [
  [190, 65], [160, 28], [158, 56], [156, 82], [162, 104], [138, 44],
  [142, 80], [84, 18], [88, 112], [104, 52], [96, 84],
] as const;

export function PitchBackdrop() {
  return (
    <svg
      viewBox="0 0 200 130"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 m-auto h-[88%] w-[88%] opacity-40"
    >
      <g className="fill-none stroke-border" strokeWidth={1}>
        <rect x={1} y={1} width={198} height={128} />
        <line x1={100} y1={1} x2={100} y2={129} />
        <circle cx={100} cy={65} r={18} />
        <rect x={1} y={38} width={26} height={54} />
        <rect x={173} y={38} width={26} height={54} />
      </g>
      <g className="fill-primary opacity-50">
        {TEAM_A.map(([x, y]) => <circle key={`a${x}-${y}`} cx={x} cy={y} r={2} />)}
      </g>
      <g className="fill-muted-foreground opacity-50">
        {TEAM_B.map(([x, y]) => <circle key={`b${x}-${y}`} cx={x} cy={y} r={2} />)}
      </g>
    </svg>
  );
}
