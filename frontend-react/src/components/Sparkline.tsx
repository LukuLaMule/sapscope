interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: "ok" | "warning" | "critical";
}

const COLOR_MAP = {
  ok: { stroke: "hsl(152, 69%, 45%)", fill: "hsl(152, 69%, 45%)" },
  warning: { stroke: "hsl(38, 92%, 50%)", fill: "hsl(38, 92%, 50%)" },
  critical: { stroke: "hsl(0, 72%, 51%)", fill: "hsl(0, 72%, 51%)" },
};

export function Sparkline({ data, width = 120, height = 32, color = "ok" }: SparklineProps) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 2;

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return { x, y };
  });

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${line} L${points[points.length - 1].x},${height} L${points[0].x},${height} Z`;
  const { stroke, fill } = COLOR_MAP[color];

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`spark-grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill} stopOpacity={0.25} />
          <stop offset="100%" stopColor={fill} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#spark-grad-${color})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {/* Current value dot */}
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={2.5} fill={stroke} />
    </svg>
  );
}
