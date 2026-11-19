import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { WorkingGroup, SubTeam, UserProfile, UserRole } from "@/types";




export async function updateWorkingGroup(
  id: string,
  updates: Partial<{
    name: string;
    description: string;
    missionAndObjectives: string;
    chairId: string | null;
    isActive: boolean;
    defaultResponsibilities: string[];
  }>,
  _actor?: { uid: string; role?: string }
) {
  const ref = doc(db, "workingGroups", id);
  await updateDoc(ref, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteWorkingGroup(
  id: string,
  _actor?: { uid: string; role?: string }
) {
  await deleteDoc(doc(db, "workingGroups", id));
}

export async function updateSubTeam(
  id: string,
  updates: Partial<{
    name: string;
    description: string;
    leaderId: string | null;
    isActive: boolean;
    defaultResponsibilities: string[];
  }>,
  _actor?: { uid: string; role?: string }
) {
  const ref = doc(db, "subTeams", id);
  await updateDoc(ref, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteSubTeam(
  id: string,
  _actor?: { uid: string; role?: string }
) {
  await deleteDoc(doc(db, "subTeams", id));
}

/**
 * Record an immutable audit log entry
 */
/**
 * Record an immutable audit log entry (with undefined protection)
 */
export async function logAuditAction(params: {
  actorId?: string | null;
  actorRole?: UserRole | string | null;
  action: string;
  targetCollection: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await addDoc(collection(db, "auditLogs"), {
      actorId: params.actorId || "system",
      actorRole: params.actorRole || "member",
      action: params.action,
      targetCollection: params.targetCollection,
      targetId: params.targetId,
      metadata: params.metadata || {},
      timestamp: serverTimestamp(),
    });
  } catch (error) {
    console.error("Failed to record audit log:", error);
  }
}

/**
 * Fetch all Working Groups ordered by creation date
 */
export async function fetchWorkingGroups(): Promise<WorkingGroup[]> {
  const q = query(collection(db, "workingGroups"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkingGroup));
}

/**
 * Fetch all Sub-Teams
 */
export async function fetchSubTeams(): Promise<SubTeam[]> {
  const q = query(collection(db, "subTeams"), orderBy("createdAt", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SubTeam));
}

/**
 * Fetch all Users (used for Chair/Leader dropdowns and Member Directory)
 */
export async function fetchAllUsers(): Promise<UserProfile[]> {
  const q = query(collection(db, "users"), orderBy("fullName", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() } as UserProfile));
}

/**
 * Create a new Working Group
 */
export async function createWorkingGroup(
  data: {
    name: string;
    description: string;
    missionAndObjectives: string;
    chairId: string | null;
    defaultResponsibilities: string[];
  },
  actor: { uid: string; role: UserRole }
): Promise<string> {
  const docRef = await addDoc(collection(db, "workingGroups"), {
    ...data,
    isActive: true,
    createdAt: serverTimestamp(),
  });

  await logAuditAction({
    actorId: actor.uid,
    actorRole: actor.role,
    action: "CREATE_WORKING_GROUP",
    targetCollection: "workingGroups",
    targetId: docRef.id,
    metadata: { name: data.name },
  });

  return docRef.id;
}

/**
 * Create a new Sub-Team under a Working Group
 */
export async function createSubTeam(
  data: {
    workingGroupId: string;
    name: string;
    description: string;
    leaderId: string | null;
    defaultResponsibilities: string[];
  },
  actor: { uid: string; role: UserRole }
): Promise<string> {
  const docRef = await addDoc(collection(db, "subTeams"), {
    ...data,
    isActive: true,
    createdAt: serverTimestamp(),
  });

  await logAuditAction({
    actorId: actor.uid,
    actorRole: actor.role,
    action: "CREATE_SUB_TEAM",
    targetCollection: "subTeams",
    targetId: docRef.id,
    metadata: { name: data.name, workingGroupId: data.workingGroupId },
  });

  return docRef.id;
}

/**
 * Toggle Working Group active status
 */
export async function toggleWorkingGroupStatus(
  wgId: string,
  isActive: boolean,
  actor: { uid: string; role: UserRole }
) {
  await updateDoc(doc(db, "workingGroups", wgId), { isActive });
  await logAuditAction({
    actorId: actor.uid,
    actorRole: actor.role,
    action: isActive ? "ACTIVATE_WORKING_GROUP" : "ARCHIVE_WORKING_GROUP",
    targetCollection: "workingGroups",
    targetId: wgId,
  });
}