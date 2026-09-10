import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { format, differenceInYears, differenceInMonths, differenceInDays } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, 
  Mail, 
  Phone, 
  MapPin, 
  Briefcase, 
  Building2, 
  Calendar, 
  Clock, 
  PoundSterling,
  FileText,
  IdCard,
  Plane,
  Award,
  Receipt,
  TrendingUp,
  File,
  Trash2,
  Download,
  AlertCircle,
  MoreVertical,
  Edit2
} from "lucide-react";

import { 
  useGetEmployee, 
  getGetEmployeeQueryKey,
  useListEmployeeDocuments,
  getListEmployeeDocumentsQueryKey,
  useListSalaryHistory,
  getListSalaryHistoryQueryKey,
  useDeleteEmployee,
  useCreateEmployeeDocument,
  useDeleteEmployeeDocument,
  EmployeeStatus,
  EmployeeDocumentCategory
} from "@workspace/api-client-react";
import { ObjectUploader } from "@workspace/object-storage-web";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { EditEmployeeDialog } from "@/components/employee/edit-employee-dialog";
import { SalaryChangeDialog } from "@/components/employee/salary-change-dialog";
import { OnboardingTaskList } from "@/components/onboarding/task-list";
import { TrainingRecordList } from "@/components/training/record-list";
import { LeaveRequestList } from "@/components/leave/request-list";
import { SicknessAbsenceList } from "@/components/sickness/absence-list";
import { EmployeeBenefitsTab } from "@/components/benefits/employee-benefits-tab";

const GBPFormatter = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

const getCategoryIcon = (category: EmployeeDocumentCategory) => {
  switch (category) {
    case 'contract': return <FileText className="h-5 w-5" />;
    case 'id_document': return <IdCard className="h-5 w-5" />;
    case 'visa': return <Plane className="h-5 w-5" />;
    case 'qualification': return <Award className="h-5 w-5" />;
    case 'payroll': return <Receipt className="h-5 w-5" />;
    case 'performance': return <TrendingUp className="h-5 w-5" />;
    case 'other':
    default: return <File className="h-5 w-5" />;
  }
};

const getCategoryLabel = (category: EmployeeDocumentCategory) => {
  switch (category) {
    case 'contract': return 'Contract';
    case 'id_document': return 'ID Document';
    case 'visa': return 'Visa';
    case 'qualification': return 'Qualification';
    case 'payroll': return 'Payroll';
    case 'performance': return 'Performance Review';
    case 'other': return 'Other';
    default: return category;
  }
};

