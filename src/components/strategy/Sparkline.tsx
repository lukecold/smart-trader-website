// Sparkline renders a tiny axis-less line chart of a %-return series. Colour
// follows the last value's sign (green up / red down). Renders nothing when there
// aren't at least two points.
export function Sparkline({
  points,
  width = 72,
  height = 28,
}: {
  points: number[] | null | undefined;
  width?: number;
  height?: number;
}) {
  if (!points || points.length < 2) {
    return <div style={{ width, height }} className="flex-shrink-0" />;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const pad = 2;
  const n = points.length;
  const coords = points.map((v, i) => {
    const x = (i / (n - 1)) * (width - pad * 2) + pad;
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const path = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const up = points[points.length - 1] >= 0;
  const stroke = up ? "#22c55e" : "#ef4444";
  const gradId = `spark-${up ? "up" : "dn"}`;
  const [lastX, lastY] = coords[coords.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="flex-shrink-0"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.25} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon
        points={`${pad},${height - pad} ${path} ${(width - pad).toFixed(1)},${height - pad}`}
        fill={`url(#${gradId})`}
        stroke="none"
      />
      <polyline points={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={1.8} fill={stroke} />
    </svg>
  );
}
