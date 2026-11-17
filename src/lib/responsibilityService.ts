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
import { ResponsibilityItem, ResponsibilityScope, UserRole } from "../types";

/**
 * Fetch all responsibilities from the library
 */
export async function fetchResponsibilities(): Promise<ResponsibilityItem[]> {
  const q = query(collection(db, "responsibilitiesLibrary"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data(), id: d.id } as ResponsibilityItem));
}

/**
 * Create a new responsibility item
 */
export async function createResponsibility(
  data: {
    scope: ResponsibilityScope;
    targetId?: string | null;
    title: string;
    description: string;
  },
  actor: { uid: string; role: UserRole }
): Promise<string> {
  if (!data.scope) {
    throw new Error("Missing Information: Responsibility Scope category is required.");
  }
  if (!data.title || !data.title.trim()) {
    throw new Error("Missing Information: Responsibility Title cannot be empty.");
  }
  if (!data.description || !data.description.trim()) {
    throw new Error("Missing Information: Responsibility Description cannot be empty.");
  }
  if (data.scope === "working_group" && !data.targetId) {
    throw new Error("Missing Information: Please select a valid Working Group.");
  }
  if (data.scope === "sub_team" && !data.targetId) {
    throw new Error("Missing Information: Please select a valid Sub-Team.");
  }

  const docRef = await addDoc(collection(db, "responsibilitiesLibrary"), {
    scope: data.scope,
    targetId: data.targetId || null,
    title: data.title.trim(),
    description: data.description.trim(),
    isActive: true,
    createdAt: serverTimestamp(),
  });

  await logAuditAction({
    actorId: actor.uid,
    actorRole: actor.role,
    action: "CREATE_RESPONSIBILITY",
    targetCollection: "responsibilitiesLibrary",
    targetId: docRef.id,
    metadata: { scope: data.scope, title: data.title },
  });

  return docRef.id;
}
/**
 * Delete a responsibility item
 */
export async function deleteResponsibility(
  responsibilityId: string,
  actor: { uid: string; role: UserRole }
) {
  await deleteDoc(doc(db, "responsibilitiesLibrary", responsibilityId));

  await logAuditAction({
    actorId: actor.uid,
    actorRole: actor.role,
    action: "DELETE_RESPONSIBILITY",
    targetCollection: "responsibilitiesLibrary",
    targetId: responsibilityId,
  });
}