function StatusBadge({ status }: { status: EmployeeStatus }) {
  switch (status) {
    case 'active':
      return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Active</Badge>;
    case 'on_leave':
      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">On leave</Badge>;
    case 'terminated':
      return <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200">Terminated</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function calculateTenure(startDateStr: string, endDateStr?: string | null) {
  const start = new Date(startDateStr);
  const end = endDateStr ? new Date(endDateStr) : new Date();
  
  const years = differenceInYears(end, start);
  const months = differenceInMonths(end, start) % 12;
  
  if (years === 0 && months === 0) {
    const days = differenceInDays(end, start);
    return `${days} days`;
  }
  
  if (years === 0) {
    return `${months}m`;
  }
  
  if (months === 0) {
    return `${years}y`;
  }
  
  return `${years}y ${months}m`;
}

export function EmployeeDetail() {
  const params = useParams();
  const employeeId = parseInt(params.id || "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const initialTab = (() => {
    if (typeof window === "undefined") return "personal";
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("tab");
    return t && ["personal", "employment", "documents", "salary", "onboarding", "training", "leave", "sickness"].includes(t) ? t : "personal";
  })();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [salaryDialogOpen, setSalaryDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  const { data: employee, isLoading, refetch } = useGetEmployee(employeeId, {
    query: { enabled: !!employeeId, queryKey: getGetEmployeeQueryKey(employeeId) }
  });
  
  const { data: documents, isLoading: docsLoading, refetch: refetchDocs } = useListEmployeeDocuments(employeeId, {
    query: { enabled: !!employeeId && activeTab === 'documents', queryKey: getListEmployeeDocumentsQueryKey(employeeId) }
  });
  
  const { data: salaries, isLoading: salariesLoading } = useListSalaryHistory(employeeId, {
    query: { enabled: !!employeeId && activeTab === 'salary', queryKey: getListSalaryHistoryQueryKey(employeeId) }
  });

  const deleteEmployee = useDeleteEmployee();
  const createDocument = useCreateEmployeeDocument();
  const deleteDocument = useDeleteEmployeeDocument();

  const handleDelete = async () => {
    try {
      await deleteEmployee.mutateAsync({ id: employeeId });
      toast({ title: "Employee deleted" });
      setLocation("/employees");
    } catch (error: any) {
      toast({
        title: "Error deleting employee",
        description: error.message || "An unexpected error occurred",
        variant: "destructive"
      });
    }
  };

  const handleDeleteDocument = async (docId: number) => {
    try {
      await deleteDocument.mutateAsync({ docId });
      toast({ title: "Document deleted" });
      refetchDocs();
    } catch (error: any) {
      toast({
        title: "Error deleting document",
        description: error.message || "An unexpected error occurred",
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 p-8 bg-[#F8F7F4] flex flex-col h-full overflow-hidden">
        <div className="max-w-5xl mx-auto w-full space-y-6">
          <Skeleton className="h-10 w-24" />
          <Card className="border-[#000033]/10 shadow-sm">
            <CardContent className="p-8 flex items-start gap-6">
              <Skeleton className="h-24 w-24 rounded-full" />
              <div className="space-y-4 flex-1">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-48" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#F8F7F4]">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-serif text-[#000033] mb-2">Employee Not Found</h2>
        <p className="text-[#000033]/60 mb-6">The requested employee record does not exist or has been deleted.</p>
        <Button onClick={() => setLocation("/employees")} variant="outline" className="border-[#000033]/20">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Directory
        </Button>
      </div>
    );
  }

  // Pre-fill departments from a dummy list or context, ideally fetched from an API
  const DEFAULT_DEPARTMENTS = ["Underwriting", "Claims", "Finance", "Operations", "Compliance", "IT", "People (HR)", "Distribution"];
  const allDepts = Array.from(new Set([...DEFAULT_DEPARTMENTS, employee.department])).sort();

  return (
    <div className="flex-1 p-8 bg-[#F8F7F4] flex flex-col h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto w-full space-y-6">
        
        {/* Navigation & Actions */}
        <div className="flex items-center justify-between">
          <Button 
            variant="ghost" 
            onClick={() => setLocation("/employees")} 
            className="text-[#000033]/60 hover:text-[#000033] hover:bg-[#000033]/5 -ml-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Directory
          </Button>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              className="border-[#000033]/20 text-[#000033]"
              onClick={() => setEditDialogOpen(true)}
            >
              <Edit2 className="h-4 w-4 mr-2" /> Edit Profile
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="border-[#000033]/20 text-[#000033]">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteDialogOpen(true)}>
                  <Trash2 className="h-4 w-4 mr-2" /> Delete Record
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Profile Header */}
        <Card className="border-[#000033]/10 shadow-sm overflow-hidden">
          <div className="h-20 bg-[#000033] relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-[#C5A059]/20 via-transparent to-transparent"></div>
          </div>
          <CardContent className="px-8 pb-8 pt-0 relative">
            <div className="-mt-10 mb-5">
              <Avatar className="h-20 w-20 border-4 border-white shadow-md bg-[#000033]">
                <AvatarFallback className="bg-[#000033] text-[#C5A059] text-xl font-serif">
                  {employee.firstName[0]}{employee.lastName[0]}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-3xl font-serif text-[#000033] leading-tight">
                  {employee.firstName} {employee.lastName}
                </h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[#000033]/70 font-medium">
                  <span>{employee.jobTitle}</span>
                  <span className="w-1 h-1 rounded-full bg-[#C5A059]"></span>
                  <span>{employee.department}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="bg-[#F8F7F4] px-3 py-1.5 rounded-md border border-[#000033]/10">
                  <p className="text-[10px] text-[#000033]/50 uppercase tracking-wider font-semibold">Employee ID</p>
                  <p className="text-sm font-medium text-[#000033] tabular-nums">{employee.employeeNumber}</p>
                </div>
                <StatusBadge status={employee.status} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-transparent border-b border-[#000033]/10 rounded-none w-full justify-start h-auto p-0 space-x-8">
            {["personal", "employment", "documents", "salary", "benefits", "onboarding", "training", "leave", "sickness"].map((tab) => (
              <TabsTrigger 
                key={tab}
                value={tab} 
                className={`rounded-none border-b-2 border-transparent px-0 py-3 data-[state=active]:border-[#C5A059] data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-[#000033] text-[#000033]/60 hover:text-[#000033]/80 capitalize tracking-wider font-semibold text-xs transition-all`}
                data-testid={`tab-employee-${tab}`}
              >
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="mt-8">
            <AnimatePresence mode="wait">
              
              {/* PERSONAL TAB */}
              {activeTab === "personal" && (
                <TabsContent value="personal" asChild forceMount>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-6"
                  >
                    <Card className="border-[#000033]/10 shadow-sm">
                      <CardHeader className="border-b border-[#000033]/5 pb-4">
                        <CardTitle className="text-lg font-medium text-[#000033]">Contact Information</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-6 space-y-6">
                        <div className="flex gap-4">
                          <div className="w-10 h-10 rounded-full bg-[#000033]/5 flex items-center justify-center shrink-0">
                            <Mail className="h-5 w-5 text-[#000033]/60" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-[#000033]">Email Address</p>
                            <p className="text-[#000033]/70">{employee.email}</p>
                          </div>
                        </div>
                        <div className="flex gap-4">
                          <div className="w-10 h-10 rounded-full bg-[#000033]/5 flex items-center justify-center shrink-0">
                            <Phone className="h-5 w-5 text-[#000033]/60" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-[#000033]">Phone Number</p>
                            <p className="text-[#000033]/70">{employee.phone || "Not provided"}</p>
                          </div>
                        </div>
                        <div className="flex gap-4">
                          <div className="w-10 h-10 rounded-full bg-[#000033]/5 flex items-center justify-center shrink-0">
                            <Calendar className="h-5 w-5 text-[#000033]/60" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-[#000033]">Date of Birth</p>
                            <p className="text-[#000033]/70">{employee.dateOfBirth ? format(new Date(employee.dateOfBirth), "MMMM do, yyyy") : "Not provided"}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <div className="space-y-6">
                      <Card className="border-[#000033]/10 shadow-sm">
                        <CardHeader className="border-b border-[#000033]/5 pb-4">
                          <CardTitle className="text-lg font-medium text-[#000033]">Address</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6">
                          <div className="flex gap-4">
                            <div className="w-10 h-10 rounded-full bg-[#000033]/5 flex items-center justify-center shrink-0">
                              <MapPin className="h-5 w-5 text-[#000033]/60" />
                            </div>
                            <div>
                              {employee.addressLine1 ? (
                                <div className="text-[#000033]/70 space-y-1">
                                  <p>{employee.addressLine1}</p>
                                  {employee.addressLine2 && <p>{employee.addressLine2}</p>}
                                  <p>{employee.city}{employee.city && employee.postcode ? ', ' : ''}{employee.postcode}</p>
                                  <p>{employee.country}</p>
                                </div>
                              ) : (
                                <p className="text-[#000033]/70">No address on file.</p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-[#000033]/10 shadow-sm">
                        <CardHeader className="border-b border-[#000033]/5 pb-4">
                          <CardTitle className="text-lg font-medium text-[#000033]">Emergency Contact</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6">
                          {employee.emergencyName ? (
                            <div className="space-y-4">
                              <div>
                                <p className="text-sm font-medium text-[#000033]">Name</p>
                                <p className="text-[#000033]/70">{employee.emergencyName} {employee.emergencyRelationship ? `(${employee.emergencyRelationship})` : ''}</p>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-[#000033]">Phone</p>
                                <p className="text-[#000033]/70">{employee.emergencyPhone || "Not provided"}</p>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[#000033]/50 italic">No emergency contact provided.</p>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </motion.div>
                </TabsContent>
              )}

              {/* EMPLOYMENT TAB */}
              {activeTab === "employment" && (
                <TabsContent value="employment" asChild forceMount>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <Card className="border-[#000033]/10 shadow-sm">
                      <CardHeader className="border-b border-[#000033]/5 pb-4">
                        <CardTitle className="text-lg font-medium text-[#000033]">Employment Record</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                          
                          <div className="space-y-6 col-span-2">
                            <div className="grid grid-cols-2 gap-6">
                              <div>
                                <p className="text-sm font-medium text-[#000033]/50 uppercase tracking-wider mb-1">Job Title</p>
                                <p className="text-[#000033] font-medium text-lg">{employee.jobTitle}</p>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-[#000033]/50 uppercase tracking-wider mb-1">Department</p>
                                <div className="flex items-center gap-2">
                                  <Building2 className="h-4 w-4 text-[#C5A059]" />
                                  <p className="text-[#000033] font-medium">{employee.department}</p>
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                              <div>
                                <p className="text-sm font-medium text-[#000033]/50 uppercase tracking-wider mb-1">Employment Type</p>
                                <p className="text-[#000033] font-medium capitalize">{employee.employmentType.replace('_', ' ')}</p>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-[#000033]/50 uppercase tracking-wider mb-1">Current Status</p>
                                <StatusBadge status={employee.status} />
                              </div>
                            </div>
                          </div>

                          <div className="bg-[#000033]/5 rounded-lg p-6 flex flex-col justify-center">
                            <div className="mb-6">
                              <p className="text-sm font-medium text-[#000033]/50 uppercase tracking-wider mb-1">Start Date</p>
                              <p className="text-[#000033] font-medium tabular-nums">{format(new Date(employee.startDate), "MMMM do, yyyy")}</p>
                              <p className="text-xs text-[#000033]/60 mt-1">Started {calculateTenure(employee.startDate)} ago</p>
                            </div>
                            
                            {employee.endDate && (
                              <div>
                                <p className="text-sm font-medium text-[#000033]/50 uppercase tracking-wider mb-1">End Date</p>
                                <p className="text-[#000033] font-medium tabular-nums">{format(new Date(employee.endDate), "MMMM do, yyyy")}</p>
                              </div>
                            )}
                            
                            <div className="mt-auto pt-6 border-t border-[#000033]/10">
                              <p className="text-sm font-medium text-[#000033]/50 uppercase tracking-wider mb-1">Tenure</p>
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-[#C5A059]" />
                                <p className="text-[#000033] font-semibold text-lg">{calculateTenure(employee.startDate, employee.endDate)}</p>
                              </div>
                            </div>
                          </div>

                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                </TabsContent>
              )}

              {/* DOCUMENTS TAB */}
              {activeTab === "documents" && (
                <TabsContent value="documents" asChild forceMount>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-6"
                  >
                    <div className="flex justify-between items-center bg-white p-4 rounded-lg border border-[#000033]/10 shadow-sm">
                      <div>
                        <h3 className="text-lg font-medium text-[#000033]">Employee Documents</h3>
                        <p className="text-sm text-[#000033]/60">Securely store contracts, IDs, and reviews.</p>
                      </div>
                      
                      <ObjectUploader
                        onGetUploadParameters={async (file) => {
                          const res = await fetch(`${import.meta.env.BASE_URL}api/storage/uploads/request-url`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              name: file.name,
                              size: file.size,
                              contentType: file.type || "application/octet-stream",
                            }),
                          });
                          
                          if (!res.ok) throw new Error("Failed to get upload URL");
                          const { uploadURL, objectPath } = await res.json();
                          
                          // Store objectPath on the file object so onComplete can access it
                          (file.meta as any).objectPath = objectPath;
                          
                          return {
                            method: "PUT",
                            url: uploadURL,
                            headers: { "Content-Type": file.type || "application/octet-stream" },
                          };
                        }}
                        onComplete={async (result) => {
                          if (result.successful && result.successful.length > 0) {
                            for (const file of result.successful) {
                              const objectPath = (file.meta as any).objectPath;
                              if (objectPath) {
                                await createDocument.mutateAsync({
                                  id: employeeId,
                                  data: {
                                    name: file.name,
                                    category: "other", // Default category
                                    objectPath: objectPath,
                                    fileSize: file.size,
                                    mimeType: file.type,
                                  }
                                });
                              }
                            }
                            toast({ title: "Documents uploaded successfully" });
                            refetchDocs();
                          }
                        }}
                      >
                        <Button className="bg-[#000033] hover:bg-[#000033]/90 text-white">
                          Upload Document
                        </Button>
                      </ObjectUploader>
                    </div>

                    {docsLoading ? (
                      <div className="space-y-4">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-16 w-full" />
                      </div>
                    ) : documents && documents.length > 0 ? (
                      <div className="grid grid-cols-1 gap-4">
                        {documents.map((doc) => (
                          <div key={doc.id} className="flex items-center justify-between bg-white p-4 rounded-lg border border-[#000033]/10 shadow-sm hover:border-[#C5A059]/50 transition-colors group">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-lg bg-[#000033]/5 flex items-center justify-center text-[#C5A059]">
                                {getCategoryIcon(doc.category)}
                              </div>
                              <div>
                                <p className="font-medium text-[#000033] group-hover:text-[#C5A059] transition-colors">{doc.name}</p>
                                <div className="flex items-center gap-2 text-xs text-[#000033]/50 mt-1">
                                  <span className="uppercase tracking-wider font-semibold">{getCategoryLabel(doc.category)}</span>
                                  <span>•</span>
                                  <span>{format(new Date(doc.uploadedAt), "MMM do, yyyy")}</span>
                                  {doc.fileSize && (
                                    <>
                                      <span>•</span>
                                      <span>{(doc.fileSize / 1024).toFixed(0)} KB</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button 
                                variant="outline" 
                                size="icon" 
                                className="border-[#000033]/20 text-[#000033] hover:bg-[#000033]/5"
                                asChild
                              >
                                <a 
                                  href={`${import.meta.env.BASE_URL}api/storage${doc.objectPath.replace(/^\//, "")}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                >
                                  <Download className="h-4 w-4" />
                                </a>
                              </Button>
                              <Button 
                                variant="outline" 
                                size="icon" 
                                className="border-[#000033]/20 text-destructive hover:bg-destructive/5"
                                onClick={() => handleDeleteDocument(doc.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-white border border-[#000033]/10 rounded-lg p-12 text-center shadow-sm">
                        <div className="w-16 h-16 bg-[#000033]/5 rounded-full flex items-center justify-center mx-auto mb-4">
                          <FileText className="h-8 w-8 text-[#000033]/20" />
                        </div>
                        <h3 className="text-lg font-medium text-[#000033] mb-1">No documents yet</h3>
                        <p className="text-[#000033]/50 max-w-sm mx-auto">Upload contracts, identification, or performance reviews to keep them organized.</p>
                      </div>
                    )}
                  </motion.div>
                </TabsContent>
              )}

              {/* SALARY TAB */}
              {activeTab === "salary" && (
                <TabsContent value="salary" asChild forceMount>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-6"
                  >
                    <div className="flex justify-between items-center bg-white p-4 rounded-lg border border-[#000033]/10 shadow-sm">
                      <div>
                        <h3 className="text-lg font-medium text-[#000033]">Salary History</h3>
                        <p className="text-sm text-[#000033]/60">Track compensation changes over time.</p>
                      </div>
                      <Button 
                        onClick={() => setSalaryDialogOpen(true)}
                        className="bg-[#000033] hover:bg-[#000033]/90 text-white"
                      >
                        <PoundSterling className="h-4 w-4 mr-2" /> Record Change
                      </Button>
                    </div>

                    {salariesLoading ? (
                      <div className="space-y-4">
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-20 w-full" />
                      </div>
                    ) : salaries && salaries.length > 0 ? (
                      <div className="relative">
                        {/* Timeline line */}
                        <div className="absolute left-8 top-8 bottom-8 w-px bg-[#000033]/10"></div>
                        
                        <div className="space-y-6">
                          {salaries.map((salary, idx) => (
                            <div key={salary.id} className="flex items-start gap-6 relative">
                              <div className="w-16 h-16 rounded-full bg-[#F8F7F4] border-4 border-white shadow-sm flex items-center justify-center shrink-0 z-10 text-[#C5A059]">
                                <PoundSterling className="h-6 w-6" />
                              </div>
                              <Card className="flex-1 border-[#000033]/10 shadow-sm">
                                <CardContent className="p-6">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div>
                                      <div className="flex items-center gap-3 mb-1">
                                        <p className="text-2xl font-serif text-[#000033] tabular-nums">
                                          {GBPFormatter.format(salary.newSalary)}
                                        </p>
                                        {salary.percentChange !== null && salary.percentChange !== undefined && (
                                          <Badge variant="outline" className={salary.percentChange > 0 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-600 border-slate-200"}>
                                            {salary.percentChange > 0 ? '+' : ''}{salary.percentChange.toFixed(1)}%
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 text-sm text-[#000033]/60">
                                        <span className="font-medium text-[#000033]/80">Effective:</span>
                                        <span className="tabular-nums">{format(new Date(salary.effectiveDate), "MMMM do, yyyy")}</span>
                                      </div>
                                    </div>
                                    
                                    <div className="text-right">
                                      {salary.previousSalary && (
                                        <p className="text-sm text-[#000033]/50 tabular-nums">
                                          Previous: {GBPFormatter.format(salary.previousSalary)}
                                        </p>
                                      )}
                                      {salary.reason && (
                                        <p className="text-sm font-medium text-[#000033]/80 mt-1 bg-[#F8F7F4] px-2 py-1 rounded inline-block">
                                          {salary.reason}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white border border-[#000033]/10 rounded-lg p-12 text-center shadow-sm">
                        <div className="w-16 h-16 bg-[#000033]/5 rounded-full flex items-center justify-center mx-auto mb-4">
                          <TrendingUp className="h-8 w-8 text-[#000033]/20" />
                        </div>
                        <h3 className="text-lg font-medium text-[#000033] mb-1">No salary history</h3>
                        <p className="text-[#000033]/50 max-w-sm mx-auto">Record initial salary or compensation changes to build a timeline.</p>
                      </div>
                    )}
                  </motion.div>
                </TabsContent>
              )}

              {activeTab === "onboarding" && (
                <TabsContent value="onboarding" asChild forceMount>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <OnboardingTaskList employeeId={employee.id} />
                  </motion.div>
                </TabsContent>
              )}

              {activeTab === "training" && (
                <TabsContent value="training" asChild forceMount>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <TrainingRecordList employeeId={employee.id} />
                  </motion.div>
                </TabsContent>
              )}

              {activeTab === "leave" && (
                <TabsContent value="leave" asChild forceMount>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <LeaveRequestList employeeId={employee.id} />
                  </motion.div>
                </TabsContent>
              )}

              {activeTab === "sickness" && (
                <TabsContent value="sickness" asChild forceMount>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <SicknessAbsenceList employeeId={employee.id} />
                  </motion.div>
                </TabsContent>
              )}

              {activeTab === "benefits" && (
                <TabsContent value="benefits" asChild forceMount>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <EmployeeBenefitsTab employeeId={employee.id} />
                  </motion.div>
                </TabsContent>
              )}
            </AnimatePresence>
          </div>
        </Tabs>
      </div>

      {/* Dialogs */}
      <EditEmployeeDialog 
        open={editDialogOpen} 
        onOpenChange={setEditDialogOpen} 
        employee={employee} 
        departments={allDepts} 
      />
      
      <SalaryChangeDialog 
        open={salaryDialogOpen} 
        onOpenChange={setSalaryDialogOpen} 
        employeeId={employee.id} 
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="border-[#000033]/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-serif text-[#000033]">Delete Employee Record</AlertDialogTitle>
            <AlertDialogDescription className="text-[#000033]/70">
              Are you sure you want to delete {employee.firstName} {employee.lastName}? This action cannot be undone and will permanently remove their details, salary history, and documents.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#000033]/20 text-[#000033]">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Delete Employee
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}