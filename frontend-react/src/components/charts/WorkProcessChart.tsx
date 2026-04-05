import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface WPDataPoint {
  name: string;
  dialog: number;
  background: number;
  spool: number;
  update: number;
}

const wpColors = {
  dialog:     "hsl(187, 72%, 50%)",
  background: "hsl(152, 69%, 45%)",
  spool:      "hsl(38, 92%, 50%)",
  update:     "hsl(270, 60%, 55%)",
};

export function WorkProcessChart({ data }: { data: WPDataPoint[] }) {
  if (data.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-[hsl(var(--surface-1))] p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-foreground">Work Process Utilization</h4>
        <div className="flex items-center gap-3 text-[10px]">
          {(Object.entries(wpColors) as [string, string][]).map(([key, color]) => (
            <span key={key} className="flex items-center gap-1.5 capitalize">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
              {key}
            </span>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 25%, 15%)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(215, 15%, 50%)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "hsl(215, 15%, 50%)" }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(222, 44%, 8%)",
              border: "1px solid hsl(222, 25%, 15%)",
              borderRadius: "8px",
              fontSize: "12px",
              color: "hsl(210, 20%, 90%)",
            }}
            labelStyle={{ color: "hsl(215, 15%, 50%)", marginBottom: 4 }}
          />
          <Bar dataKey="dialog"     stackId="wp" fill={wpColors.dialog}     radius={[0, 0, 0, 0]} />
          <Bar dataKey="background" stackId="wp" fill={wpColors.background} />
          <Bar dataKey="spool"      stackId="wp" fill={wpColors.spool} />
          <Bar dataKey="update"     stackId="wp" fill={wpColors.update}     radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
