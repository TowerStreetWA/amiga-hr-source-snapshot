import * as XLSX from "xlsx";

export type ImportRowInput = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  department?: string;
  status?: string;
  employmentType?: string;
  startDate?: string;
  salary?: string | number | null;
  currency?: string;
  dateOfBirth?: string;
  city?: string;
  postcode?: string;
  country?: string;
};

export type ImportRowResult =
  | { rowNumber: number; status: "ok"; data: ImportRowParsed; errors: [] }
  | {
      rowNumber: number;
      status: "error";
      data: ImportRowInput;
      errors: string[];
    };

export type ImportRowParsed = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  jobTitle: string;
  department: string;
  status: "active" | "on_leave" | "terminated";
  employmentType: "full_time" | "part_time" | "contract" | "intern";
  startDate: string; // YYYY-MM-DD
  salary: number | null;
  currency: string;
  dateOfBirth: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
};

const HEADER_MAP: Record<string, keyof ImportRowInput> = {
  "first name": "firstName",
  firstname: "firstName",
  "last name": "lastName",
  lastname: "lastName",
  surname: "lastName",
  email: "email",
  "email address": "email",
  phone: "phone",
  "phone number": "phone",
  mobile: "phone",
  "job title": "jobTitle",
  title: "jobTitle",
  position: "jobTitle",
  department: "department",
  team: "department",
  status: "status",
  "employment type": "employmentType",
  "employment-type": "employmentType",
  "start date": "startDate",
  startdate: "startDate",
  salary: "salary",
  "annual salary": "salary",
  currency: "currency",
  "date of birth": "dateOfBirth",
  dob: "dateOfBirth",
  city: "city",
  postcode: "postcode",
  "post code": "postcode",
  zip: "postcode",
  country: "country",
};

const VALID_STATUS = new Set(["active", "on_leave", "terminated"]);
const VALID_EMPLOYMENT = new Set(["full_time", "part_time", "contract", "intern"]);

const REQUIRED_HEADERS = [
  "First Name",
  "Last Name",
  "Email",
  "Job Title",
  "Department",
  "Start Date",
];

const TEMPLATE_HEADERS = [
  "First Name",
  "Last Name",
  "Email",
  "Phone",
  "Job Title",
  "Department",
  "Status",
  "Employment Type",
  "Start Date",
  "Salary",
  "Currency",
  "Date of Birth",
  "City",
  "Postcode",
  "Country",
];

function normaliseHeader(h: string): keyof ImportRowInput | null {
  const k = h.trim().toLowerCase();
  return HEADER_MAP[k] ?? null;
}

export function buildTemplateBuffer(): Buffer {
  const wb = XLSX.utils.book_new();
  const exampleRow: Record<string, string | number> = {
    "First Name": "Alex",
    "Last Name": "Morgan",
    Email: "alex.morgan@amigaspecialty.com",
    Phone: "+44 20 7946 0500",
    "Job Title": "Senior Underwriter",
    Department: "Underwriting",
    Status: "active",
    "Employment Type": "full_time",
    "Start Date": "2026-05-01",
    Salary: 78000,
    Currency: "GBP",
    "Date of Birth": "1989-04-12",
    City: "London",
    Postcode: "EC3V 9AQ",
    Country: "United Kingdom",
  };
  const ws = XLSX.utils.json_to_sheet([exampleRow], { header: TEMPLATE_HEADERS });
  ws["!cols"] = TEMPLATE_HEADERS.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, ws, "Employees");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return buf as Buffer;
}

export function parseImportFile(
  buffer: Buffer,
  filename: string,
): { headers: string[]; rows: ImportRowInput[] } | { error: string } {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  let wb: XLSX.WorkBook;
  const isCsv = ext === "csv";
  try {
    if (isCsv) {
      // Keep CSV cells as raw strings — date columns must not be reformatted.
      wb = XLSX.read(buffer.toString("utf-8"), { type: "string", raw: true });
    } else if (ext === "xlsx" || ext === "xls") {
      wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    } else {
      return { error: "Unsupported file type. Use .xlsx, .xls, or .csv" };
    }
  } catch (err) {
    return { error: `Could not read file: ${err instanceof Error ? err.message : String(err)}` };
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { error: "Workbook contains no sheets" };
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return { error: "Workbook contains no sheets" };
  // For CSV: raw=true keeps strings intact. For Excel: raw=true preserves Date objects so
  // we can normalise consistently downstream.
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
  });
  if (raw.length === 0) {
    return { error: "Sheet has no data rows" };
  }
  const firstRow = raw[0];
  const headers = firstRow ? Object.keys(firstRow) : [];
  const missing = REQUIRED_HEADERS.filter(
    (h) => !headers.some((file) => normaliseHeader(file) === normaliseHeader(h)),
  );
  if (missing.length > 0) {
    return {
      error: `Missing required columns: ${missing.join(", ")}. Download the template for the expected format.`,
    };
  }
  const rows: ImportRowInput[] = raw.map((rec) => {
    const out: ImportRowInput = {};
    for (const [k, v] of Object.entries(rec)) {
      const norm = normaliseHeader(k);
      if (!norm) continue;
      if (v === null || v === undefined || v === "") continue;
      if (norm === "salary") {
        out.salary = typeof v === "number" ? v : String(v);
      } else if (v instanceof Date) {
        // Excel date cell — convert to ISO date directly so we don't go through M/D/YY.
        (out as Record<string, string>)[norm] = v.toISOString().slice(0, 10);
      } else {
        (out as Record<string, string>)[norm] = String(v).trim();
      }
    }
    return out;
  });
  return { headers, rows };
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DMY_RE = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/;

function isRealCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

function toIsoDate(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (ISO_DATE_RE.test(s)) {
    const [y, mo, d] = s.split("-").map(Number);
    if (y === undefined || mo === undefined || d === undefined) return null;
    return isRealCalendarDate(y, mo, d) ? s : null;
  }
  const m = s.match(DMY_RE);
  if (m && m[1] && m[2] && m[3]) {
    let day = Number(m[1]);
    let month = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    if (month > 12 && day <= 12) {
      const t = day;
      day = month;
      month = t;
    }
    if (!isRealCalendarDate(year, month, day)) return null;
    return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  }
  return null;
}

export function validateImportRow(
  row: ImportRowInput,
  rowNumber: number,
  existingEmails: Set<string>,
  seenEmails: Set<string>,
): ImportRowResult {
  const errors: string[] = [];
  const firstName = (row.firstName ?? "").trim();
  const lastName = (row.lastName ?? "").trim();
  const email = (row.email ?? "").trim().toLowerCase();
  const jobTitle = (row.jobTitle ?? "").trim();
  const department = (row.department ?? "").trim();

  if (!firstName) errors.push("First Name is required");
  if (!lastName) errors.push("Last Name is required");
  if (!email) errors.push("Email is required");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Email is not a valid address");
  if (!jobTitle) errors.push("Job Title is required");
  if (!department) errors.push("Department is required");

  if (email && existingEmails.has(email)) errors.push("Email already exists in system");
  if (email && seenEmails.has(email)) errors.push("Email is duplicated in this file");

  let startDateIso: string | null = null;
  if (!row.startDate) {
    errors.push("Start Date is required");
  } else {
    startDateIso = toIsoDate(String(row.startDate));
    if (!startDateIso) errors.push(`Start Date "${row.startDate}" is not a recognised date`);
  }

  let dateOfBirthIso: string | null = null;
  if (row.dateOfBirth) {
    dateOfBirthIso = toIsoDate(String(row.dateOfBirth));
    if (!dateOfBirthIso) errors.push(`Date of Birth "${row.dateOfBirth}" is not a recognised date`);
  }

  const status = (row.status ?? "active").trim().toLowerCase();
  if (!VALID_STATUS.has(status)) {
    errors.push(`Status must be one of: ${[...VALID_STATUS].join(", ")}`);
  }
  const employmentType = (row.employmentType ?? "full_time").trim().toLowerCase();
  if (!VALID_EMPLOYMENT.has(employmentType)) {
    errors.push(`Employment Type must be one of: ${[...VALID_EMPLOYMENT].join(", ")}`);
  }

  let salaryNum: number | null = null;
  if (row.salary !== undefined && row.salary !== null && row.salary !== "") {
    const cleaned = typeof row.salary === "number" ? row.salary : Number(String(row.salary).replace(/[£,\s]/g, ""));
    if (!Number.isFinite(cleaned) || cleaned < 0) {
      errors.push(`Salary "${row.salary}" is not a valid number`);
    } else {
      salaryNum = cleaned;
    }
  }

  if (errors.length > 0) {
    return { rowNumber, status: "error", data: row, errors };
  }

  if (email) seenEmails.add(email);

  return {
    rowNumber,
    status: "ok",
    data: {
      firstName,
      lastName,
      email,
      phone: row.phone?.trim() || null,
      jobTitle,
      department,
      status: status as ImportRowParsed["status"],
      employmentType: employmentType as ImportRowParsed["employmentType"],
      startDate: startDateIso!,
      salary: salaryNum,
      currency: (row.currency ?? "GBP").trim().toUpperCase() || "GBP",
      dateOfBirth: dateOfBirthIso,
      city: row.city?.trim() || null,
      postcode: row.postcode?.trim() || null,
      country: row.country?.trim() || null,
    },
    errors: [],
  };
}

export function nextEmployeeNumber(currentMax: number): string {
  const n = currentMax + 1;
  return `AMG${String(n).padStart(4, "0")}`;
}

export function highestEmployeeSequence(numbers: string[]): number {
  let max = 0;
  for (const n of numbers) {
    const m = n.match(/^AMG(\d+)$/i);
    if (m && m[1]) {
      const v = Number(m[1]);
      if (v > max) max = v;
    }
  }
  return max;
}
