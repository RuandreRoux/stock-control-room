export type StepKey = "physical" | "received";

/** The editable columns of a checklist line (mirrors the Excel template). */
export interface LineFields {
  category: string;
  stockMovement: string;
  fromWarehouse: string;
  toWarehouse: string;
  physicalDocument: string;
  responsiblePerson: string;
  physicalReportingTime: string; // HH:MM, SAST
  physicalAccountablePerson: string;
  systemDocument: string;
  systemResponsiblePerson: string;
  systemReportingTime: string; // HH:MM, SAST
  systemAccountablePerson: string;
  source: string;
}

export interface Line extends LineFields {
  id: string;
  order: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StepEntry {
  checked: boolean;
  count: number | null;
  comment: string;
  /** When the check was first ticked (ISO). */
  at: string | null;
  by: string | null;
}

/** One line on one check day, with the line details as they were on that day. */
export interface DayCheck {
  date: string; // YYYY-MM-DD (the day the check is done)
  lineId: string;
  line: LineFields & { order: number };
  physical: StepEntry;
  received: StepEntry;
}

export type Role = "user" | "admin";

/** What the browser knows about the signed-in person. */
export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  person: string;
  mustChangePassword: boolean;
}

/** A user account as shown on the Admin page (never includes the password). */
export interface UserAccount extends SessionUser {
  active: boolean;
  lastLoginAt: string | null;
}

export interface DayResponse {
  date: string;
  today: string;
  role: Role;
  canEdit: boolean;
  checks: DayCheck[];
}

export const LINE_FIELD_KEYS: (keyof LineFields)[] = [
  "category",
  "stockMovement",
  "fromWarehouse",
  "toWarehouse",
  "physicalDocument",
  "responsiblePerson",
  "physicalReportingTime",
  "physicalAccountablePerson",
  "systemDocument",
  "systemResponsiblePerson",
  "systemReportingTime",
  "systemAccountablePerson",
  "source",
];
