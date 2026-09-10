import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  type Job,
  useCreateJob,
  useUpdateJob,
  useListEmployees,
  getListJobsQueryKey,
  getListEmployeesQueryKey,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  job?: Job | null;
};

const DEPARTMENTS = ["Legal", "People", "Finance", "Operations", "Compliance", "IT"];

export function JobDialog({ open, onOpenChange, job }: Props) {
  const isEdit = Boolean(job);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    title: "",
    department: "Legal",
    location: "London",
    employmentType: "full_time" as "full_time" | "part_time" | "contractor",
    salaryMin: "",
    salaryMax: "",
    description: "",
    status: "open" as "open" | "draft" | "closed",
    hiringManagerId: "none",
  });

  const { data: employees } = useListEmployees(
    { status: "active" },
    { query: { queryKey: getListEmployeesQueryKey({ status: "active" }), enabled: open } },
  );

  useEffect(() => {
    if (open) {
      setForm({
        title: job?.title ?? "",
        department: job?.department ?? "Legal",
        location: job?.location ?? "London",
        employmentType: (job?.employmentType ?? "full_time") as typeof form.employmentType,
        salaryMin: job?.salaryMin?.toString() ?? "",
        salaryMax: job?.salaryMax?.toString() ?? "",
        description: job?.description ?? "",
        status: (job?.status ?? "open") as typeof form.status,
        hiringManagerId: job?.hiringManagerId != null ? String(job.hiringManagerId) : "none",
      });
    }
  }, [open, job]);

  const create = useCreateJob({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListJobsQueryKey() });
        toast({ title: "Job posted", description: "The role is now live." });
        onOpenChange(false);
      },
    },
  });
  const update = useUpdateJob({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListJobsQueryKey() });
        toast({ title: "Job updated" });
        onOpenChange(false);
      },
    },
  });

  function submit() {
    const payload = {
      title: form.title,
      department: form.department,
      location: form.location,
      employmentType: form.employmentType,
      salaryMin: form.salaryMin ? Number(form.salaryMin) : null,
      salaryMax: form.salaryMax ? Number(form.salaryMax) : null,
      description: form.description || null,
      status: form.status,
      hiringManagerId: form.hiringManagerId === "none" ? null : Number(form.hiringManagerId),
    };
    if (isEdit && job) {
      update.mutate({ id: job.id, data: payload });
    } else {
      create.mutate({ data: { ...payload, currency: "GBP" } });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl bg-white">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl text-[#000033]">
            {isEdit ? "Edit role" : "Post a new role"}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? "Update the details for this role." : "Add a new vacancy to your pipeline."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Title</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Senior Litigation Solicitor"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Department</Label>
              <Select
                value={form.department}
                onValueChange={(v) => setForm({ ...form, department: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Location</Label>
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select
                value={form.employmentType}
                onValueChange={(v) =>
                  setForm({ ...form, employmentType: v as typeof form.employmentType })
                }
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
            <div className="grid gap-2">
              <Label>Salary min (£)</Label>
              <Input
                type="number"
                value={form.salaryMin}
                onChange={(e) => setForm({ ...form, salaryMin: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Salary max (£)</Label>
              <Input
                type="number"
                value={form.salaryMax}
                onChange={(e) => setForm({ ...form, salaryMax: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Description</Label>
            <Textarea
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What does success look like in this role?"
            />
          </div>
          <div className="grid gap-2">
            <Label>Hiring manager</Label>
            <Select
              value={form.hiringManagerId}
              onValueChange={(v) => setForm({ ...form, hiringManagerId: v })}
            >
              <SelectTrigger data-testid="select-hiring-manager">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {(employees ?? []).map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.firstName} {e.lastName} · {e.jobTitle}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-[#000033]/50">
              The line manager who owns this role. They can see its candidates in
              their team recruitment view.
            </p>
          </div>
          {isEdit && (
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as typeof form.status })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!form.title || create.isPending || update.isPending}
            className="bg-[#000033] text-white hover:bg-[#000033]/90"
          >
            {isEdit ? "Save changes" : "Post role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
