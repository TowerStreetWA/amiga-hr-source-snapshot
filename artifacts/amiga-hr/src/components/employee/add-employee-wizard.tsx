import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ArrowRight, ArrowLeft, Check, X } from "lucide-react";
import { 
  useCreateEmployee, 
  getListEmployeesQueryKey,
  getGetDashboardStatsQueryKey,
  CreateEmployeeBodyEmploymentType,
  CreateEmployeeBodyStatus
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
import { Textarea } from "@/components/ui/textarea";

const personalSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
});

const employmentSchema = z.object({
  jobTitle: z.string().min(1, "Job title is required"),
  department: z.string().min(1, "Department is required"),
  employmentType: z.enum(["full_time", "part_time", "contractor"]),
  status: z.enum(["active", "on_leave", "terminated"]).default("active"),
  startDate: z.string().min(1, "Start date is required"),
  salary: z.coerce.number().positive("Must be a positive number").optional(),
});

const addressSchema = z.object({
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  postcode: z.string().optional(),
  country: z.string().optional(),
  emergencyName: z.string().optional(),
  emergencyRelationship: z.string().optional(),
  emergencyPhone: z.string().optional(),
});

const wizardSchema = personalSchema.merge(employmentSchema).merge(addressSchema);
type WizardValues = z.infer<typeof wizardSchema>;

interface AddEmployeeWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departments: string[];
}

export function AddEmployeeWizard({ open, onOpenChange, departments }: AddEmployeeWizardProps) {
  const [step, setStep] = useState(1);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createEmployee = useCreateEmployee();

  const form = useForm<WizardValues>({
    resolver: zodResolver(wizardSchema),
    defaultValues: {
      firstName: "", lastName: "", email: "", phone: "", dateOfBirth: "",
      jobTitle: "", department: "", employmentType: "full_time", status: "active", startDate: new Date().toISOString().split('T')[0], salary: undefined,
      addressLine1: "", addressLine2: "", city: "", postcode: "", country: "",
      emergencyName: "", emergencyRelationship: "", emergencyPhone: ""
    },
    mode: "onTouched",
  });

  const onSubmit = async (data: WizardValues) => {
    try {
      await createEmployee.mutateAsync({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone || null,
          dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth).toISOString() : null,
          jobTitle: data.jobTitle,
          department: data.department,
          employmentType: data.employmentType as CreateEmployeeBodyEmploymentType,
          status: data.status as CreateEmployeeBodyStatus,
          startDate: new Date(data.startDate).toISOString(),
          salary: data.salary || null,
          currency: "GBP",
          addressLine1: data.addressLine1 || null,
          addressLine2: data.addressLine2 || null,
          city: data.city || null,
          postcode: data.postcode || null,
          country: data.country || null,
          emergencyName: data.emergencyName || null,
          emergencyRelationship: data.emergencyRelationship || null,
          emergencyPhone: data.emergencyPhone || null,
        }
      });
      
      queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
      
      toast({
        title: "Employee created",
        description: `${data.firstName} ${data.lastName} has been added successfully.`,
      });
      
      onOpenChange(false);
      setTimeout(() => {
        setStep(1);
        form.reset();
      }, 300);
    } catch (error: any) {
      toast({
        title: "Error creating employee",
        description: error.data?.message || error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  const nextStep = async () => {
    let fieldsToValidate: any[] = [];
    if (step === 1) fieldsToValidate = ["firstName", "lastName", "email", "phone", "dateOfBirth"];
    else if (step === 2) fieldsToValidate = ["jobTitle", "department", "employmentType", "status", "startDate", "salary"];
    
    const isValid = await form.trigger(fieldsToValidate as any);
    if (isValid) setStep(s => Math.min(s + 1, 3));
  };

  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-white border-[#000033]/10 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-[#000033]/5 bg-[#F8F7F4]/50">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-serif text-[#000033]">Add New Employee</DialogTitle>
              <DialogDescription className="text-[#000033]/60 mt-1">
                Enter details to create a new personnel record.
              </DialogDescription>
            </div>
            <div className="flex gap-2">
              {[1, 2, 3].map(i => (
                <div key={i} className={`h-2 rounded-full transition-all duration-300 ${
                  i === step ? "w-8 bg-[#C5A059]" : i < step ? "w-2 bg-[#000033]" : "w-2 bg-[#000033]/10"
                }`} />
              ))}
            </div>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="p-6 relative min-h-[360px] overflow-x-hidden">
              <AnimatePresence mode="wait" initial={false}>
                {step === 1 && (
                  <motion.div
                    key="step1"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-4"
                  >
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-[#000033]/50 mb-4">Personal Details</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="firstName" render={({ field }) => (
                        <FormItem><FormLabel>First Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="lastName" render={({ field }) => (
                        <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name="email" render={({ field }) => (
                      <FormItem><FormLabel>Email Address</FormLabel><FormControl><Input type="email" placeholder="name@amigaspecialty.com" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="phone" render={({ field }) => (
                        <FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input type="tel" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="dateOfBirth" render={({ field }) => (
                        <FormItem><FormLabel>Date of Birth</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                  </motion.div>
                )}

                {step === 2 && (
                  <motion.div
                    key="step2"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-4"
                  >
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-[#000033]/50 mb-4">Employment Details</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="jobTitle" render={({ field }) => (
                        <FormItem><FormLabel>Job Title</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="department" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Department</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select dept" /></SelectTrigger></FormControl>
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
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                        <FormItem><FormLabel>Start Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="salary" render={({ field }) => (
                        <FormItem><FormLabel>Salary (GBP)</FormLabel><FormControl><Input type="number" placeholder="50000" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                  </motion.div>
                )}

                {step === 3 && (
                  <motion.div
                    key="step3"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-6"
                  >
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-[#000033]/50 mb-4">Address Details</h3>
                      <div className="space-y-4">
                        <FormField control={form.control} name="addressLine1" render={({ field }) => (
                          <FormItem><FormLabel>Address Line 1</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <div className="grid grid-cols-3 gap-4">
                          <FormField control={form.control} name="city" render={({ field }) => (
                            <FormItem className="col-span-1"><FormLabel>City</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="postcode" render={({ field }) => (
                            <FormItem className="col-span-1"><FormLabel>Postcode</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="country" render={({ field }) => (
                            <FormItem className="col-span-1"><FormLabel>Country</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-[#000033]/50 mb-4">Emergency Contact</h3>
                      <div className="grid grid-cols-3 gap-4">
                        <FormField control={form.control} name="emergencyName" render={({ field }) => (
                          <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="emergencyRelationship" render={({ field }) => (
                          <FormItem><FormLabel>Relationship</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="emergencyPhone" render={({ field }) => (
                          <FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="p-4 border-t border-[#000033]/10 bg-[#F8F7F4]/50 flex justify-between">
              <Button type="button" variant="outline" onClick={prevStep} disabled={step === 1} className="border-[#000033]/20">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back
              </Button>
              
              {step < 3 ? (
                <Button type="button" onClick={nextStep} className="bg-[#000033] hover:bg-[#000033]/90 text-white">
                  Next <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button type="submit" disabled={createEmployee.isPending} className="bg-[#C5A059] hover:bg-[#C5A059]/90 text-[#000033] font-semibold">
                  {createEmployee.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                  ) : (
                    <><Check className="w-4 h-4 mr-2" /> Complete</>
                  )}
                </Button>
              )}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}