import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Search } from "lucide-react";
import {
  useListAppUsers,
  useUpdateAppUser,
  useListEmployees,
  getListAppUsersQueryKey,
  type AppUser,
  type AppUserRole,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const ROLE_OPTIONS: { value: AppUserRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "employee", label: "Employee" },
];

const UNLINKED = "__none__";

function roleBadge(role: string) {
  switch (role) {
    case "admin": return <Badge className="bg-[#C5A059]/15 text-[#9a7b34] border-[#C5A059]/30">Admin</Badge>;
    case "manager": return <Badge className="bg-sky-100 text-sky-700 border-sky-200">Manager</Badge>;
    default: return <Badge className="bg-slate-100 text-slate-700 border-slate-200">Employee</Badge>;
  }
}

export function AdminUsers() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  const { data: users, isLoading } = useListAppUsers();
  const { data: employees } = useListEmployees();
  const update = useUpdateAppUser();

  const adminCount = useMemo(
    () => (users ?? []).filter((u) => u.role === "admin").length,
    [users],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (users ?? []).filter((u) => {
      if (!q) return true;
      return `${u.email} ${u.employeeName ?? ""} ${u.employeeNumber ?? ""} ${u.role}`.toLowerCase().includes(q);
    });
  }, [users, search]);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListAppUsersQueryKey() });

  const onChange = (user: AppUser, patch: { role?: AppUserRole; employeeId?: number | null }) => {
    if (patch.role && patch.role !== "admin" && user.role === "admin" && adminCount <= 1) {
      toast({ title: "Can't remove the last admin", description: "Promote another user to admin first.", variant: "destructive" });
      return;
    }
    update.mutate(
      { id: user.id, data: patch },
      {
        onSuccess: () => { toast({ title: "User updated" }); invalidate(); },
        onError: (err: any) => toast({ title: "Update failed", description: err?.message ?? "Please try again", variant: "destructive" }),
      },
    );
  };

  return (
    <div className="flex-1 p-8 bg-[#F8F7F4] flex flex-col h-full overflow-hidden">
      <div className="max-w-6xl mx-auto w-full flex flex-col h-full space-y-6">
        <header className="shrink-0">
          <div className="flex items-center gap-2 text-[#000033]/50 text-sm uppercase tracking-wider font-semibold">
            <ShieldCheck className="h-4 w-4 text-[#C5A059]" /> Administration
          </div>
          <h1 className="text-3xl font-serif text-[#000033] mt-1">Users &amp; roles</h1>
          <p className="text-[#000033]/60 mt-1">
            Control who can sign in, what they can do, and which employee record each login maps to.
          </p>
        </header>

        <div className="shrink-0 relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#000033]/40" />
          <Input
            placeholder="Search by email, name, or role…"
            className="pl-9 border-[#000033]/20 focus-visible:ring-[#C5A059]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-users-search"
          />
        </div>

        <div className="flex-1 overflow-y-auto pb-4">
          {isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
          ) : filtered.length === 0 ? (
            <Card className="border-[#000033]/10">
              <CardContent className="py-16 text-center text-[#000033]/50">No users match your search.</CardContent>
            </Card>
          ) : (
            <Card className="border-[#000033]/10">
              <CardContent className="p-0 divide-y divide-[#000033]/5">
                {filtered.map((u) => (
                  <div key={u.id} className="px-4 py-4 flex flex-col lg:flex-row lg:items-center gap-4" data-testid={`row-user-${u.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-[#000033] truncate">{u.email}</p>
                        {roleBadge(u.role)}
                      </div>
                      <p className="text-xs text-[#000033]/60 mt-1">
                        {u.employeeName ? (
                          <>Linked to {u.employeeName}{u.employeeNumber ? ` · ${u.employeeNumber}` : ""}</>
                        ) : (
                          <span className="text-amber-700">Not linked to an employee</span>
                        )}
                        {" · "}joined {format(parseISO(u.createdAt), "d MMM yyyy")}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="w-36">
                        <p className="text-[10px] uppercase tracking-wider text-[#000033]/40 font-semibold mb-1">Role</p>
                        <Select
                          value={u.role}
                          onValueChange={(v) => onChange(u, { role: v as AppUserRole })}
                          disabled={update.isPending}
                        >
                          <SelectTrigger className="border-[#000033]/20 h-9" data-testid={`select-role-${u.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-52">
                        <p className="text-[10px] uppercase tracking-wider text-[#000033]/40 font-semibold mb-1">Employee link</p>
                        <Select
                          value={u.employeeId === null ? UNLINKED : String(u.employeeId)}
                          onValueChange={(v) => onChange(u, { employeeId: v === UNLINKED ? null : Number(v) })}
                          disabled={update.isPending}
                        >
                          <SelectTrigger className="border-[#000033]/20 h-9" data-testid={`select-link-${u.id}`}>
                            <SelectValue placeholder="Not linked" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={UNLINKED}>Not linked</SelectItem>
                            {(employees ?? []).map((e) => (
                              <SelectItem key={e.id} value={String(e.id)}>
                                {e.firstName} {e.lastName} · {e.employeeNumber}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
