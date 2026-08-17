"use client";

export function Sparkline({
  values,
  projectedNext,
  width = 220,
  height = 56,
}: {
  values: number[];
  projectedNext?: number;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const all = projectedNext != null ? [...values, projectedNext] : values;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const pad = 8;
  const usableW = width - pad * 2;
  const usableH = height - pad * 2;
  const stepX = usableW / (all.length - 1);

  const point = (i: number, v: number) => {
    const x = pad + i * stepX;
    const y = pad + usableH - ((v - min) / span) * usableH;
    return [x, y] as const;
  };

  const realPts = values.map((v, i) => point(i, v));
  const lastRealIdx = values.length - 1;

  const realPath = realPts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  let projPath = "";
  if (projectedNext != null) {
    const [x1, y1] = realPts[lastRealIdx];
    const [x2, y2] = point(lastRealIdx + 1, projectedNext);
    projPath = `M${x1.toFixed(1)},${y1.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)}`;
  }

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <path d={realPath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {projPath && (
        <path d={projPath} fill="none" stroke="var(--warn)" strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round" />
      )}
      {realPts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === lastRealIdx ? 3 : 2.2} fill={i === lastRealIdx ? "var(--accent)" : "var(--muted)"} />
      ))}
      {projectedNext != null && (
        <circle cx={point(lastRealIdx + 1, projectedNext)[0]} cy={point(lastRealIdx + 1, projectedNext)[1]} r={3} fill="var(--warn)" />
      )}
    </svg>
  );
}
