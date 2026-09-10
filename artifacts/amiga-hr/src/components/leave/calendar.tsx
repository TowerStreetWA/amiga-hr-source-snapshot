import { useMemo, useState } from "react";
import { Link } from "wouter";
import { addMonths, eachDayOfInterval, endOfMonth, format, isWithinInterval, parseISO, startOfMonth, subMonths, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useGetLeaveCalendar, getGetLeaveCalendarQueryKey, type LeaveCalendarEntry } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const TYPE_COLOR: Record<string, string> = {
  annual: "bg-[#C5A059]",
  maternity: "bg-pink-500",
  paternity: "bg-sky-500",
  compassionate: "bg-purple-500",
  study: "bg-indigo-500",
  unpaid: "bg-slate-400",
};

const TYPE_LABEL: Record<string, string> = {
  annual: "Annual",
  maternity: "Maternity",
  paternity: "Paternity",
  compassionate: "Compassionate",
  study: "Study",
  unpaid: "Unpaid",
};

export function LeaveCalendar({ linkEmployees = true }: { linkEmployees?: boolean }) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const fromStr = format(monthStart, "yyyy-MM-dd");
  const toStr = format(monthEnd, "yyyy-MM-dd");

  const { data: entries, isLoading } = useGetLeaveCalendar({ from: fromStr, to: toStr }, {
    query: { queryKey: getGetLeaveCalendarQueryKey({ from: fromStr, to: toStr }) },
  });

  const days = useMemo(() => eachDayOfInterval({ start: monthStart, end: monthEnd }), [monthStart, monthEnd]);
  const startWeekday = (monthStart.getDay() + 6) % 7; // make Mon = 0
  const blanks = Array.from({ length: startWeekday });

  const entriesByDay = useMemo(() => {
    const map = new Map<string, LeaveCalendarEntry[]>();
    if (!entries) return map;
    for (const day of days) {
      const list = entries.filter((e) =>
        isWithinInterval(day, { start: parseISO(e.startDate), end: parseISO(e.endDate) })
      );
      if (list.length > 0) map.set(format(day, "yyyy-MM-dd"), list);
    }
    return map;
  }, [days, entries]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="border-[#000033]/20" onClick={() => setCursor(subMonths(cursor, 1))} data-testid="button-cal-prev">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-lg font-serif text-[#000033] min-w-[180px] text-center">
            {format(cursor, "MMMM yyyy")}
          </h3>
          <Button variant="outline" size="icon" className="border-[#000033]/20" onClick={() => setCursor(addMonths(cursor, 1))} data-testid="button-cal-next">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" className="text-[#000033]/60 ml-2" onClick={() => setCursor(startOfMonth(new Date()))}>Today</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-[#000033]/70">
          {Object.entries(TYPE_LABEL).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${TYPE_COLOR[key]}`} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <Card className="border-[#000033]/10">
        <CardContent className="p-4">
          {isLoading ? (
            <Skeleton className="h-80" />
          ) : (
            <>
              <div className="grid grid-cols-7 gap-2 mb-2">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <div key={d} className="text-xs font-semibold uppercase tracking-wider text-[#000033]/50 text-center py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {blanks.map((_, i) => <div key={`b-${i}`} />)}
                {days.map((day) => {
                  const key = format(day, "yyyy-MM-dd");
                  const entries = entriesByDay.get(key) ?? [];
                  const isToday = isSameDay(day, new Date());
                  return (
                    <div
                      key={key}
                      className={`min-h-[72px] rounded-md border p-1.5 ${isToday ? "border-[#C5A059] bg-[#C5A059]/5" : "border-[#000033]/10 bg-white"}`}
                      data-testid={`cal-day-${key}`}
                    >
                      <div className={`text-xs tabular-nums font-semibold mb-1 ${isToday ? "text-[#C5A059]" : "text-[#000033]/70"}`}>
                        {format(day, "d")}
                      </div>
                      <div className="space-y-0.5">
                        {entries.slice(0, 3).map((e) => {
                          const pill = (
                            <div
                              className={`${TYPE_COLOR[e.leaveType] ?? "bg-slate-400"} text-white text-[10px] px-1.5 py-0.5 rounded truncate ${linkEmployees ? "cursor-pointer hover:opacity-90" : ""}`}
                              title={`${e.employeeName} · ${TYPE_LABEL[e.leaveType] ?? e.leaveType}`}
                            >
                              {e.employeeName}
                            </div>
                          );
                          return linkEmployees ? (
                            <Link key={e.id} href={`/employees/${e.employeeId}?tab=leave`}>
                              {pill}
                            </Link>
                          ) : (
                            <div key={e.id}>{pill}</div>
                          );
                        })}
                        {entries.length > 3 && (
                          <div className="text-[10px] text-[#000033]/50 px-1">+{entries.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
