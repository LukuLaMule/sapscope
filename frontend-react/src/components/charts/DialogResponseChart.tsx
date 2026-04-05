import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface DataPoint { date: string; avg: number }

export function DialogResponseChart({ data }: { data: DataPoint[] }) {
  if (data.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-[hsl(var(--surface-1))] p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-foreground">Dialog Response Time</h4>
        <div className="flex items-center gap-4 text-[10px]">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "hsl(187, 72%, 50%)" }} />
            Avg (ms)
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
          <defs>
            <linearGradient id="gradAvgResp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(187, 72%, 50%)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="hsl(187, 72%, 50%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 25%, 15%)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(215, 15%, 50%)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "hsl(215, 15%, 50%)" }} axisLine={false} tickLine={false} unit=" ms" />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(222, 44%, 8%)",
              border: "1px solid hsl(222, 25%, 15%)",
              borderRadius: "8px",
              fontSize: "12px",
              color: "hsl(210, 20%, 90%)",
            }}
            labelStyle={{ color: "hsl(215, 15%, 50%)", marginBottom: 4 }}
            formatter={(v: number) => [`${v} ms`, "Avg response"]}
          />
          <Area type="monotone" dataKey="avg" stroke="hsl(187, 72%, 50%)" strokeWidth={2} fill="url(#gradAvgResp)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
