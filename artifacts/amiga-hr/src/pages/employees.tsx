import { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { 
  Search, 
  Plus, 
  MoreHorizontal, 
  UserPlus, 
  Filter,
  Users
} from "lucide-react";
import { 
  useListEmployees, 
  getListEmployeesQueryKey,
  ListEmployeesStatus
} from "@workspace/api-client-react";
import { useDebounce } from "@/hooks/use-debounce";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AddEmployeeWizard } from "@/components/employee/add-employee-wizard";

const DEFAULT_DEPARTMENTS = [
  "Underwriting", "Claims", "Finance", "Operations", 
  "Compliance", "IT", "People (HR)", "Distribution"
];

function StatusBadge({ status }: { status: ListEmployeesStatus }) {
  switch (status) {
    case 'active':
      return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Active</Badge>;
    case 'on_leave':
      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">On leave</Badge>;
    case 'terminated':
      return <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200">Terminated</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function Employees() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState<ListEmployeesStatus | "all">("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [wizardOpen, setWizardOpen] = useState(false);

  const { data: employees, isLoading } = useListEmployees(
    { 
      search: debouncedSearch || undefined, 
      status: statusFilter === "all" ? undefined : statusFilter,
      department: deptFilter === "all" ? undefined : deptFilter
    },
    { query: { queryKey: getListEmployeesQueryKey({ 
      search: debouncedSearch, 
      status: statusFilter === "all" ? undefined : statusFilter,
      department: deptFilter === "all" ? undefined : deptFilter
    }) } }
  );

  // Derive unique departments from data, combine with defaults
  const dynamicDepts = Array.from(new Set(employees?.map(e => e.department) || []));
  const allDepts = Array.from(new Set([...DEFAULT_DEPARTMENTS, ...dynamicDepts])).sort();

  return (
    <div className="flex-1 p-8 bg-[#F8F7F4] flex flex-col h-full overflow-hidden">
      <div className="max-w-7xl mx-auto w-full flex flex-col h-full space-y-6">
        
        <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 shrink-0">
          <div>
            <h1 className="text-3xl font-serif text-[#000033]">Employees</h1>
            <p className="text-[#000033]/60 mt-1">Manage personnel, status, and departments.</p>
          </div>
          <Button 
            onClick={() => setWizardOpen(true)}
            className="bg-[#000033] hover:bg-[#000033]/90 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add employee
          </Button>
        </header>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 shrink-0 bg-white p-4 rounded-lg border border-[#000033]/10 shadow-sm">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#000033]/40" />
            <Input 
              placeholder="Search by name, email, or ID..." 
              className="pl-9 border-[#000033]/20 focus-visible:ring-[#C5A059]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <div className="flex gap-4">
            <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
              <SelectTrigger className="w-[160px] border-[#000033]/20 focus:ring-[#C5A059]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="on_leave">On Leave</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
              </SelectContent>
            </Select>

            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="w-[200px] border-[#000033]/20 focus:ring-[#C5A059]">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {allDepts.map(dept => (
                  <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table Area */}
        <div className="flex-1 bg-white rounded-lg border border-[#000033]/10 shadow-sm overflow-hidden flex flex-col">
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader className="bg-[#F8F7F4]/50 sticky top-0 z-10 shadow-sm">
                <TableRow className="border-[#000033]/10 hover:bg-transparent">
                  <TableHead className="font-semibold text-[#000033]">Employee</TableHead>
                  <TableHead className="font-semibold text-[#000033]">ID Number</TableHead>
                  <TableHead className="font-semibold text-[#000033]">Role & Department</TableHead>
                  <TableHead className="font-semibold text-[#000033]">Status</TableHead>
                  <TableHead className="font-semibold text-[#000033]">Start Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><div className="flex gap-3 items-center"><Skeleton className="h-10 w-10 rounded-full" /><div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-24" /></div></div></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-24" /></div></TableCell>
                      <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    </TableRow>
                  ))
                ) : employees?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-64 text-center">
                      <div className="flex flex-col items-center justify-center text-[#000033]/50">
                        <Users className="h-12 w-12 mb-4 opacity-20" />
                        <p className="text-lg font-medium text-[#000033]">No employees found</p>
                        <p className="text-sm mt-1">Try adjusting your search or filters.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  employees?.map((emp, idx) => (
                    <TableRow 
                      key={emp.id} 
                      className="border-[#000033]/5 hover:bg-[#000033]/[0.02] transition-colors cursor-pointer group"
                    >
                      <TableCell>
                        <Link href={`/employees/${emp.id}`} className="flex items-center gap-3 w-full outline-none">
                          <Avatar className="h-10 w-10 border border-[#C5A059]/20 bg-[#F8F7F4]">
                            <AvatarFallback className="bg-[#000033] text-[#C5A059] font-medium text-sm">
                              {emp.firstName[0]}{emp.lastName[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-[#000033] group-hover:text-[#C5A059] transition-colors">
                              {emp.firstName} {emp.lastName}
                            </p>
                            <p className="text-xs text-[#000033]/50">{emp.email}</p>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="tabular-nums font-medium text-[#000033]/70">
                        <Link href={`/employees/${emp.id}`} className="block w-full outline-none">{emp.employeeNumber}</Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/employees/${emp.id}`} className="block w-full outline-none">
                          <p className="font-medium text-[#000033]/80">{emp.jobTitle}</p>
                          <p className="text-xs text-[#000033]/50">{emp.department}</p>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/employees/${emp.id}`} className="block w-full outline-none">
                          <StatusBadge status={emp.status} />
                        </Link>
                      </TableCell>
                      <TableCell className="tabular-nums text-[#000033]/70">
                        <Link href={`/employees/${emp.id}`} className="block w-full outline-none">
                          {format(new Date(emp.startDate), "MMM do, yyyy")}
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          
          <div className="p-4 border-t border-[#000033]/10 bg-[#F8F7F4]/50 flex justify-between items-center text-sm text-[#000033]/60">
            <div>Showing <span className="font-medium text-[#000033]">{employees?.length || 0}</span> employees</div>
          </div>
        </div>

      </div>

      <AddEmployeeWizard 
        open={wizardOpen} 
        onOpenChange={setWizardOpen} 
        departments={allDepts}
      />
    </div>
  );
}