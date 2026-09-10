import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  getGetPublicUploadCleanupHealthQueryKey,
  useGetPublicUploadCleanupHealth,
  type PublicUploadCleanupHealth,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function statusBadge(status: PublicUploadCleanupHealth["status"]) {
  if (status === "active") {
    return (
      <Badge className="bg-red-50 text-red-700 border-red-200">
        <AlertTriangle className="mr-1 h-3 w-3" />
        Active incident
      </Badge>
    );
  }

  return (
    <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
      <CheckCircle2 className="mr-1 h-3 w-3" />
      Recovered
    </Badge>
  );
}

function formatWhen(value: string) {
  return formatDistanceToNow(new Date(value), { addSuffix: true });
}

export function CleanupHealth() {
  const health = useGetPublicUploadCleanupHealth({
    query: {
      queryKey: getGetPublicUploadCleanupHealthQueryKey(),
      refetchInterval: 30_000,
    },
  });
  const entries = health.data ?? [];
  const activeCount = entries.filter((entry) => entry.status === "active").length;
  const recoveredCount = entries.filter(
    (entry) => entry.status === "recovered",
  ).length;

  return (
    <div className="flex-1 p-8 bg-[#F8F7F4] flex flex-col h-full overflow-auto">
      <div className="max-w-6xl mx-auto w-full space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[#000033]/50 text-sm uppercase tracking-wider font-semibold">
              <ShieldCheck className="h-4 w-4 text-[#C5A059]" /> Administration
            </div>
            <h1 className="text-3xl font-serif text-[#000033] mt-1">
              Cleanup health
            </h1>
            <p className="text-[#000033]/60 mt-1 max-w-2xl">
              Monitor abandoned public-upload cleanup by tenant. This view
              contains aggregate counts only and refreshes automatically.
            </p>
          </div>
          <Button
            variant="outline"
            className="border-[#000033]/20 text-[#000033] shrink-0"
            onClick={() => health.refetch()}
            disabled={health.isFetching}
            data-testid="button-refresh-cleanup-health"
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${health.isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="border-red-200 bg-red-50/50">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-red-900">
                  Active incidents
                </p>
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <p className="text-3xl font-semibold text-red-900 mt-2">
                {health.isLoading ? "—" : activeCount}
              </p>
              <p className="text-xs text-red-800/70 mt-1">
                Tenants currently over the failure alert threshold
              </p>
            </CardContent>
          </Card>
          <Card className="border-emerald-200 bg-emerald-50/50">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-emerald-900">
                  Recovered tenants
                </p>
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <p className="text-3xl font-semibold text-emerald-900 mt-2">
                {health.isLoading ? "—" : recoveredCount}
              </p>
              <p className="text-xs text-emerald-800/70 mt-1">
                Previously alerted tenants with a successful cleanup run
              </p>
            </CardContent>
          </Card>
        </div>

        {health.isError ? (
          <Card className="border-red-200">
            <CardContent className="py-12 text-center">
              <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-3" />
              <p className="font-medium text-[#000033]">
                Cleanup health is unavailable
              </p>
              <p className="text-sm text-[#000033]/60 mt-1">
                The server did not return the operator health view. Try again
                shortly.
              </p>
            </CardContent>
          </Card>
        ) : health.isLoading ? (
          <Card className="border-[#000033]/10">
            <CardHeader className="border-b border-[#000033]/5">
              <CardTitle className="text-[#000033]">Tenant status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ) : entries.length === 0 ? (
          <Card className="border-[#000033]/10">
            <CardContent className="py-16 text-center">
              <Activity className="h-9 w-9 text-emerald-600 mx-auto mb-3" />
              <p className="font-medium text-[#000033]">
                No cleanup incidents recorded
              </p>
              <p className="text-sm text-[#000033]/60 mt-1">
                Active alerts and recovered incidents will appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-[#000033]/10">
            <CardHeader className="border-b border-[#000033]/5">
              <CardTitle className="text-[#000033]">Tenant status</CardTitle>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-[#000033]/5">
              {entries.map((entry) => (
                <div
                  key={entry.tenantId}
                  className="px-6 py-5 flex flex-col gap-4 lg:flex-row lg:items-center"
                  data-testid={`cleanup-health-row-${entry.tenantId}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="text-sm font-medium text-[#000033]">
                        Tenant
                      </p>
                      {statusBadge(entry.status)}
                    </div>
                    <p className="font-mono text-xs text-[#000033]/55 mt-2 break-all">
                      {entry.tenantId}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:w-[520px] lg:shrink-0">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[#000033]/40 font-semibold">
                        Cleanup failures
                      </p>
                      <p className="text-xl font-semibold text-[#000033] mt-1">
                        {entry.failureCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[#000033]/40 font-semibold">
                        Failed uploads
                      </p>
                      <p className="text-xl font-semibold text-[#000033] mt-1">
                        {entry.failedUploadCount}
                      </p>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <p className="text-[10px] uppercase tracking-wider text-[#000033]/40 font-semibold">
                        Last failure
                      </p>
                      <p className="text-sm text-[#000033] mt-2 flex items-center gap-1.5">
                        <Clock3 className="h-3.5 w-3.5 text-[#C5A059]" />
                        {formatWhen(entry.lastFailureAt)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-[#000033]/45 flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5" />
          Health data is scoped to the signed-in tenant. No upload paths or
          storage credentials are returned.
        </p>
      </div>
    </div>
  );
}