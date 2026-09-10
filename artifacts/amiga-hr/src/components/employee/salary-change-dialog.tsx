import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { 
  useCreateSalaryChange,
  getListSalaryHistoryQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const salarySchema = z.object({
  newSalary: z.coerce.number().positive("Must be a positive number"),
  effectiveDate: z.string().min(1, "Effective date is required"),
  reason: z.string().optional(),
});

type SalaryFormValues = z.infer<typeof salarySchema>;

interface SalaryChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: number;
}

export function SalaryChangeDialog({ open, onOpenChange, employeeId }: SalaryChangeDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createSalaryChange = useCreateSalaryChange();

  const form = useForm<SalaryFormValues>({
    resolver: zodResolver(salarySchema),
    defaultValues: {
      newSalary: 0,
      effectiveDate: new Date().toISOString().split('T')[0],
      reason: "",
    }
  });

  const onSubmit = async (data: SalaryFormValues) => {
    try {
      await createSalaryChange.mutateAsync({
        id: employeeId,
        data: {
          newSalary: data.newSalary,
          effectiveDate: new Date(data.effectiveDate).toISOString(),
          reason: data.reason || null,
        }
      });
      
      queryClient.invalidateQueries({ queryKey: getListSalaryHistoryQueryKey(employeeId) });
      
      toast({
        title: "Salary updated",
        description: `New salary record added successfully.`,
      });
      
      onOpenChange(false);
      form.reset();
    } catch (error: any) {
      toast({
        title: "Error adding salary record",
        description: error.data?.message || error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white border-[#000033]/10 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-[#000033]/5 bg-[#F8F7F4]/50">
          <DialogTitle className="text-xl font-serif text-[#000033]">Record Salary Change</DialogTitle>
          <DialogDescription className="text-[#000033]/60 mt-1">
            Enter the new salary details for this employee.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6">
          <Form {...form}>
            <form id="salary-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="newSalary" render={({ field }) => (
                <FormItem>
                  <FormLabel>New Salary (GBP)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="60000" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              
              <FormField control={form.control} name="effectiveDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Effective Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="reason" render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Annual review, Promotion, etc." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </form>
          </Form>
        </div>

        <div className="p-4 border-t border-[#000033]/10 bg-[#F8F7F4]/50 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="border-[#000033]/20">
            Cancel
          </Button>
          <Button 
            type="submit" 
            form="salary-form"
            disabled={createSalaryChange.isPending} 
            className="bg-[#000033] hover:bg-[#000033]/90 text-white"
          >
            {createSalaryChange.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
            ) : "Save Record"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}