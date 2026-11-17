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
import { db } from "./firebase";
import { logAuditAction } from "./orgService";
import { Activity, UserRole, ActivityCategory, ActivityStatus } from "../types";

/**
 * Fetch all activities
 */
export async function fetchActivities(): Promise<Activity[]> {
  const q = query(collection(db, "activities"), orderBy("date", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Activity));
}

/**
 * Create a new Activity / Meeting
 */
export async function createActivity(
  data: {
    name: string;
    category: ActivityCategory;
    description: string;
    workingGroupId?: string | null;
    leadPersonId: string;
    date: any;
    expectedOutcomes: string;
    participantIds?: string[];
  },
  actor: { uid: string; role: UserRole }
): Promise<string> {
  const docRef = await addDoc(collection(db, "activities"), {
    ...data,
    workingGroupId: data.workingGroupId || null,
    participantIds: data.participantIds || [],
    status: "upcoming" as ActivityStatus,
    reportSummary: null,
    createdAt: serverTimestamp(),
  });

  await logAuditAction({
    actorId: actor.uid,
    actorRole: actor.role,
    action: "CREATE_ACTIVITY",
    targetCollection: "activities",
    targetId: docRef.id,
    metadata: { name: data.name, category: data.category },
  });

  return docRef.id;
}

/**
 * Update activity status or add a post-meeting report summary
 */
export async function updateActivityReport(
  activityId: string,
  data: {
    status?: ActivityStatus;
    reportSummary?: string;
  },
  actorId: string
) {
  const activityRef = doc(db, "activities", activityId);
  const updatePayload: Record<string, any> = {};

  if (data.status) updatePayload.status = data.status;
  if (data.reportSummary !== undefined) updatePayload.reportSummary = data.reportSummary;

  await updateDoc(activityRef, updatePayload);

  await logAuditAction({
    actorId,
    actorRole: "member",
    action: "UPDATE_ACTIVITY_REPORT",
    targetCollection: "activities",
    targetId: activityId,
  });
}

/**
 * Delete an activity
 */
export async function deleteActivity(activityId: string, actor: { uid: string; role: UserRole }) {
  await deleteDoc(doc(db, "activities", activityId));

  await logAuditAction({
    actorId: actor.uid,
    actorRole: actor.role,
    action: "DELETE_ACTIVITY",
    targetCollection: "activities",
    targetId: activityId,
  });
}