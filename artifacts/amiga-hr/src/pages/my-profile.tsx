import { useState } from "react";
import { format, parseISO } from "date-fns";
import { UserRound, PoundSterling, Award, Briefcase, Pencil } from "lucide-react";
import {
  useGetEmployee,
  useListEmployeeBenefits,
  getGetEmployeeQueryKey,
  getListEmployeeBenefitsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/hooks/use-current-user";
import { EditMyProfileDialog } from "@/components/employee/edit-my-profile-dialog";

const DEPT_LABEL: Record<string, string> = {
  underwriting: "Underwriting",
  claims: "Claims",
  actuarial: "Actuarial",
  finance: "Finance",
  compliance: "Compliance",
  operations: "Operations",
  technology: "Technology",
  executive: "Executive",
};

const EMP_TYPE_LABEL: Record<string, string> = {
  full_time: "Full time",
  part_time: "Part time",
  contractor: "Contractor",
};

const BENEFIT_CATEGORY_LABEL: Record<string, string> = {
  pension: "Pension",
  health: "Health",
  life_assurance: "Life assurance",
  income_protection: "Income protection",
  dental: "Dental",
  allowance: "Allowance",
  other: "Other",
};

function fmtMoney(value: number | null | undefined, currency: string) {
  if (value === null || value === undefined) return "—";
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-[#000033]/50 font-semibold">{label}</p>
      <p className="text-sm text-[#000033] mt-1">{value ?? "—"}</p>
    </div>
  );
}

function NotLinked() {
  return (
    <div className="flex-1 p-8 bg-[#F8F7F4]">
      <div className="max-w-3xl mx-auto">
        <Card className="border-[#000033]/10">
          <CardContent className="py-16 text-center text-[#000033]/60">
            Your login isn&apos;t linked to an employee record yet. Please contact HR.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function MyProfile() {
  const { employeeId } = useCurrentUser();
  const id = employeeId ?? 0;
  const enabled = employeeId !== null;
  const [editOpen, setEditOpen] = useState(false);

  const { data: emp, isLoading } = useGetEmployee(id, {
    query: { enabled, queryKey: getGetEmployeeQueryKey(id) },
  });
  const { data: benefits, isLoading: benLoading } = useListEmployeeBenefits(id, {
    query: { enabled, queryKey: getListEmployeeBenefitsQueryKey(id) },
  });

  if (employeeId === null) return <NotLinked />;

  const currency = emp?.currency ?? "GBP";

  return (
    <div className="flex-1 p-8 bg-[#F8F7F4] overflow-y-auto">
      <div className="max-w-5xl mx-auto w-full space-y-6">
        <header>
          <div className="flex items-center gap-2 text-[#000033]/50 text-sm uppercase tracking-wider font-semibold">
            <UserRound className="h-4 w-4 text-[#C5A059]" /> Self service
          </div>
          <h1 className="text-3xl font-serif text-[#000033] mt-1">My profile</h1>
          <p className="text-[#000033]/60 mt-1">
            Your personal and employment details. You can update your contact, address and
            emergency details below. For changes to your name, job or pay, please contact HR.
          </p>
        </header>

        {isLoading ? (
          <Skeleton className="h-64" />
        ) : !emp ? (
          <Card className="border-[#000033]/10">
            <CardContent className="py-16 text-center text-[#000033]/50">
              We couldn&apos;t load your record. Please contact HR.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="border-[#000033]/10">
              <CardContent className="py-6 flex items-center gap-4">
                <div className="h-14 w-14 rounded-full bg-[#000033] text-white flex items-center justify-center font-serif text-xl shrink-0">
                  {emp.firstName[0]}{emp.lastName[0]}
                </div>
                <div>
                  <h2 className="text-xl font-serif text-[#000033]">{emp.firstName} {emp.lastName}</h2>
                  <p className="text-sm text-[#000033]/60">{emp.jobTitle} · {DEPT_LABEL[emp.department] ?? emp.department}</p>
                  <p className="text-xs text-[#000033]/50 mt-0.5">{emp.employeeNumber}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-[#000033]/10">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="flex items-center gap-2 text-base font-serif text-[#000033]">
                  <UserRound className="h-4 w-4 text-[#C5A059]" /> Personal
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditOpen(true)}
                  data-testid="button-edit-my-profile"
                  className="border-[#000033]/20 text-[#000033]"
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit details
                </Button>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                <Field label="Email" value={emp.email} />
                <Field label="Phone" value={emp.phone} />
                <Field label="Date of birth" value={emp.dateOfBirth ? format(parseISO(emp.dateOfBirth), "d MMM yyyy") : "—"} />
                <Field label="Address" value={[emp.addressLine1, emp.addressLine2, emp.city, emp.postcode, emp.country].filter(Boolean).join(", ") || "—"} />
                <Field label="Emergency contact" value={emp.emergencyName ? `${emp.emergencyName}${emp.emergencyRelationship ? ` (${emp.emergencyRelationship})` : ""}` : "—"} />
                <Field label="Emergency phone" value={emp.emergencyPhone} />
              </CardContent>
            </Card>

            <Card className="border-[#000033]/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-serif text-[#000033]">
                  <Briefcase className="h-4 w-4 text-[#C5A059]" /> Employment
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                <Field label="Job title" value={emp.jobTitle} />
                <Field label="Department" value={DEPT_LABEL[emp.department] ?? emp.department} />
                <Field label="Employment type" value={EMP_TYPE_LABEL[emp.employmentType] ?? emp.employmentType} />
                <Field label="Status" value={<Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 capitalize">{emp.status.replace("_", " ")}</Badge>} />
                <Field label="Start date" value={format(parseISO(emp.startDate), "d MMM yyyy")} />
                {emp.endDate && <Field label="End date" value={format(parseISO(emp.endDate), "d MMM yyyy")} />}
              </CardContent>
            </Card>

            <Card className="border-[#000033]/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-serif text-[#000033]">
                  <PoundSterling className="h-4 w-4 text-[#C5A059]" /> Pay
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                <Field label="Base salary" value={<span className="font-serif text-lg tabular-nums">{fmtMoney(emp.salary, currency)}</span>} />
                <Field label="Currency" value={currency} />
              </CardContent>
            </Card>

            <Card className="border-[#000033]/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-serif text-[#000033]">
                  <Award className="h-4 w-4 text-[#C5A059]" /> Benefits
                </CardTitle>
              </CardHeader>
              <CardContent>
                {benLoading ? (
                  <Skeleton className="h-20" />
                ) : (benefits ?? []).length === 0 ? (
                  <p className="text-sm text-[#000033]/50">No benefits assigned.</p>
                ) : (
                  <div className="divide-y divide-[#000033]/5">
                    {(benefits ?? []).map((b) => (
                      <div key={b.id} className="py-3 flex items-center justify-between gap-3" data-testid={`row-my-benefit-${b.id}`}>
                        <div>
                          <p className="text-sm font-medium text-[#000033]">{b.name}</p>
                          <p className="text-xs text-[#000033]/60">
                            {BENEFIT_CATEGORY_LABEL[b.category] ?? b.category}
                            {b.provider ? ` · ${b.provider}` : ""}
                          </p>
                        </div>
                        <p className="text-sm tabular-nums text-[#000033]">{fmtMoney(b.annualValue, currency)}/yr</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <EditMyProfileDialog open={editOpen} onOpenChange={setEditOpen} employee={emp} />
          </>
        )}
      </div>
    </div>
  );
}
