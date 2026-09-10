import { useMemo } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { 
  Users, 
  UserCheck, 
  UserMinus, 
  Briefcase, 
  Building2, 
  Clock, 
  FileText, 
  PoundSterling,
  UserPlus,
  AlertCircle,
  ClipboardCheck,
  GraduationCap,
  CalendarClock,
  Plane,
  HeartPulse,
  ArrowRight
} from "lucide-react";
import { format } from "date-fns";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetDashboardStats,
  getGetDashboardStatsQueryKey,
  useGetDepartmentBreakdown,
  getGetDepartmentBreakdownQueryKey,
  useGetRecentActivity,
  getGetRecentActivityQueryKey,
  useGetUpcomingAnniversaries,
  getGetUpcomingAnniversariesQueryKey,
  useGetTrainingStats,
  getGetTrainingStatsQueryKey,
  useGetLeaveStats,
  getGetLeaveStatsQueryKey,
  useGetPayStats,
  getGetPayStatsQueryKey
} from "@workspace/api-client-react";
import { CheckCircle2 } from "lucide-react";

const GBPFormatter = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

export function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats({
    query: { queryKey: getGetDashboardStatsQueryKey() }
  });

  const { data: deptData, isLoading: deptLoading } = useGetDepartmentBreakdown({
    query: { queryKey: getGetDepartmentBreakdownQueryKey() }
  });

  const { data: activityData, isLoading: activityLoading } = useGetRecentActivity({
    query: { queryKey: getGetRecentActivityQueryKey() }
  });

  const { data: anniversariesData, isLoading: anniversariesLoading } = useGetUpcomingAnniversaries({
    query: { queryKey: getGetUpcomingAnniversariesQueryKey() }
  });

  const { data: trainingStats } = useGetTrainingStats({
    query: { queryKey: getGetTrainingStatsQueryKey() }
  });

  const { data: leaveStats } = useGetLeaveStats({
    query: { queryKey: getGetLeaveStatsQueryKey() }
  });

  const { data: payStats } = useGetPayStats({
    query: { queryKey: getGetPayStatsQueryKey() }
  });

  const alerts = useMemo(() => {
    const items: { title: string; count: number; href: string; tone: "rose" | "amber" | "navy" | "sky"; icon: typeof AlertCircle }[] = [];
    if (trainingStats?.overdueOnboardingTasks) {
      items.push({ title: "Overdue onboarding tasks", count: trainingStats.overdueOnboardingTasks, href: "/onboarding", tone: "rose", icon: ClipboardCheck });
    }
    if (trainingStats?.overdueTrainingRecords) {
      items.push({ title: "Overdue training", count: trainingStats.overdueTrainingRecords, href: "/training", tone: "rose", icon: GraduationCap });
    }
    if (trainingStats?.expiringSoonRecords) {
      items.push({ title: "Training expiring within 60 days", count: trainingStats.expiringSoonRecords, href: "/training", tone: "amber", icon: AlertCircle });
    }
    if (leaveStats?.pendingRequests) {
      items.push({ title: "Pending leave requests", count: leaveStats.pendingRequests, href: "/leave", tone: "amber", icon: CalendarClock });
    }
    if (leaveStats?.offTodayCount) {
      items.push({ title: "Off today", count: leaveStats.offTodayCount, href: "/leave", tone: "sky", icon: Plane });
    }
    if (leaveStats?.offSickTodayCount) {
      items.push({ title: "Off sick today", count: leaveStats.offSickTodayCount, href: "/sickness", tone: "rose", icon: HeartPulse });
    }
    return items;
  }, [trainingStats, leaveStats]);

  const kpis = useMemo(() => [
    { title: "Total Employees", value: stats?.totalEmployees, icon: Users },
    { title: "Active", value: stats?.activeEmployees, icon: UserCheck, color: "text-emerald-600" },
    { title: "On Leave", value: stats?.onLeaveEmployees, icon: Clock, color: "text-amber-600" },
    { title: "New Hires", value: stats?.newHiresThisMonth, icon: UserPlus, subtitle: "this month" },
    { title: "Departments", value: stats?.departmentsCount, icon: Building2 },
    { title: "Avg Tenure", value: stats?.averageTenureYears ? `${stats.averageTenureYears.toFixed(1)}y` : null, icon: Briefcase },
    { title: "Documents", value: stats?.totalDocuments, icon: FileText },
    { title: "Annual Payroll", value: payStats?.totalAnnualPayroll ? GBPFormatter.format(payStats.totalAnnualPayroll) : null, icon: PoundSterling, subtitle: "total cost" },
  ], [stats, payStats]);

  return (
    <div className="flex-1 p-8 bg-[#F8F7F4] overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="mb-8">
          <h1 className="text-3xl font-serif text-[#000033]">Dashboard</h1>
          <p className="text-[#000033]/60 mt-1">Overview of Amiga Specialty workforce.</p>
        </header>

        <div
          className="rounded-lg border border-[#C5A059]/40 bg-gradient-to-r from-[#000033] to-[#000048] text-white px-5 py-4 flex items-center justify-between shadow-sm"
          data-testid="banner-fully-deployed"
        >
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-[#C5A059]" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#C5A059]">
                Fully Deployed
              </p>
              <p className="text-sm text-white/90">
                All HR modules — Recruitment, Onboarding, Training, Leave, Sickness, Pay & Benefits — are live.
              </p>
            </div>
          </div>
        </div>

        {alerts.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {alerts.map((alert) => {
              const toneClass =
                alert.tone === "rose"
                  ? "border-rose-200 bg-rose-50 hover:bg-rose-100"
                  : alert.tone === "amber"
                  ? "border-amber-200 bg-amber-50 hover:bg-amber-100"
                  : alert.tone === "sky"
                  ? "border-sky-200 bg-sky-50 hover:bg-sky-100"
                  : "border-[#000033]/10 bg-white hover:bg-[#F8F7F4]";
              const valueClass = alert.tone === "rose" ? "text-rose-700" : alert.tone === "amber" ? "text-amber-700" : alert.tone === "sky" ? "text-sky-700" : "text-[#000033]";
              return (
                <Link key={alert.title} href={alert.href}>
                  <Card className={`border ${toneClass} cursor-pointer transition shadow-sm`} data-testid={`alert-${alert.title.replace(/\s+/g, "-").toLowerCase()}`}>
                    <CardContent className="p-5 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <alert.icon className={`h-4 w-4 ${valueClass}`} />
                          <p className="text-xs font-semibold uppercase tracking-wider text-[#000033]/60">{alert.title}</p>
                        </div>
                        <p className={`text-3xl font-serif mt-1 ${valueClass}`}>{alert.count}</p>
                      </div>
                      <ArrowRight className="h-5 w-5 text-[#000033]/40" />
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map((kpi, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <Card className="border-[#000033]/10 shadow-sm h-full">
                <CardContent className="p-5 flex flex-col justify-between h-full">
                  <div className="flex items-start justify-between mb-4">
                    <p className="text-sm font-medium text-[#000033]/70">{kpi.title}</p>
                    <kpi.icon className={`h-4 w-4 ${kpi.color || 'text-[#000033]/40'}`} />
                  </div>
                  <div>
                    {statsLoading ? (
                      <Skeleton className="h-8 w-20" />
                    ) : (
                      <div className="text-2xl font-semibold tabular-nums text-[#000033]">
                        {kpi.value ?? 0}
                      </div>
                    )}
                    {kpi.subtitle && (
                      <p className="text-xs text-[#000033]/50 mt-1">{kpi.subtitle}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Chart */}
          <Card className="lg:col-span-2 border-[#000033]/10 shadow-sm">
            <CardHeader className="border-b border-[#000033]/5 pb-4">
              <CardTitle className="text-lg font-medium text-[#000033]">Headcount by Department</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 pb-2 px-2">
              {deptLoading ? (
                <div className="h-[300px] flex items-center justify-center">
                  <Skeleton className="h-full w-full mx-4" />
                </div>
              ) : deptData?.length ? (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={deptData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#00003315" />
                      <XAxis 
                        dataKey="department" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#000033', opacity: 0.7, fontSize: 12 }} 
                        dy={10}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#000033', opacity: 0.7, fontSize: 12 }}
                      />
                      <Tooltip 
                        cursor={{ fill: '#00003305' }}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #00003315', boxShadow: '0 4px 6px rgba(0,0,51,0.05)' }}
                      />
                      <Bar 
                        dataKey="count" 
                        fill="#000033" 
                        radius={[4, 4, 0, 0]} 
                        barSize={32}
                      />
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

          {/* Anniversaries */}
          <Card className="border-[#000033]/10 shadow-sm flex flex-col">
            <CardHeader className="border-b border-[#000033]/5 pb-4">
              <CardTitle className="text-lg font-medium text-[#000033]">Upcoming Anniversaries</CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-y-auto max-h-[300px] lg:max-h-none">
              {anniversariesLoading ? (
                <div className="p-4 space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : anniversariesData?.length ? (
                <div className="divide-y divide-[#000033]/5">
                  {anniversariesData.map((anniv, idx) => (
                    <motion.div 
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="p-4 flex items-center gap-4 hover:bg-[#000033]/[0.02] transition-colors"
                    >
                      <Avatar className="h-10 w-10 border border-[#C5A059]/30">
                        <AvatarFallback className="bg-[#000033] text-[#C5A059] font-medium">
                          {anniv.firstName[0]}{anniv.lastName[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#000033] truncate">
                          {anniv.firstName} {anniv.lastName}
                        </p>
                        <p className="text-xs text-[#000033]/60 truncate">
                          {anniv.yearsOfService} years • {format(new Date(anniv.anniversaryDate), "MMM do")}
                        </p>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-[#C5A059]/10 flex items-center justify-center text-[#C5A059] font-semibold text-sm">
                        {anniv.yearsOfService}
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-[#000033]/50 flex flex-col items-center justify-center h-full">
                  <Clock className="h-8 w-8 text-[#000033]/20 mb-2" />
                  <p className="text-sm">No upcoming anniversaries</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card className="border-[#000033]/10 shadow-sm">
          <CardHeader className="border-b border-[#000033]/5 pb-4">
            <CardTitle className="text-lg font-medium text-[#000033]">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {activityLoading ? (
              <div className="p-4 space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : activityData?.length ? (
              <div className="divide-y divide-[#000033]/5">
                {activityData.map((activity, idx) => (
                  <div key={activity.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-[#000033]/[0.02]">
                    <div>
                      <p className="text-sm text-[#000033]">
                        <span className="font-medium">{activity.actor || 'System'}</span> {activity.summary}
                      </p>
                      <p className="text-xs text-[#000033]/50 mt-1 uppercase tracking-wider font-semibold">
                        {activity.action} • {activity.entityType}
                      </p>
                    </div>
                    <span className="text-xs text-[#000033]/50 tabular-nums">
                      {format(new Date(activity.createdAt), "MMM do, yyyy HH:mm")}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-[#000033]/50">
                <p className="text-sm">No recent activity</p>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}