// Mirrors the NestJS API's response shapes -- see apps/api/src/*/dto and
// prisma/schema.prisma. Kept as one file since the two apps don't share a
// package; if the shapes drift, the fix is here, not a build error there.

export type Role = "AGENCY_ADMIN" | "AGENCY_EDITOR" | "CLIENT_APPROVER" | "CLIENT_VIEWER";

export type ProjectStatus = "ACTIVE" | "ARCHIVED";
export type TaskStatus = "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
export type BriefType = "LANDING_PAGE" | "DESIGN" | "VIDEO";
export type PaymentType = "DP" | "PELUNASAN" | "OTHER";
export type PaymentStatus = "NO_PRICE" | "UNPAID" | "PARTIAL" | "PAID";
export type PaymentVerificationStatus = "PENDING" | "VERIFIED" | "REJECTED";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
}

/** GET/PATCH /users/me -- the client portal's own profile page. */
export type UserProfile = AppUser;

export interface Payment {
  id: string;
  projectId: string;
  type: PaymentType;
  amountIdr: number;
  method: string;
  note: string | null;
  recordedById: string;
  createdAt: string;
  proofImageUrl: string | null;
  verificationStatus: PaymentVerificationStatus;
  verifiedById: string | null;
  verifiedAt: string | null;
  verificationNote: string | null;
}

export interface Invoice {
  id: string;
  organizationId: string;
  projectId: string;
  briefId: string | null;
  amountIdr: number;
  minDpPercent: number | null;
  note: string | null;
  createdById: string;
  createdAt: string;
  emailSentAt: string | null;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  totalPriceIdr: number | null;
  minDpPercent: number | null;
  targetCompletionDate: string | null;
  clientOwnerId: string | null;
  totalPaidIdr: number;
  paymentStatus: PaymentStatus;
  payments: Payment[];
  invoices: Invoice[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary {
  activeProjects: number;
  tasksInReview: number;
  totalRevenueIdr: number;
  outstandingIdr: number;
}

export interface Brief {
  id: string;
  organizationId: string;
  projectId: string;
  title: string;
  type: BriefType;
  context: Record<string, unknown>;
  instructions: string;
  aiSuggestedPriceIdr: number | null;
  aiPriceReasoning: string | null;
  needsClarification: boolean;
  clarificationNote: string | null;
  clarificationRespondedAt: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  // Only present on the unfiltered (cross-project) GET /briefs response --
  // see BriefsService.findAll()'s comment.
  project?: {
    name: string;
    totalPriceIdr: number | null;
    payments: { amountIdr: number; verificationStatus: PaymentVerificationStatus }[];
  };
}

export interface Deliverable {
  id: string;
  taskId: string;
  url: string;
  note: string | null;
  version: number;
  createdById: string;
  createdAt: string;
}

export interface RevisionRequestRecord {
  id: string;
  taskId: string;
  note: string;
  round: number;
  createdById: string;
  createdAt: string;
  billable: boolean | null;
  classifiedById: string | null;
  classifiedAt: string | null;
  classificationNote: string | null;
}

export interface Task {
  id: string;
  organizationId: string;
  projectId: string;
  briefId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  maxRevisions: number;
  revisionsUsed: number;
  deliverables: Deliverable[];
  revisionRequests: RevisionRequestRecord[];
  createdAt: string;
  updatedAt: string;
}
