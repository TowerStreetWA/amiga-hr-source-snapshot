import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateInterview,
  getGetCandidateQueryKey,
  getListInterviewsQueryKey,
  getGetRecruitmentStatsQueryKey,
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
  candidateId: number;
};

function defaultDateTime(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  const tz = d.getTimezoneOffset();
  const local = new Date(d.getTime() - tz * 60000);
  return local.toISOString().slice(0, 16);
}

export function InterviewDialog({ open, onOpenChange, candidateId }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [type, setType] = useState<"phone" | "video" | "in_person" | "panel">("video");
  const [when, setWhen] = useState(defaultDateTime());
  const [duration, setDuration] = useState("45");
  const [location, setLocation] = useState("Google Meet");
  const [interviewer, setInterviewer] = useState("");

  useEffect(() => {
    if (open) {
      setType("video");
      setWhen(defaultDateTime());
      setDuration("45");
      setLocation("Google Meet");
      setInterviewer("");
    }
  }, [open]);

  const create = useCreateInterview({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetCandidateQueryKey(candidateId) });
        qc.invalidateQueries({ queryKey: getListInterviewsQueryKey(candidateId) });
        qc.invalidateQueries({ queryKey: getGetRecruitmentStatsQueryKey() });
        toast({ title: "Interview scheduled" });
        onOpenChange(false);
      },
    },
  });

  function submit() {
    create.mutate({
      id: candidateId,
      data: {
        type,
        scheduledFor: new Date(when).toISOString(),
        durationMinutes: Number(duration),
        location: location || null,
        interviewerName: interviewer,
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl text-[#000033]">Schedule interview</DialogTitle>
          <DialogDescription>Add an interview to this candidate&rsquo;s pipeline.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                  <SelectItem value="in_person">In person</SelectItem>
                  <SelectItem value="panel">Panel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Duration (min)</Label>
              <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>When</Label>
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Location / link</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Interviewer</Label>
            <Input
              value={interviewer}
              onChange={(e) => setInterviewer(e.target.value)}
              placeholder="Name and role"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!interviewer || create.isPending}
            className="bg-[#000033] text-white hover:bg-[#000033]/90"
          >
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
