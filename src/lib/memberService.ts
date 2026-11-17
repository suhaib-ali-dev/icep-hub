import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import {
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logAuditAction } from "@/lib/orgService";
import {
  UserRole,
  MembershipStatus,
  MemberAvailability,
} from "@/types";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function generateTempPassword(): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let pwd = "";
  for (let i = 0; i < 14; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

/**
 * Invite a new member without disrupting the current Admin's auth session
 */
export async function inviteNewMember(
  input: {
    email: string;
    fullName: string;
    country: string;
    role: UserRole;
    positionTitle: string;
    workingGroupId: string | null;
    subTeamId: string | null;
  },
  actor: { uid: string; role: UserRole }
): Promise<{ uid: string; tempPassword: string; resetEmailSent: boolean }> {
  const secondaryAppName = `InviteWorker_${Date.now()}`;
  const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
  const secondaryAuth = getAuth(secondaryApp);
  const tempPassword = generateTempPassword();

  try {
    // 1. Create Auth user on secondary instance
    const credential = await createUserWithEmailAndPassword(
      secondaryAuth,
      input.email.trim(),
      tempPassword
    );
    const newUid = credential.user.uid;

    // 2. Write Firestore UserProfile using the primary Admin's Firestore session
    await setDoc(doc(db, "users", newUid), {
      uid: newUid,
      email: input.email.trim(),
      fullName: input.fullName.trim(),
      country: input.country.trim(),
      role: input.role,
      positionTitle: input.positionTitle.trim(),
      workingGroupId: input.workingGroupId || null,
      subTeamId: input.subTeamId || null,
      membershipStatus: "invited" as MembershipStatus,
      activeAgreementId: null,
      agreementStatus: "none",
      membershipStart: null,
      membershipEnd: null,
      availability: {
        days: [],
        hoursPerWeek: 4,
        preferredHours: "Flexible",
      },
      inviteToken: crypto.randomUUID(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // 3. Trigger Firebase password setup email so the member can set their own password
    let resetEmailSent = false;
    try {
      await sendPasswordResetEmail(secondaryAuth, input.email.trim());
      resetEmailSent = true;
    } catch (emailErr) {
      console.warn("Could not auto-send password reset email:", emailErr);
    }

    // 4. Record audit log
    await logAuditAction({
      actorId: actor.uid,
      actorRole: actor.role,
      action: "INVITE_MEMBER",
      targetCollection: "users",
      targetId: newUid,
      metadata: {
        email: input.email.trim(),
        fullName: input.fullName.trim(),
        role: input.role,
        workingGroupId: input.workingGroupId,
      },
    });

    await signOut(secondaryAuth);
    return { uid: newUid, tempPassword, resetEmailSent };
  } finally {
    await deleteApp(secondaryApp);
  }
}

/**
 * Admin/Exec update of a member's organizational placement, role, or status
 */
export async function updateMemberPlacement(
  targetUid: string,
  updates: {
    fullName: string;
    country: string;
    role: UserRole;
    positionTitle: string;
    workingGroupId: string | null;
    subTeamId: string | null;
    membershipStatus: MembershipStatus;
  },
  actor: { uid: string; role: UserRole }
) {
  await updateDoc(doc(db, "users", targetUid), {
    ...updates,
    updatedAt: serverTimestamp(),
  });

  await logAuditAction({
    actorId: actor.uid,
    actorRole: actor.role,
    action: "UPDATE_MEMBER_PLACEMENT",
    targetCollection: "users",
    targetId: targetUid,
    metadata: updates,
  });
}

/**
 * Self-service update of a member's weekly availability
 */
export async function updateMyAvailability(
  uid: string,
  availability: MemberAvailability
) {
  await updateDoc(doc(db, "users", uid), {
    availability,
    updatedAt: serverTimestamp(),
  });
}