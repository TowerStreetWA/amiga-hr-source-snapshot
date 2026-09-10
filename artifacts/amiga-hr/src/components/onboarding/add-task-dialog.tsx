import { useState } from "react";
import { useCreateOnboardingTask, OnboardingTaskCategory } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const CATEGORY_OPTIONS: { value: OnboardingTaskCategory; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "it_systems", label: "IT & Systems" },
  { value: "documents", label: "Documents" },
  { value: "compliance", label: "Compliance" },
  { value: "benefits", label: "Benefits" },
  { value: "meet_team", label: "Meet the Team" },
  { value: "other", label: "Other" },
];

export function AddTaskDialog({
  open,
  onOpenChange,
  employeeId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employeeId: number;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const create = useCreateOnboardingTask();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<OnboardingTaskCategory>("other");
  const [dueDate, setDueDate] = useState("");

  const reset = () => {
    setTitle("");
    setDescription("");
    setCategory("other");
    setDueDate("");
  };

  const submit = () => {
    if (!title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    create.mutate(
      {
        id: employeeId,
        data: {
          title: title.trim(),
          description: description.trim() || undefined,
          category,
          dueDate: dueDate || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Task added" });
          reset();
          onOpenChange(false);
          onCreated();
        },
        onError: () => toast({ title: "Could not add task", variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[480px] border-[#000033]/10">
        <DialogHeader>
          <DialogTitle className="font-serif text-[#000033]">Add onboarding task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Schedule team intro"
              className="border-[#000033]/20 focus-visible:ring-[#C5A059]"
              data-testid="input-task-title"
            />
          </div>
          <div>
            <Label htmlFor="task-desc">Description (optional)</Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="border-[#000033]/20 focus-visible:ring-[#C5A059]"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={(v: OnboardingTaskCategory) => setCategory(v)}>
                <SelectTrigger className="border-[#000033]/20" data-testid="select-task-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="task-due">Due date</Label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="border-[#000033]/20 focus-visible:ring-[#C5A059]"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-[#000033]/20">Cancel</Button>
          <Button onClick={submit} disabled={create.isPending} className="bg-[#000033] hover:bg-[#000033]/90 text-white" data-testid="button-create-task">
            {create.isPending ? "Adding..." : "Add task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
