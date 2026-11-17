import { UserProfile, UserRole } from "@/types";

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  exec_committee: "Executive Committee",
  wg_chair: "Working Group Chair",
  team_leader: "Team Leader",
  member: "Member",
};

/**
 * Check if a user has one of the specified roles
 */
export function hasRole(
  profile: UserProfile | null | undefined,
  allowedRoles: UserRole[]
): boolean {
  if (!profile) return false;
  return allowedRoles.includes(profile.role);
}

/**
 * Executive & Admin privileges:
 * - Invite & manage members
 * - Create/edit Working Groups
 * - Manage Agreement Templates & approve/reject submitted agreements
 * - View audit logs
 */
export function canManageOrganization(
  profile: UserProfile | null | undefined
): boolean {
  return hasRole(profile, ["super_admin", "exec_committee"]);
}

/**
 * Sub-team management privileges:
 * - Super Admin, Executive Committee, or Working Group Chairs
 */
export function canManageSubTeams(
  profile: UserProfile | null | undefined
): boolean {
  return hasRole(profile, ["super_admin", "exec_committee", "wg_chair"]);
}

/**
 * Leadership privileges:
 * - Assign & edit tasks
 * - Schedule & record activities
 */
export function canManageOperations(
  profile: UserProfile | null | undefined
): boolean {
  return hasRole(profile, [
    "super_admin",
    "exec_committee",
    "wg_chair",
    "team_leader",
  ]);
}

/**
 * Strict Super Admin privileges (e.g., deleting users or agreements)
 */
export function isSuperAdmin(
  profile: UserProfile | null | undefined
): boolean {
  return hasRole(profile, ["super_admin"]);
}