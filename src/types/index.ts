import { Timestamp } from "firebase/firestore";

// ==========================================
// 1. ROLES & STATUS ENUMS
// ==========================================

export type UserRole =
  | "super_admin"
  | "exec_committee"
  | "wg_chair"
  | "team_leader"
  | "member";

export type MembershipStatus =
  | "invited"
  | "active"
  | "inactive"
  | "suspended";

export type AgreementType =
  | "membership_commitment"
  | "position_specific";

export type AgreementStatus =
  | "none"
  | "draft"
  | "pending_approval"
  | "needs_correction"
  | "active"
  | "rejected"
  | "expired";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type TaskStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "on_hold";

export type ActivityCategory =
  | "meeting"
  | "workshop"
  | "project"
  | "event";

export type ActivityStatus =
  | "upcoming"
  | "in_progress"
  | "completed"
  | "cancelled";

// ==========================================
// 2. SHARED SUB-STRUCTURES
// ==========================================

export interface MemberAvailability {
  days: string[];           // e.g., ["Monday", "Wednesday", "Friday"]
  hoursPerWeek: number;     // e.g., 6
  preferredHours: string;   // e.g., "18:00 - 20:00 UTC"
}

// ==========================================
// 3. FIRESTORE COLLECTIONS
// ==========================================

/** Collection: users */
export interface UserProfile {
  uid: string;
  email: string;
  fullName: string;
  country: string;
  role: UserRole;
  positionTitle: string;
  workingGroupId: string | null;
  subTeamId: string | null;
  membershipStatus: MembershipStatus;
  activeAgreementId: string | null;
  agreementStatus: AgreementStatus;
  membershipStart: Timestamp | null;
  membershipEnd: Timestamp | null;
  availability: MemberAvailability;
  inviteToken: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Collection: workingGroups */
export interface WorkingGroup {
  id: string;
  name: string;
  description: string;
  missionAndObjectives: string;
  chairId: string | null;
  defaultResponsibilities: string[];
  isActive: boolean;
  createdAt: Timestamp;
}

/** Collection: subTeams */
export interface SubTeam {
  id: string;
  workingGroupId: string;
  name: string;
  description: string;
  leaderId: string | null;
  defaultResponsibilities: string[];
  isActive: boolean;
  createdAt: Timestamp;
}

/** Collection: agreementTemplates */
export interface AgreementTemplate {
  id: string;
  type: AgreementType;
  title: string;
  version: number;
  introductionText: string;
  generalResponsibilities: string[];
  participationRequirements: string[];
  termsAndConditions: string;
  defaultDurationMonths: number;
  isActive: boolean;
  updatedBy: string;
  updatedAt: Timestamp;
}

/** Collection: agreements */
export interface Agreement {
  id: string;
  userId: string;
  templateId: string;
  type: AgreementType;
  version: number;
  status: Exclude<AgreementStatus, "none">;
  memberSnapshot: {
    fullName: string;
    email: string;
    country: string;
    workingGroupId: string | null;
    workingGroupName: string;
    subTeamId: string | null;
    subTeamName: string;
    positionTitle: string;
  };
  duration: {
    startDate: Timestamp;
    endDate: Timestamp;
  };
  availability: MemberAvailability;
  responsibilitiesSnapshot: {
    general: string[];
    workingGroup: string[];
    subTeam: string[];
  };
  termsSnapshot: string;
  signature: {
    typedLegalName: string;
    drawnSignatureDataUrl: string | null; // Stored as lightweight base64 string (no Storage needed)
    agreedToTerms: boolean;
    signedAt: Timestamp;
    userAgent?: string;
  } | null;
  review: {
    reviewedBy: string;
    reviewedAt: Timestamp;
    decision: "approved" | "needs_correction" | "rejected";
    adminFeedback: string | null;
  } | null;
  remindersSent: {
    thirtyDay: boolean;
    sevenDay: boolean;
  };
  createdAt: Timestamp;
  submittedAt: Timestamp | null;
}

/** Collection: tasks */
export interface Task {
  id: string;
  title: string;
  description: string;
  workingGroupId: string;
  subTeamId: string | null;
  assigneeId: string;
  createdBy: string;
  deadline: Timestamp;
  expectedOutput: string;
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Collection: activities */
export interface Activity {
  id: string;
  name: string;
  category: ActivityCategory;
  description: string;
  workingGroupId: string | null;
  leadPersonId: string;
  date: Timestamp;
  expectedOutcomes: string;
  status: ActivityStatus;
  reportSummary: string | null;
  participantIds: string[];
  createdAt: Timestamp;
}

/** Collection: auditLogs */
export interface AuditLog {
  id: string;
  actorId: string;
  actorRole: UserRole;
  action: string;
  targetCollection: string;
  targetId: string;
  metadata: Record<string, unknown>;
  timestamp: Timestamp;
}