import { useState, useEffect } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { 
  useUpdateEmployee, 
  useListEmployees,
  getGetEmployeeQueryKey,
  getListEmployeesQueryKey,
  getGetDashboardStatsQueryKey,
  Employee,
  UpdateEmployeeBodyStatus,
  UpdateEmployeeBodyEmploymentType
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

const editSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  jobTitle: z.string().min(1, "Job title is required"),
  department: z.string().min(1, "Department is required"),
  employmentType: z.enum(["full_time", "part_time", "contractor"]),
  status: z.enum(["active", "on_leave", "terminated"]),
  managerId: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional().nullable(),
  addressLine1: z.string().optional().nullable(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  postcode: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  emergencyName: z.string().optional().nullable(),
  emergencyRelationship: z.string().optional().nullable(),
  emergencyPhone: z.string().optional().nullable(),
});

type EditFormValues = z.infer<typeof editSchema>;

interface EditEmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee;
  departments: string[];
}

export function EditEmployeeDialog({ open, onOpenChange, employee, departments }: EditEmployeeDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateEmployee = useUpdateEmployee();
  const { data: allEmployees } = useListEmployees();
  const managerOptions = (allEmployees ?? []).filter((e) => e.id !== employee.id);
  const NO_MANAGER = "__none__";

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      phone: employee.phone || "",
      dateOfBirth: employee.dateOfBirth ? new Date(employee.dateOfBirth).toISOString().split('T')[0] : "",
      jobTitle: employee.jobTitle,
      department: employee.department,
      employmentType: employee.employmentType,
      status: employee.status,
      managerId: employee.managerId != null ? String(employee.managerId) : NO_MANAGER,
      startDate: employee.startDate ? new Date(employee.startDate).toISOString().split('T')[0] : "",
      endDate: employee.endDate ? new Date(employee.endDate).toISOString().split('T')[0] : "",
      addressLine1: employee.addressLine1 || "",
      addressLine2: employee.addressLine2 || "",
      city: employee.city || "",
      postcode: employee.postcode || "",
      country: employee.country || "",
      emergencyName: employee.emergencyName || "",
      emergencyRelationship: employee.emergencyRelationship || "",
      emergencyPhone: employee.emergencyPhone || "",
    }
  });

  useEffect(() => {
    if (open) {
      form.reset({
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
        phone: employee.phone || "",
        dateOfBirth: employee.dateOfBirth ? new Date(employee.dateOfBirth).toISOString().split('T')[0] : "",
        jobTitle: employee.jobTitle,
        department: employee.department,
        employmentType: employee.employmentType,
        status: employee.status,
        startDate: employee.startDate ? new Date(employee.startDate).toISOString().split('T')[0] : "",
        endDate: employee.endDate ? new Date(employee.endDate).toISOString().split('T')[0] : "",
        addressLine1: employee.addressLine1 || "",
        addressLine2: employee.addressLine2 || "",
        city: employee.city || "",
        postcode: employee.postcode || "",
        country: employee.country || "",
        emergencyName: employee.emergencyName || "",
        emergencyRelationship: employee.emergencyRelationship || "",
        emergencyPhone: employee.emergencyPhone || "",
      });
    }
  }, [open, employee, form]);

  const onSubmit = async (data: EditFormValues) => {
    try {
      await updateEmployee.mutateAsync({
        id: employee.id,
        data: {
          ...data,
          dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth).toISOString() : null,
          startDate: new Date(data.startDate).toISOString(),
          endDate: data.endDate ? new Date(data.endDate).toISOString() : null,
          employmentType: data.employmentType as UpdateEmployeeBodyEmploymentType,
          status: data.status as UpdateEmployeeBodyStatus,
          managerId: data.managerId && data.managerId !== NO_MANAGER ? Number(data.managerId) : null,
        }
      });
      
      queryClient.setQueryData(getGetEmployeeQueryKey(employee.id), (old: any) => 
        old ? { ...old, ...data } : old
      );
      queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
      
      toast({
        title: "Employee updated",
        description: `Changes saved successfully.`,
      });
      
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error updating employee",
        description: error.data?.message || error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-white border-[#000033]/10 p-0 overflow-hidden h-[85vh] flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-[#000033]/5 bg-[#F8F7F4]/50 shrink-0">
          <DialogTitle className="text-xl font-serif text-[#000033]">Edit Employee</DialogTitle>
          <DialogDescription className="text-[#000033]/60 mt-1">
            Update details for {employee.firstName} {employee.lastName}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="p-6">
            <Form {...form}>
              <form id="edit-employee-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-[#000033]/50">Personal Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="firstName" render={({ field }) => (
                      <FormItem><FormLabel>First Name</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="lastName" render={({ field }) => (
                      <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem><FormLabel>Email Address</FormLabel><FormControl><Input type="email" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="phone" render={({ field }) => (
                      <FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input type="tel" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="dateOfBirth" render={({ field }) => (
                      <FormItem><FormLabel>Date of Birth</FormLabel><FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-[#000033]/50">Employment Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="jobTitle" render={({ field }) => (
                      <FormItem><FormLabel>Job Title</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="department" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Department</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            {departments.filter(d => d !== "all").map(d => (
                              <SelectItem key={d} value={d}>{d}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="employmentType" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Employment Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="full_time">Full Time</SelectItem>
                            <SelectItem value="part_time">Part Time</SelectItem>
                            <SelectItem value="contractor">Contractor</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="status" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="on_leave">On Leave</SelectItem>
                            <SelectItem value="terminated">Terminated</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="startDate" render={({ field }) => (
                      <FormItem><FormLabel>Start Date</FormLabel><FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="endDate" render={({ field }) => (
                      <FormItem><FormLabel>End Date</FormLabel><FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="managerId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reporting manager</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || NO_MANAGER}>
                        <FormControl><SelectTrigger><SelectValue placeholder="No manager" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value={NO_MANAGER}>No manager</SelectItem>
                          {managerOptions.map((m) => (
                            <SelectItem key={m.id} value={String(m.id)}>
                              {m.firstName} {m.lastName} · {m.jobTitle}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-[#000033]/50">Address</h3>
                  <FormField control={form.control} name="addressLine1" render={({ field }) => (
                    <FormItem><FormLabel>Address Line 1</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <div className="grid grid-cols-3 gap-4">
                    <FormField control={form.control} name="city" render={({ field }) => (
                      <FormItem className="col-span-1"><FormLabel>City</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="postcode" render={({ field }) => (
                      <FormItem className="col-span-1"><FormLabel>Postcode</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="country" render={({ field }) => (
                      <FormItem className="col-span-1"><FormLabel>Country</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-[#000033]/50">Emergency Contact</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField control={form.control} name="emergencyName" render={({ field }) => (
                      <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="emergencyRelationship" render={({ field }) => (
                      <FormItem><FormLabel>Relationship</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="emergencyPhone" render={({ field }) => (
                      <FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                </div>
              </form>
            </Form>
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-[#000033]/10 bg-[#F8F7F4]/50 flex justify-end shrink-0 gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="border-[#000033]/20">
            Cancel
          </Button>
          <Button 
            type="submit" 
            form="edit-employee-form"
            disabled={updateEmployee.isPending} 
            className="bg-[#000033] hover:bg-[#000033]/90 text-white font-medium"
          >
            {updateEmployee.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
            ) : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}