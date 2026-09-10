import { ShieldCheck, AlertTriangle, AlertCircle, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Band = "low" | "medium" | "high" | "critical";

export function bradfordToneFor(band: Band) {
  switch (band) {
    case "low":
      return { label: "Low", classes: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", icon: ShieldCheck };
    case "medium":
      return { label: "Medium", classes: "bg-amber-100 text-amber-800 border-amber-200", dot: "bg-amber-500", icon: Activity };
    case "high":
      return { label: "High", classes: "bg-orange-100 text-orange-800 border-orange-200", dot: "bg-orange-500", icon: AlertTriangle };
    case "critical":
      return { label: "Critical", classes: "bg-rose-100 text-rose-700 border-rose-200", dot: "bg-rose-500", icon: AlertCircle };
  }
}

export function RiskBadge({ band, score }: { band: Band; score?: number }) {
  const tone = bradfordToneFor(band);
  return (
    <Badge variant="outline" className={`${tone.classes} font-medium`} data-testid={`badge-risk-${band}`}>
      <tone.icon className="h-3 w-3 mr-1" />
      {tone.label}{score !== undefined ? ` · ${score}` : ""}
    </Badge>
  );
}

export function BradfordMeter({ score, band }: { score: number; band: Band }) {
  const tone = bradfordToneFor(band);
  // Visual scale: 0..200+ where 200 is end of band; cap at 250 for the bar
  const pct = Math.min(100, Math.round((score / 250) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <p className="text-xs uppercase tracking-wider text-[#000033]/50 font-semibold">Bradford Factor</p>
        <RiskBadge band={band} score={score} />
      </div>
      <div className="h-2 rounded-full bg-[#000033]/5 overflow-hidden">
        <div className={`h-full ${tone.dot} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-[#000033]/40 mt-1 tabular-nums">
        <span>0</span><span>50</span><span>100</span><span>200+</span>
      </div>
    </div>
  );
}

export function RiskKey() {
  const bands: { band: Band; range: string }[] = [
    { band: "low", range: "<50" },
    { band: "medium", range: "50–99" },
    { band: "high", range: "100–199" },
    { band: "critical", range: "≥200" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-[#000033]/70">
      <span className="font-semibold uppercase tracking-wider text-[#000033]/50">Risk bands:</span>
      {bands.map(({ band, range }) => {
        const tone = bradfordToneFor(band);
        return (
          <div key={band} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${tone.dot}`} />
            <span>{tone.label} ({range})</span>
          </div>
        );
      })}
    </div>
  );
}
