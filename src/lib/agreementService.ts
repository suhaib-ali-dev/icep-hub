import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logAuditAction } from "@/lib/orgService";
import { AgreementTemplate, Agreement, UserRole, AgreementType } from "@/types";

export async function fetchAgreementTemplates(): Promise<AgreementTemplate[]> {
  const q = query(collection(db, "agreementTemplates"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AgreementTemplate));
}

export async function fetchAgreements(user: {
  uid: string;
  role: UserRole;
}): Promise<Agreement[]> {
  let q;
  if (["super_admin", "exec_committee"].includes(user.role)) {
    q = query(collection(db, "agreements"), orderBy("submittedAt", "desc"));
  } else {
    q = query(
      collection(db, "agreements"),
      where("userId", "==", user.uid),
      orderBy("submittedAt", "desc")
    );
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Agreement));
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
  const existingQuery = query(
    collection(db, "agreements"),
    where("userId", "==", userId),
    where("templateId", "==", templateId)
  );
  const existingSnap = await getDocs(existingQuery);
  if (!existingSnap.empty) {
    return existingSnap.docs[0].id;
  }

  // Fetch user, template, working group, and sub-team in parallel
  const userDoc = await getDoc(doc(db, "users", userId));
  const templateDoc = await getDoc(doc(db, "agreementTemplates", templateId));

  if (!userDoc.exists() || !templateDoc.exists()) {
    throw new Error("User or Agreement Template not found.");
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
  endDate.setMonth(endDate.getMonth() + (templateData.defaultDurationMonths || 12));

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

  if (data.status === "pending_approval") {
    updatePayload.submittedAt = serverTimestamp();
    updatePayload.signature = {
      typedLegalName: data.typedLegalName || "",
      drawnSignatureDataUrl: data.drawnSignatureDataUrl || null,
      agreedToTerms: true,
      signedAt: serverTimestamp(),
      userAgent: typeof window !== "undefined" ? window.navigator.userAgent : "",
    };

    // Update user agreement status
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
  decision: "approved" | "needs_correction" | "rejected",
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