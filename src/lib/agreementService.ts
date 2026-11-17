import {
  collection,
  addDoc,
  updateDoc,
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
 */
export async function getOrCreateMemberAgreement(
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

  let wgName = "Unassigned";
  let wgResponsibilities: string[] = [];
  if (userData.workingGroupId) {
    const wgDoc = await getDoc(doc(db, "workingGroups", userData.workingGroupId));
    if (wgDoc.exists()) {
      wgName = wgDoc.data().name || "Unassigned";
      wgResponsibilities = wgDoc.data().defaultResponsibilities || [];
    }
  }

  let stName = "None";
  let stResponsibilities: string[] = [];
  if (userData.subTeamId) {
    const stDoc = await getDoc(doc(db, "subTeams", userData.subTeamId));
    if (stDoc.exists()) {
      stName = stDoc.data().name || "None";
      stResponsibilities = stDoc.data().defaultResponsibilities || [];
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
      fullName: userData.fullName || "",
      email: userData.email || "",
      country: userData.country || "",
      workingGroupId: userData.workingGroupId || null,
      workingGroupName: wgName,
      subTeamId: userData.subTeamId || null,
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