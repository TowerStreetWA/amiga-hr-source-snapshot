import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  type CandidateDetail,
  useConvertCandidateToEmployee,
  getGetCandidateQueryKey,
  getListCandidatesQueryKey,
  getListEmployeesQueryKey,
  getGetRecruitmentStatsQueryKey,
  getGetDashboardStatsQueryKey,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  candidate: CandidateDetail | null;
};

function defaultStartDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

export function ConvertDialog({ open, onOpenChange, candidate }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const acceptedOffer = candidate?.offers.find((o) => o.status === "accepted");
  const sentOffer = candidate?.offers.find((o) => o.status === "sent");
  const offerForDefaults = acceptedOffer ?? sentOffer ?? null;

  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("Legal");
  const [startDate, setStartDate] = useState(defaultStartDate());
  const [salary, setSalary] = useState("");
  const [employmentType, setEmploymentType] = useState<"full_time" | "part_time" | "contractor">(
    "full_time",
  );

  useEffect(() => {
    if (open && candidate) {
      setJobTitle(candidate.jobTitle ?? candidate.currentRole ?? "");
      setDepartment("Legal");
      setStartDate(offerForDefaults?.startDate ?? defaultStartDate());
      setSalary(
        offerForDefaults?.salary?.toString() ??
          candidate.expectedSalary?.toString() ??
          "",
      );
      setEmploymentType((offerForDefaults?.employmentType ?? "full_time") as typeof employmentType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, candidate?.id]);

  const convert = useConvertCandidateToEmployee({
    mutation: {
      onSuccess: (data) => {
        if (candidate) {
          qc.invalidateQueries({ queryKey: getGetCandidateQueryKey(candidate.id) });
        }
        qc.invalidateQueries({ queryKey: getListCandidatesQueryKey() });
        qc.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
        qc.invalidateQueries({ queryKey: getGetRecruitmentStatsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
        toast({
          title: "Hired!",
          description: `${data.firstName} ${data.lastName} is now ${data.employeeNumber}.`,
        });
        onOpenChange(false);
        navigate(`/employees/${data.id}`);
      },
      onError: (err: unknown) => {
        toast({
          title: "Conversion failed",
          description: err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        });
      },
    },
  });

  if (!candidate) return null;

  function submit() {
    if (!candidate) return;
    convert.mutate({
      id: candidate.id,
      data: {
        jobTitle: jobTitle || null,
        department: department || null,
        startDate: startDate || null,
        salary: salary ? Number(salary) : null,
        employmentType,
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl text-[#000033]">
            Convert to employee
          </DialogTitle>
          <DialogDescription>
            We&rsquo;ll create an employee record, allocate an AMG number, transfer documents, and
            seed the salary history.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Job title</Label>
            <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Department</Label>
              <Input value={department} onChange={(e) => setDepartment(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select
                value={employmentType}
                onValueChange={(v) => setEmploymentType(v as typeof employmentType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_time">Full-time</SelectItem>
                  <SelectItem value="part_time">Part-time</SelectItem>
                  <SelectItem value="contractor">Contractor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Salary (£)</Label>
              <Input type="number" value={salary} onChange={(e) => setSalary(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={convert.isPending}
            className="bg-[#C5A059] text-[#000033] hover:bg-[#B89048]"
          >
            Convert to employee
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
