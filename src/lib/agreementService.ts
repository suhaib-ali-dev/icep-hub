import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logAuditAction } from "@/lib/orgService";
import { AgreementTemplate, Agreement, UserRole, AgreementType } from "@/types";

export async function updateAgreementTemplate(
  templateId: string,
  updates: Partial<AgreementTemplate>
) {
  const ref = doc(db, "agreementTemplates", templateId);
  await updateDoc(ref, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteAgreementTemplate(templateId: string) {
  const ref = doc(db, "agreementTemplates", templateId);
  await deleteDoc(ref);
}

import { Timestamp } from "firebase/firestore";

export function formatAgreementDate(
  value?: Timestamp | Date | string | number | null
): string {
  if (!value) return "N/A";

  let date: Date;
  if (typeof (value as Timestamp)?.toDate === "function") {
    date = (value as Timestamp).toDate();
  } else if (
    typeof value === "object" &&
    value !== null &&
    "seconds" in value &&
    typeof (value as { seconds: unknown }).seconds === "number"
  ) {
    date = new Date((value as { seconds: number }).seconds * 1000);
  } else {
    date = new Date(value as string | number | Date);
  }

  if (Number.isNaN(date.getTime())) return "N/A";

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export async function queueAgreementNotification(params: {
  to: string;
  subject: string;
  memberName: string;
  agreementTitle: string;
  eventType: "submitted" | "approved" | "needs_correction" | "rejected" | "renewal_reminder";
  feedback?: string;
  daysRemaining?: number;
}) {
  if (!params.to) return;

  const bodyLines: Record<typeof params.eventType, string> = {
    submitted: `Hello ${params.memberName},\n\nYour "${params.agreementTitle}" has been signed and submitted to the ICEP Executive Committee for review.`,
    approved: `Hello ${params.memberName},\n\nCongratulations! Your "${params.agreementTitle}" has been approved and is now ACTIVE for a 12-month term.`,
    needs_correction: `Hello ${params.memberName},\n\nYour "${params.agreementTitle}" has been returned for corrections.\n\nReviewer Notes:\n${params.feedback || "Please review and update your submission."}`,
    rejected: `Hello ${params.memberName},\n\nYour "${params.agreementTitle}" was not approved.\n\nNotes:\n${params.feedback || "Please contact your Working Group Chair for details."}`,
    renewal_reminder: `Hello ${params.memberName},\n\nReminder: Your "${params.agreementTitle}" will expire in ${params.daysRemaining} days. Please log into the ICEP Hub to renew your commitment.`,
  };

  // Writes to standard `mail` collection (Firebase Trigger Email extension) & audit log
  await addDoc(collection(db, "mail"), {
    to: [params.to],
    message: {
      subject: params.subject,
      text: bodyLines[params.eventType],
    },
    metadata: {
      eventType: params.eventType,
      createdAt: serverTimestamp(),
    },
  });
}

function toMillis(ts: any): number {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (ts instanceof Date) return ts.getTime();
  return 0;
}

export async function fetchAgreementTemplates(): Promise<AgreementTemplate[]> {
  const snap = await getDocs(collection(db, "agreementTemplates"));
  const list = snap.docs.map(
    (d) => ({ ...d.data(), id: d.id } as AgreementTemplate)
  );
  return list.sort(
    (a, b) => toMillis((b as any).createdAt) - toMillis((a as any).createdAt)
  );
}

export async function fetchAgreements(user: {
  uid: string;
  role: string; // or UserRole
  workingGroupId?: string | null;
}): Promise<Agreement[]> {
  let snap;
  
  // Allow admins, executive committee, working group chairs, and team leaders to view all submissions
  const isElevatedRole = [
    "super_admin",
    "exec_committee",
    "admin",
    "wg_chair",
    "team_leader",
  ].includes(user.role);

  if (isElevatedRole) {
    snap = await getDocs(collection(db, "agreements"));
  } else {
    if (!user.uid) return [];
    const q = query(
      collection(db, "agreements"),
      where("userId", "==", user.uid)
    );
    snap = await getDocs(q);
  }

  const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as Agreement));
  return list.sort(
    (a, b) =>
      (toMillis(b.submittedAt) || toMillis(b.createdAt)) -
      (toMillis(a.submittedAt) || toMillis(a.createdAt))
  );
}

export async function createAgreementTemplate(
  data: {
    type: AgreementType;
    title: string;
    version: number;
    introductionText: string;
    generalResponsibilities: string[];
    participationRequirements: string[];
    termsAndConditions: string;
    defaultDurationMonths: number;
  },
  actor: { uid: string; role: UserRole }
): Promise<string> {
  const docRef = await addDoc(collection(db, "agreementTemplates"), {
    ...data,
    isActive: true,
    updatedBy: actor.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await logAuditAction({
    actorId: actor.uid,
    actorRole: actor.role,
    action: "CREATE_AGREEMENT_TEMPLATE",
    targetCollection: "agreementTemplates",
    targetId: docRef.id,
    metadata: { title: data.title, version: data.version },
  });

  return docRef.id;
}

/**
 * Step 3 & 4: Generate or fetch agreement with 3-tier responsibility hierarchy
 */export async function getOrCreateMemberAgreement(
  userId: string,
  templateId: string
): Promise<string> {
  if (!userId || userId === "undefined" || !templateId || templateId === "undefined") {
    throw new Error(
      `Missing required ID in getOrCreateMemberAgreement (userId: ${String(
        userId
      )}, templateId: ${String(templateId)})`
    );
  }

  const existingQuery = query(
    collection(db, "agreements"),
    where("userId", "==", userId),
    where("templateId", "==", templateId)
  );
  const existingSnap = await getDocs(existingQuery);
  if (!existingSnap.empty) {
    return existingSnap.docs[0].id;
  }

  const userDoc = await getDoc(doc(db, "users", userId));
  const templateDoc = await getDoc(doc(db, "agreementTemplates", templateId));

  if (!userDoc.exists()) {
    throw new Error(`User document not found in Firestore for ID: ${userId}`);
  }
  if (!templateDoc.exists()) {
    throw new Error(`Agreement Template document not found in Firestore for ID: ${templateId}`);
  }

  const userData = userDoc.data();
  const templateData = templateDoc.data();

  // Robustly catch working group ID from any common field variant
  const wgId = 
    userData.workingGroupId || 
    userData.workingGroup || 
    userData.wgId || 
    null;

  let wgName = "Unassigned";
  let wgResponsibilities: string[] = [];
  
  if (wgId) {
    const wgDoc = await getDoc(doc(db, "workingGroups", wgId));
    if (wgDoc.exists()) {
      const wgData = wgDoc.data();
      // Check multiple title field options to prevent "Unassigned"
      wgName = wgData.name || wgData.title || wgData.groupName || wgData.label || wgId;
      wgResponsibilities = wgData.defaultResponsibilities || wgData.responsibilities || [];
    } else {
      // Fallback if wgId itself is stored as a string name instead of document ID
      wgName = wgId;
    }
  }

  const stId = userData.subTeamId || userData.subTeam || null;
  let stName = "None";
  let stResponsibilities: string[] = [];
  
  if (stId) {
    const stDoc = await getDoc(doc(db, "subTeams", stId));
    if (stDoc.exists()) {
      const stData = stDoc.data();
      stName = stData.name || stData.title || stData.groupName || stId;
      stResponsibilities = stData.defaultResponsibilities || [];
    } else {
      stName = stId;
    }
  }

  const startDate = new Date();
  const endDate = new Date();
  endDate.setMonth(
    endDate.getMonth() + (templateData.defaultDurationMonths || 12)
  );

  const docRef = await addDoc(collection(db, "agreements"), {
    userId,
    templateId,
    type: templateData.type || "membership_commitment",
    version: templateData.version || 1,
    status: "draft",
    memberSnapshot: {
      fullName: userData.fullName || userData.name || "",
      email: userData.email || "",
      country: userData.country || "",
      workingGroupId: wgId,
      workingGroupName: wgName,
      subTeamId: stId,
      subTeamName: stName,
      positionTitle: userData.positionTitle || "Member",
    },
    duration: {
      startDate,
      endDate,
    },
    availability: userData.availability || {
      days: [],
      hoursPerWeek: 4,
      preferredHours: "Flexible",
    },
    responsibilitiesSnapshot: {
      general: templateData.generalResponsibilities || [],
      workingGroup: wgResponsibilities,
      subTeam: stResponsibilities,
    },
    termsSnapshot: templateData.termsAndConditions || "",
    signature: null,
    review: null,
    remindersSent: { thirtyDay: false, sevenDay: false },
    createdAt: serverTimestamp(),
    submittedAt: null,
  });

  return docRef.id;
}
/**
 * Save progress as draft or submit for approval
 */
export async function saveOrSubmitAgreement(
  agreementId: string,
  data: {
    status: "draft" | "pending_approval";
    committedHoursPerWeek: number;
    availabilityDays: string[];
    preferredHours: string;
    generalResponsibilities: string[];
    workingGroupResponsibilities: string[];
    subTeamResponsibilities: string[];
    termsSnapshot?: string;
    workingGroupId?: string | null;
    workingGroupName?: string;
    typedLegalName?: string;
    drawnSignatureDataUrl?: string | null;
  },
  actorId: string
) {
  const agreementRef = doc(db, "agreements", agreementId);

  const updatePayload: Record<string, any> = {
    status: data.status,
    "availability.hoursPerWeek": data.committedHoursPerWeek,
    "availability.days": data.availabilityDays,
    "availability.preferredHours": data.preferredHours,
    "responsibilitiesSnapshot.general": data.generalResponsibilities,
    "responsibilitiesSnapshot.workingGroup": data.workingGroupResponsibilities,
    "responsibilitiesSnapshot.subTeam": data.subTeamResponsibilities,
    updatedAt: serverTimestamp(),
  };

  // Persist resolved Terms & Conditions snapshot if provided
  if (data.termsSnapshot !== undefined) {
    updatePayload.termsSnapshot = data.termsSnapshot;
  }

  // Persist resolved Working Group snapshot if provided
  if (data.workingGroupId !== undefined) {
    updatePayload["memberSnapshot.workingGroupId"] = data.workingGroupId;
  }
  if (data.workingGroupName !== undefined) {
    updatePayload["memberSnapshot.workingGroupName"] = data.workingGroupName;
  }

  if (data.status === "pending_approval") {
    updatePayload.submittedAt = serverTimestamp();
    updatePayload.signature = {
      typedLegalName: data.typedLegalName || "",
      drawnSignatureDataUrl: data.drawnSignatureDataUrl || null,
      agreedToTerms: true,
      signedAt: serverTimestamp(),
      userAgent: typeof window !== "undefined" ? window.navigator.userAgent : "",
    };

    const agreementSnap = await getDoc(agreementRef);
    if (agreementSnap.exists()) {
      const userId = agreementSnap.data().userId;
      await updateDoc(doc(db, "users", userId), {
        agreementStatus: "pending_approval",
        activeAgreementId: agreementId,
        updatedAt: serverTimestamp(),
      });
    }
  }

  await updateDoc(agreementRef, updatePayload);

  await logAuditAction({
    actorId,
    actorRole: "member",
    action: data.status === "pending_approval" ? "SUBMIT_AGREEMENT" : "SAVE_AGREEMENT_DRAFT",
    targetCollection: "agreements",
    targetId: agreementId,
  });
}
export async function reviewAgreement(
  agreementId: string,
  decision: "approved" | "needs_correction" | "rejected" | "terminated",
  adminFeedback: string,
  actor: { uid: string; role: UserRole }
) {
  const agreementRef = doc(db, "agreements", agreementId);
  const agreementSnap = await getDoc(agreementRef);
  if (!agreementSnap.exists()) throw new Error("Agreement not found.");
  const agreementData = agreementSnap.data();

  const mappedStatus = decision === "approved" ? "active" : decision;

  await updateDoc(agreementRef, {
    status: mappedStatus,
    review: {
      reviewedBy: actor.uid,
      reviewedAt: serverTimestamp(),
      decision,
      adminFeedback: adminFeedback || null,
    },
  });

  if (decision === "approved") {
    await updateDoc(doc(db, "users", agreementData.userId), {
      membershipStatus: "active",
      agreementStatus: "active",
      membershipStart: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    await updateDoc(doc(db, "users", agreementData.userId), {
      agreementStatus: decision,
      updatedAt: serverTimestamp(),
    });
  }

  await logAuditAction({
    actorId: actor.uid,
    actorRole: actor.role,
    action: `REVIEW_AGREEMENT_${decision.toUpperCase()}`,
    targetCollection: "agreements",
    targetId: agreementId,
    metadata: { decision, adminFeedback },
  });
}
