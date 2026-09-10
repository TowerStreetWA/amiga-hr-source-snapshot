import { useEffect } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  useUpdateEmployee,
  getGetEmployeeQueryKey,
  Employee,
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
import { ScrollArea } from "@/components/ui/scroll-area";

const profileSchema = z.object({
  phone: z.string().optional().nullable(),
  addressLine1: z.string().optional().nullable(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  postcode: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  emergencyName: z.string().optional().nullable(),
  emergencyRelationship: z.string().optional().nullable(),
  emergencyPhone: z.string().optional().nullable(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

interface EditMyProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee;
}

function toDefaults(employee: Employee): ProfileFormValues {
  return {
    phone: employee.phone || "",
    addressLine1: employee.addressLine1 || "",
    addressLine2: employee.addressLine2 || "",
    city: employee.city || "",
    postcode: employee.postcode || "",
    country: employee.country || "",
    emergencyName: employee.emergencyName || "",
    emergencyRelationship: employee.emergencyRelationship || "",
    emergencyPhone: employee.emergencyPhone || "",
  };
}

export function EditMyProfileDialog({ open, onOpenChange, employee }: EditMyProfileDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateEmployee = useUpdateEmployee();

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: toDefaults(employee),
  });

  useEffect(() => {
    if (open) {
      form.reset(toDefaults(employee));
    }
  }, [open, employee, form]);

  const onSubmit = async (data: ProfileFormValues) => {
    try {
      const payload = {
        phone: data.phone?.trim() ? data.phone.trim() : null,
        addressLine1: data.addressLine1?.trim() ? data.addressLine1.trim() : null,
        addressLine2: data.addressLine2?.trim() ? data.addressLine2.trim() : null,
        city: data.city?.trim() ? data.city.trim() : null,
        postcode: data.postcode?.trim() ? data.postcode.trim() : null,
        country: data.country?.trim() ? data.country.trim() : null,
        emergencyName: data.emergencyName?.trim() ? data.emergencyName.trim() : null,
        emergencyRelationship: data.emergencyRelationship?.trim()
          ? data.emergencyRelationship.trim()
          : null,
        emergencyPhone: data.emergencyPhone?.trim() ? data.emergencyPhone.trim() : null,
      };
      await updateEmployee.mutateAsync({ id: employee.id, data: payload });

      queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(employee.id) });

      toast({
        title: "Profile updated",
        description: "Your details have been saved.",
      });
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Couldn't save your changes",
        description: error?.data?.message || error?.message || "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl bg-white border-[#000033]/10 p-0 overflow-hidden max-h-[85vh] flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-[#000033]/5 bg-[#F8F7F4]/50 shrink-0">
          <DialogTitle className="text-xl font-serif text-[#000033]">Edit my details</DialogTitle>
          <DialogDescription className="text-[#000033]/60 mt-1">
            Update your contact, address and emergency details. For changes to your name, job or
            pay, please contact HR.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="p-6">
            <Form {...form}>
              <form id="edit-my-profile-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-[#000033]/50">Contact</h3>
                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" data-testid="input-profile-phone" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-[#000033]/50">Address</h3>
                  <FormField control={form.control} name="addressLine1" render={({ field }) => (
                    <FormItem><FormLabel>Address line 1</FormLabel><FormControl><Input data-testid="input-profile-address1" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="addressLine2" render={({ field }) => (
                    <FormItem><FormLabel>Address line 2</FormLabel><FormControl><Input data-testid="input-profile-address2" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <div className="grid grid-cols-3 gap-4">
                    <FormField control={form.control} name="city" render={({ field }) => (
                      <FormItem><FormLabel>City</FormLabel><FormControl><Input data-testid="input-profile-city" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="postcode" render={({ field }) => (
                      <FormItem><FormLabel>Postcode</FormLabel><FormControl><Input data-testid="input-profile-postcode" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="country" render={({ field }) => (
                      <FormItem><FormLabel>Country</FormLabel><FormControl><Input data-testid="input-profile-country" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-[#000033]/50">Emergency contact</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField control={form.control} name="emergencyName" render={({ field }) => (
                      <FormItem><FormLabel>Name</FormLabel><FormControl><Input data-testid="input-profile-emergency-name" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="emergencyRelationship" render={({ field }) => (
                      <FormItem><FormLabel>Relationship</FormLabel><FormControl><Input data-testid="input-profile-emergency-relationship" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="emergencyPhone" render={({ field }) => (
                      <FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" data-testid="input-profile-emergency-phone" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
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
            form="edit-my-profile-form"
            disabled={updateEmployee.isPending}
            data-testid="button-save-profile"
            className="bg-[#000033] hover:bg-[#000033]/90 text-white font-medium"
          >
            {updateEmployee.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
            ) : "Save changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
