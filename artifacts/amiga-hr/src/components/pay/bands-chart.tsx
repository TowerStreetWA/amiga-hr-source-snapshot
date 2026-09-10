import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { SalaryBand } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function SalaryBandsChart({
  bands,
  loading,
}: {
  bands?: SalaryBand[];
  loading: boolean;
}) {
  return (
    <Card className="border-[#000033]/10 shadow-sm">
      <CardHeader className="border-b border-[#000033]/5 pb-4">
        <CardTitle className="text-lg font-medium text-[#000033]">Salary Bands</CardTitle>
      </CardHeader>
      <CardContent className="pt-6 pb-2 px-2">
        {loading ? (
          <div className="h-[300px] flex items-center justify-center">
            <Skeleton className="h-full w-full mx-4" />
          </div>
        ) : bands && bands.length > 0 ? (
          <div className="h-[320px] w-full" data-testid="chart-salary-bands">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bands} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#00003315" />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#000033", opacity: 0.7, fontSize: 11 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#000033", opacity: 0.7, fontSize: 12 }}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: "#00003305" }}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #00003315",
                    boxShadow: "0 4px 6px rgba(0,0,51,0.05)",
                  }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={48}>
                  {bands.map((_, idx) => (
                    <Cell key={idx} fill={idx % 2 === 0 ? "#000033" : "#C5A059"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-[#000033]/50">
            No data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}
