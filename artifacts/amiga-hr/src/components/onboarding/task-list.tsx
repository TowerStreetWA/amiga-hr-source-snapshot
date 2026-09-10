import { useState } from "react";
import { format, isBefore, parseISO } from "date-fns";
import { Check, Trash2, Plus, AlertCircle, ListChecks } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListOnboardingTasks,
  useUpdateOnboardingTask,
  useDeleteOnboardingTask,
  getListOnboardingTasksQueryKey,
  getGetOnboardingOverviewQueryKey,
  getGetTrainingStatsQueryKey,
  OnboardingTaskCategory,
  type OnboardingTask,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { AddTaskDialog } from "./add-task-dialog";

const CATEGORY_LABELS: Record<OnboardingTaskCategory, string> = {
  admin: "Admin",
  it_systems: "IT & Systems",
  documents: "Documents",
  compliance: "Compliance",
  benefits: "Benefits",
  meet_team: "Meet the Team",
  other: "Other",
};

const CATEGORY_ORDER: OnboardingTaskCategory[] = [
  "admin",
  "it_systems",
  "documents",
  "compliance",
  "benefits",
  "meet_team",
  "other",
];

function isOverdue(task: OnboardingTask): boolean {
  if (task.status !== "pending" || !task.dueDate) return false;
  return isBefore(parseISO(task.dueDate), new Date(new Date().toDateString()));
}

export function OnboardingTaskList({ employeeId }: { employeeId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const { data: tasks, isLoading } = useListOnboardingTasks(employeeId);
  const update = useUpdateOnboardingTask();
  const remove = useDeleteOnboardingTask();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListOnboardingTasksQueryKey(employeeId) });
    qc.invalidateQueries({ queryKey: getGetOnboardingOverviewQueryKey() });
    qc.invalidateQueries({ queryKey: getGetTrainingStatsQueryKey() });
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  const list = tasks ?? [];
  const total = list.length;
  const completed = list.filter((t) => t.status === "completed").length;
  const overdue = list.filter(isOverdue).length;
  const progress = total === 0 ? 0 : Math.round((completed / total) * 100);

  const grouped = CATEGORY_ORDER.map((c) => ({
    category: c,
    label: CATEGORY_LABELS[c],
    items: list.filter((t) => t.category === c),
  })).filter((g) => g.items.length > 0);

  if (total === 0) {
    return (
      <Card className="border-[#000033]/10">
        <CardContent className="py-12 text-center">
          <div className="w-16 h-16 bg-[#000033]/5 rounded-full flex items-center justify-center mx-auto mb-4">
            <ListChecks className="h-8 w-8 text-[#000033]/20" />
          </div>
          <h3 className="text-lg font-medium text-[#000033] mb-1">No onboarding tasks yet</h3>
          <p className="text-[#000033]/50 max-w-sm mx-auto mb-4">
            Add the first checklist item to get this person settled in.
          </p>
          <Button onClick={() => setAddOpen(true)} className="bg-[#000033] hover:bg-[#000033]/90 text-white">
            <Plus className="h-4 w-4 mr-2" /> Add task
          </Button>
          <AddTaskDialog open={addOpen} onOpenChange={setAddOpen} employeeId={employeeId} onCreated={invalidate} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-[#000033]/10">
        <CardContent className="py-5">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-[#000033]/50 font-semibold">
                Onboarding Progress
              </p>
              <p className="text-2xl font-serif text-[#000033] mt-1">
                {completed} <span className="text-[#000033]/40">/ {total}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              {overdue > 0 && (
                <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {overdue} overdue
                </Badge>
              )}
              <Button onClick={() => setAddOpen(true)} variant="outline" className="border-[#000033]/20" data-testid="button-add-onboarding-task">
                <Plus className="h-4 w-4 mr-2" /> Add task
              </Button>
            </div>
          </div>
          <Progress value={progress} className="h-2 [&>div]:bg-[#C5A059]" />
        </CardContent>
      </Card>

      {grouped.map((group) => (
        <div key={group.category} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#000033]/60">{group.label}</h3>
          <Card className="border-[#000033]/10">
            <CardContent className="p-0 divide-y divide-[#000033]/5">
              {group.items.map((task) => {
                const overdueRow = isOverdue(task);
                const isCompleted = task.status === "completed";
                return (
                  <div key={task.id} className="flex items-start gap-3 px-4 py-3" data-testid={`row-onboarding-task-${task.id}`}>
                    <button
                      onClick={() =>
                        update.mutate(
                          {
                            taskId: task.id,
                            data: { status: isCompleted ? "pending" : "completed" },
                          },
                          {
                            onSuccess: () => {
                              invalidate();
                              if (!isCompleted) {
                                toast({ title: "Task completed", description: task.title });
                              }
                            },
                            onError: () => toast({ title: "Could not update task", variant: "destructive" }),
                          },
                        )
                      }
                      className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isCompleted
                          ? "bg-[#C5A059] border-[#C5A059] text-white"
                          : "border-[#000033]/30 hover:border-[#C5A059]"
                      }`}
                      data-testid={`button-toggle-task-${task.id}`}
                      aria-label={isCompleted ? "Mark incomplete" : "Mark complete"}
                    >
                      {isCompleted && <Check className="h-3 w-3" />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${isCompleted ? "text-[#000033]/40 line-through" : "text-[#000033]"}`}>
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="text-xs text-[#000033]/60 mt-0.5">{task.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5 text-xs">
                        {task.dueDate && (
                          <span className={overdueRow ? "text-rose-600 font-medium" : "text-[#000033]/50"}>
                            Due {format(parseISO(task.dueDate), "d MMM yyyy")}
                          </span>
                        )}
                        {task.completedAt && (
                          <span className="text-[#000033]/40">
                            Completed {format(parseISO(task.completedAt), "d MMM yyyy")} by {task.completedBy ?? "Admin"}
                          </span>
                        )}
                        {task.isCustom && (
                          <Badge variant="outline" className="bg-[#C5A059]/10 text-[#000033] border-[#C5A059]/30 text-[10px] py-0 h-4">
                            Custom
                          </Badge>
                        )}
                      </div>
                    </div>

                    {task.isCustom && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-[#000033]/40 hover:text-rose-600"
                        onClick={() =>
                          remove.mutate({ taskId: task.id }, { onSuccess: invalidate })
                        }
                        data-testid={`button-delete-task-${task.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      ))}

      <AddTaskDialog open={addOpen} onOpenChange={setAddOpen} employeeId={employeeId} onCreated={invalidate} />
    </div>
  );
}
