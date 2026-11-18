"use client";

import React, { useEffect, useState, useRef } from "react";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { canManageOrganization } from "@/lib/permissions";
import { downloadOfficialAgreementPdf } from "@/lib/agreementPdfGenerator";
import {
  fetchAgreementTemplates,
  fetchAgreements,
  createAgreementTemplate,
  deleteAgreementTemplate,
  getOrCreateMemberAgreement,
  saveOrSubmitAgreement,
  reviewAgreement,
} from "@/lib/agreementService";
import { fetchAllUsers } from "@/lib/orgService";
import { AgreementTemplate, Agreement, UserProfile, AgreementType } from "@/types";
import {
  FileSignature,
  Plus,
  CheckCircle2,
  AlertCircle,
  Clock,
  PenTool,
  RotateCcw,
  X,
  RefreshCw,
  Printer,
  Save,
  Send,
  ShieldCheck,
  Users,
  Eye,
  Calendar,
  Download,
  Award,
  Layers,
  Briefcase,
  Globe,
  User,
  Lock
} from "lucide-react";

export const DEFAULT_ICEP_TERMS_AND_CONDITIONS = `3.1 VOLUNTARY & NON-EMPLOYMENT STATUS
Membership in the International Commission for Equity and Peace (ICEP) is voluntary and reflects a commitment to uphold organizational standards while participating in organizational activities and when representing the organization publicly. Nothing in this Agreement creates an employment relationship, partnership, joint venture, or agency between the Member and ICEP.

3.2 STRICT CONFIDENTIALITY & NON-DISCLOSURE
Members may have access to confidential information, including:
- Internal discussions and strategic planning
- Grant opportunities and partner communications
- Organizational documents and research in development
- Personal information shared within the organization
- Upcoming policy events and convenings
- Information related to conflict resolution processes
All ICEP members are expected to hold in strict confidence internal discussions and organizational information during and after their membership term unless such information has been explicitly designated for public release.

3.3 SURVIVOR-CENTERED ETHICS & DO NO HARM
Given ICEP’s engagement with survivors of political, gender-based, domestic, and intimate partner violence ("survivors"), Members must uphold strict trauma-informed, survivor-centered standards at all times. Members shall never exploit, sensationalize, or disclose survivor identities, testimonies, or personal histories without explicit, informed, and revocable written consent.

3.4 DATA PROTECTION & DIGITAL SECURITY
Members must comply with international data protection principles (including GDPR-equivalent standards) when collecting, storing, or transmitting ICEP or survivor-related data. Sensitive files must never be stored on unsecured public drives or shared via unauthorized third-party platforms.

3.5 INTELLECTUAL PROPERTY & ATTRIBUTION
Collaborative outputs—including research papers, policy briefs, toolkits, curricula, and campaign materials produced under ICEP Working Groups—remain the shared intellectual property of ICEP, with fair academic and professional attribution credited to contributing Members in accordance with ICEP publication guidelines.

3.6 EXTERNAL REPRESENTATION & PUBLIC STATEMENTS
Members may identify their affiliation with ICEP accurately in professional biographies. However, no Member may issue public statements, press releases, policy endorsements, or enter into external partnerships on behalf of ICEP without prior written authorization from the Executive Committee.

3.7 CONFLICT OF INTEREST DISCLOSURE
Members must disclose any personal, financial, professional, or organizational interests that could reasonably influence—or appear to influence—their work within ICEP. Transparency allows potential conflicts to be managed fairly and protects the integrity of organizational decision-making.

3.8 TERM, RENEWAL & ANNUAL REVIEW
Unless otherwise specified, this Agreement remains active for twelve (12) months from the date of Executive approval. Prior to expiration, Members will receive automated 30-day and 7-day renewal notices to reaffirm or update their commitments.

3.9 RESIGNATION, SUSPENSION & TERMINATION
A Member may resign at any time by providing written notice to their Working Group Chair and the Executive Committee. ICEP reserves the right to suspend or terminate membership immediately in the event of a material breach of this Agreement, ethical misconduct, or breach of confidentiality.

3.10 AMENDMENTS & RESTORATIVE RESOLUTION
ICEP may update organizational policies and standard agreement terms periodically, communicating material updates transparently to all active Members. Disputes arising under this Agreement shall be addressed first through internal restorative dialogue and mediation facilitated by the Executive Committee.`;

const AGREEMENT_STATUS_BADGES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  pending_approval: "bg-amber-50 text-amber-700 border-amber-200",
  needs_correction: "bg-orange-50 text-orange-700 border-orange-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  expired: "bg-red-50 text-red-700 border-red-200",
  terminated: "bg-rose-50 text-rose-800 border-rose-200",
};

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function ContractsPage() {
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<AgreementTemplate[]>([]);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Admin View Toggle
  const [viewMode, setViewMode] = useState<"admin" | "member">("admin");

  // Template Inspection & Editing State
  const [inspectingTemplate, setInspectingTemplate] = useState<AgreementTemplate | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  // Template Modal (Admin)
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [tplType, setTplType] = useState<AgreementType>("membership_commitment");
  const [tplTitle, setTplTitle] = useState("");
  const [tplVersion, setTplVersion] = useState<number>(1);
  const [tplIntro, setTplIntro] = useState("");
  const [tplGeneralResp, setTplGeneralResp] = useState("");
  const [tplParticipation, setTplParticipation] = useState("");
  const [tplTerms, setTplTerms] = useState("");
  const [tplDuration, setTplDuration] = useState<number>(12);
  const [creatingTpl, setCreatingTpl] = useState(false);

  // Helper function to safely parse Firestore Timestamps or date strings
const parseSafeDate = (val: any): Date | null => {
  if (!val) return null;
  if (typeof val.toDate === "function") return val.toDate();
  if (val instanceof Date) return val;
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  } catch (err) {
    return null;
  }
};

  // Member Document Form / Preview & Wizard Stage State (Stage 1 -> Stage 2 -> Stage 3)
  const [wizardStage, setWizardStage] = useState<1 | 2 | 3>(1);
  const [activeSigningAgreement, setActiveSigningAgreement] =
    useState<Agreement | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<AgreementTemplate | null>(
    null
  );
  const [typedLegalName, setTypedLegalName] = useState("");
  const [committedHours, setCommittedHours] = useState<number>(4);
  const [availabilityDays, setAvailabilityDays] = useState<string[]>([]);
  const [preferredHours, setPreferredHours] = useState("Flexible");
  const [generalResp, setGeneralResp] = useState<string[]>([]);
  const [wgResp, setWgResp] = useState<string[]>([]);
  const [stResp, setStResp] = useState<string[]>([]);
  const [libraryIntroText, setLibraryIntroText] = useState<string>("");
  const [submittingAction, setSubmittingAction] = useState(false);

  // Signature Canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Admin Review Modal
  const [reviewingAgreement, setReviewingAgreement] = useState<Agreement | null>(
    null
  );
  const [reviewDecision, setReviewDecision] = useState<
    "approved" | "needs_correction" | "rejected" | "terminated"
  >("approved");
  const [adminFeedback, setAdminFeedback] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  const loadData = async () => {
    if (!profile) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const [tpls, agrs, userList] = await Promise.all([
        fetchAgreementTemplates(),
        fetchAgreements({ uid: profile.uid, role: profile.role, workingGroupId: (profile as any).workingGroupId }),
        fetchAllUsers(),
      ]);
      setTemplates(tpls || []);
      setAgreements(agrs || []);
      setUsers(userList || []);
    } catch (error: unknown) {
      console.error("Error loading contracts:", error);
      setErrorMsg(
        error instanceof Error ? error.message : "Failed to load contract data."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile) {
      setViewMode(canManageOrganization(profile) ? "admin" : "member");
      loadData();
    }
  }, [profile]);

  const isAdminOrExec = canManageOrganization(profile);
  const showAdminView = isAdminOrExec && viewMode === "admin";

  const getUserName = (uid: string) => {
    return (
      users.find((u) => u.uid === uid)?.fullName ||
      agreements.find((a) => a.userId === uid)?.memberSnapshot?.fullName ||
      "Unknown Member"
    );
  };

  const toggleDay = (day: string) => {
    setAvailabilityDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const seedSampleTemplate = async () => {
    if (!profile) return;
    setCreatingTpl(true);
    try {
      await createAgreementTemplate(
        {
          type: "membership_commitment",
          title: "ICEP Working Group Member Commitment Agreement",
          version: 1,
          introductionText:
            "The International Commission for Equity and Peace (ICEP) is an interdisciplinary coalition of researchers, practitioners, advocates, policymakers, survivors, activists, healers, artists, scholars, and community-based leaders committed to advancing global equity, peace, and social justice through collaborative research efforts, international and regional policy engagement, capacity strengthening, community-driven action, grassroots mobilization, and transnational movement-building.\n\nThe strength of ICEP depends upon the professionalism, integrity, and collaborative spirit of its members. This document establishes shared expectations regarding participation, leadership, conduct, and representation to ensure that all members contribute to a respectful, accountable, and mission-driven community.",
          generalResponsibilities: [
            "Participate regularly in meetings and Working Group (WG) activities.",
            "Complete agreed-upon tasks within established timelines.",
            "Maintain strict confidentiality regarding internal organizational documents and discussions.",
            "Disclose any personal or professional conflicts of interest transparently.",
          ],
          participationRequirements: ["Commit minimum weekly hours as agreed."],
          termsAndConditions:
            "This agreement signifies my good-faith commitment to my Working Group and ICEP leadership. Should my availability change, I agree to notify my Working Group Chair immediately.",
          defaultDurationMonths: 12,
        },
        { uid: profile.uid, role: profile.role }
      );
      await loadData();
    } catch (err) {
      console.error("Failed to seed sample template:", err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to create sample template.");
    } finally {
      setCreatingTpl(false);
    }
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setCreatingTpl(true);

    try {
      const genResp = tplGeneralResp
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const partReq = tplParticipation
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

      await createAgreementTemplate(
        {
          type: tplType,
          title: tplTitle.trim(),
          version: Number(tplVersion),
          introductionText: tplIntro.trim(),
          generalResponsibilities: genResp,
          participationRequirements: partReq,
          termsAndConditions: tplTerms.trim(),
          defaultDurationMonths: Number(tplDuration),
        },
        { uid: profile.uid, role: profile.role }
      );

      setTplTitle("");
      setTplIntro("");
      setTplGeneralResp("");
      setTplParticipation("");
      setTplTerms("");
      setShowTemplateModal(false);
      await loadData();
    } catch (error) {
      console.error("Failed to create template:", error);
      setErrorMsg(error instanceof Error ? error.message : "Failed to create template.");
    } finally {
      setCreatingTpl(false);
    }
  };

  const handleOpenAgreementForm = async (templateId: string) => {
    if (!profile) {
      setErrorMsg("User profile is not loaded yet. Please refresh the page.");
      return;
    }

    const currentUserId = profile.uid || (profile as any)?.id || (profile as any)?.userId;

    if (!currentUserId || !templateId) {
      setErrorMsg("Unable to open agreement: missing user ID or template ID.");
      return;
    }

    try {
      const agreementId = await getOrCreateMemberAgreement(currentUserId, templateId);

      const [tpls, agrs] = await Promise.all([
        fetchAgreementTemplates(),
        fetchAgreements({ uid: currentUserId, role: profile.role || "member", workingGroupId: (profile as any).workingGroupId }),
      ]);
      setTemplates(tpls || []);
      setAgreements(agrs || []);

      const agr = agrs.find((a) => a.id === agreementId);
      const tpl = tpls.find((t) => t.id === templateId);

      if (agr && tpl) {
        let resolvedIntroText = tpl.introductionText || "";
        let resolvedGeneralResponsibilities: string[] =
          agr.responsibilitiesSnapshot?.general?.length
            ? agr.responsibilitiesSnapshot.general
            : tpl.generalResponsibilities || [];

        try {
          const genQuery = query(
            collection(db, "responsibilitiesLibrary"),
            where("scope", "==", "general"),
            where("isActive", "==", true)
          );
          const genSnap = await getDocs(genQuery);
          if (!genSnap.empty) {
            const genDoc = genSnap.docs[0].data();
            if (genDoc.description) {
              const fullText = String(genDoc.description);
              const splitMarker = "ICEP Membership Expectations:";
              const markerIndex = fullText.indexOf(splitMarker);

              if (markerIndex !== -1) {
                resolvedIntroText = fullText.slice(0, markerIndex).trim();
                const expectationsPart = fullText.slice(markerIndex);
                const confIndex = expectationsPart.indexOf("III. Confidentiality");
                const behavioralPart =
                  confIndex !== -1 ? expectationsPart.slice(0, confIndex) : expectationsPart;

                const extractedGeneralBullets = behavioralPart
                  .split(/●|\n/)
                  .map((line) => line.trim())
                  .filter(
                    (line) =>
                      line.length > 0 &&
                      !line.startsWith("ICEP Membership Expectations") &&
                      !line.startsWith("I. Participation") &&
                      !line.startsWith("II. Professional") &&
                      !line.endsWith("Members are expected to:") &&
                      !line.startsWith("Recognizing that members are volunteers") &&
                      !line.startsWith("ICEP values healthy debate")
                  );

                if (extractedGeneralBullets.length > 0) {
                  resolvedGeneralResponsibilities = extractedGeneralBullets;
                }
              } else {
                resolvedIntroText = fullText;
              }
            }
          }
        } catch (genErr) {
          console.error("Error fetching general introduction from library:", genErr);
        }
        setLibraryIntroText(resolvedIntroText);

        const liveWgId =
          (profile as any).workingGroupId ||
          (profile as any).workingGroup ||
          agr.memberSnapshot?.workingGroupId ||
          null;

        let resolvedWgName = agr.memberSnapshot?.workingGroupName || "Unassigned";
        let resolvedWgResponsibilities: string[] =
          agr.responsibilitiesSnapshot?.workingGroup || [];

        if (liveWgId) {
          try {
            const wgSnap = await getDoc(doc(db, "workingGroups", liveWgId));
            if (wgSnap.exists()) {
              const wgData = wgSnap.data();
              resolvedWgName = wgData.name || wgData.title || wgData.groupName || liveWgId;
            } else {
              const wgQuery = query(
                collection(db, "workingGroups"),
                where("name", "==", liveWgId)
              );
              const wgQuerySnap = await getDocs(wgQuery);
              if (!wgQuerySnap.empty) {
                resolvedWgName = wgQuerySnap.docs[0].data().name || liveWgId;
              } else {
                resolvedWgName = liveWgId;
              }
            }

            const respQuery = query(
              collection(db, "responsibilitiesLibrary"),
              where("scope", "==", "working_group"),
              where("isActive", "==", true)
            );
            const respSnap = await getDocs(respQuery);

            if (!respSnap.empty) {
              const matchedDocs = respSnap.docs.filter(
                (d) => d.data().targetId === liveWgId
              );
              const docsToUse = matchedDocs.length > 0 ? matchedDocs : respSnap.docs;

              const parsedItems: string[] = [];
              docsToUse.forEach((d) => {
                const data = d.data();
                if (data.description) {
                  const splitItems = String(data.description)
                    .split(/●|\n/)
                    .map((item) => item.trim())
                    .filter(Boolean);
                  parsedItems.push(...splitItems);
                } else if (data.title) {
                  parsedItems.push(data.title);
                }
              });

              if (parsedItems.length > 0) {
                resolvedWgResponsibilities = parsedItems;
              }
            }
          } catch (lookupErr) {
            console.error("Error resolving Working Group details:", lookupErr);
          }
        }

        const hydratedAgreement: Agreement = {
          ...agr,
          memberSnapshot: {
            ...agr.memberSnapshot,
            workingGroupId: liveWgId,
            workingGroupName: resolvedWgName,
          },
          responsibilitiesSnapshot: {
            ...agr.responsibilitiesSnapshot,
            general: resolvedGeneralResponsibilities,
            workingGroup: resolvedWgResponsibilities,
          },
        };

        setActiveSigningAgreement(hydratedAgreement);
        setActiveTemplate(tpl);
        setWizardStage(1);
        setTypedLegalName(agr.signature?.typedLegalName || profile.fullName || "");
        setCommittedHours(agr.availability?.hoursPerWeek || 4);
        setAvailabilityDays(agr.availability?.days || []);
        setPreferredHours(agr.availability?.preferredHours || "Flexible");
        setGeneralResp(resolvedGeneralResponsibilities);
        setWgResp(resolvedWgResponsibilities);
        setStResp(agr.responsibilitiesSnapshot?.subTeam || []);
        setHasDrawn(false);
      } else {
        setErrorMsg("Failed to load the generated agreement document.");
      }
    } catch (error) {
      console.error("Failed to initialize agreement:", error);
      setErrorMsg(error instanceof Error ? error.message : "Failed to initialize agreement.");
    }
  };

  const startDrawing = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setIsDrawing(true);
    setHasDrawn(true);
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    ctx.beginPath();
    ctx.moveTo((clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY);
  };

  const draw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    ctx.lineTo((clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleSaveDraft = async () => {
    if (!profile || !activeSigningAgreement) return;
    setSubmittingAction(true);
    try {
      const resolvedTermsText =
        activeTemplate?.termsAndConditions &&
        activeTemplate.termsAndConditions.trim().length > 100
          ? activeTemplate.termsAndConditions
          : DEFAULT_ICEP_TERMS_AND_CONDITIONS;

      await saveOrSubmitAgreement(
        activeSigningAgreement.id,
        {
          status: "draft",
          committedHoursPerWeek: Number(committedHours),
          availabilityDays,
          preferredHours,
          generalResponsibilities: generalResp,
          workingGroupResponsibilities: wgResp,
          subTeamResponsibilities: stResp,
          termsSnapshot: resolvedTermsText,
          workingGroupId: activeSigningAgreement.memberSnapshot?.workingGroupId || null,
          workingGroupName: activeSigningAgreement.memberSnapshot?.workingGroupName || "Unassigned",
        },
        profile.uid
      );
      await loadData();
      alert("Agreement draft saved successfully!");
    } catch (err) {
      console.error("Failed to save draft:", err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to save draft.");
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleSignAndSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !activeSigningAgreement) return;
    if (!typedLegalName.trim()) {
      alert("Please type your full legal name as your electronic signature.");
      return;
    }

    const currentUserId = profile.uid || (profile as any)?.id || (profile as any)?.userId;
    const canvas = canvasRef.current;
    let drawnSignatureDataUrl =
      activeSigningAgreement.signature?.drawnSignatureDataUrl || null;
    if (canvas && hasDrawn) {
      drawnSignatureDataUrl = canvas.toDataURL("image/png");
    }

    setSubmittingAction(true);
    try {
      const resolvedTermsText =
        activeTemplate?.termsAndConditions &&
        activeTemplate.termsAndConditions.trim().length > 100
          ? activeTemplate.termsAndConditions
          : DEFAULT_ICEP_TERMS_AND_CONDITIONS;

      await saveOrSubmitAgreement(
        activeSigningAgreement.id,
        {
          status: "pending_approval",
          committedHoursPerWeek: Number(committedHours),
          availabilityDays,
          preferredHours,
          generalResponsibilities: generalResp,
          workingGroupResponsibilities: wgResp,
          subTeamResponsibilities: stResp,
          termsSnapshot: resolvedTermsText,
          workingGroupId: activeSigningAgreement.memberSnapshot?.workingGroupId || null,
          workingGroupName: activeSigningAgreement.memberSnapshot?.workingGroupName || "Unassigned",
          typedLegalName: typedLegalName.trim(),
          drawnSignatureDataUrl,
        },
        currentUserId
      );

      const updatedAgreements = await fetchAgreements({
        uid: currentUserId,
        role: profile.role || "member",
        workingGroupId: (profile as any).workingGroupId,
      });
      setAgreements(updatedAgreements);

      setActiveSigningAgreement(null);
      setActiveTemplate(null);
      setWizardStage(1);
      
      alert("Agreement signed and submitted successfully! It is now pending executive review.");
    } catch (error) {
      console.error("Failed to submit agreement:", error);
      setErrorMsg(error instanceof Error ? error.message : "Failed to submit agreement.");
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !reviewingAgreement) return;
    setSubmittingReview(true);

    try {
      await reviewAgreement(
        reviewingAgreement.id,
        reviewDecision,
        adminFeedback.trim(),
        { uid: profile.uid, role: profile.role }
      );

      setReviewingAgreement(null);
      setAdminFeedback("");
      await loadData();
    } catch (error) {
      console.error("Failed to review agreement:", error);
      setErrorMsg(error instanceof Error ? error.message : "Failed to submit review.");
    } finally {
      setSubmittingReview(false);
    }
  };

  const openEditTemplateModal = (tpl: AgreementTemplate) => {
    setEditingTemplateId(tpl.id);
    setTplType(tpl.type || "membership_commitment");
    setTplTitle(tpl.title);
    setTplVersion(tpl.version || 1);
    setTplIntro(tpl.introductionText || "");
    setTplGeneralResp((tpl.generalResponsibilities || []).join("\n"));
    setTplParticipation((tpl.participationRequirements || []).join("\n"));
    setTplTerms(tpl.termsAndConditions || "");
    setTplDuration(tpl.defaultDurationMonths || 12);
    setShowTemplateModal(true); // Your existing template creation modal state
  };

  const handleDeleteTemplate = async (tpl: AgreementTemplate) => {
    if (!window.confirm(`Delete "${tpl.title}" permanently? Existing signed member snapshots will remain preserved.`)) return;
    try {
      await deleteAgreementTemplate(tpl.id);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete template.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900">
              Contracts & Agreements Hub
            </h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              {showAdminView ? "Admin Mode" : "Member Portal"}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Membership commitment agreements, duration tracking, three-stage wizard, and executive review.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isAdminOrExec && (
            <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("admin")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  viewMode === "admin"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Admin Management
              </button>
              <button
                type="button"
                onClick={() => setViewMode("member")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  viewMode === "member"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                My Personal Agreements
              </button>
            </div>
          )}

          <button
            onClick={loadData}
            title="Refresh Data"
            className="p-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>

          {showAdminView && (
            <button
              onClick={() => setShowTemplateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>New Template</span>
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* MEMBER VIEW */}
      {!showAdminView && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
          <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-slate-700" />
            <span>Your Membership Commitment Agreements</span>
          </h2>

          {loading ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Loading agreements...
            </div>
          ) : templates.length === 0 ? (
            <div className="py-12 text-center">
              <FileSignature className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-700">
                No agreement templates available yet.
              </p>
              <p className="text-xs text-slate-400 mt-1">
                An administrator has not published a commitment template yet.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {templates.map((tpl) => {
                const existingAgr = agreements.find(
                  (a) => a.templateId === tpl.id && a.userId === profile?.uid
                );
                const status = existingAgr ? existingAgr.status : "not_started";

                let validityText = null;
                    try {
                      const start = parseSafeDate(existingAgr?.duration?.startDate);
                      const end = parseSafeDate(existingAgr?.duration?.endDate);

                      if (start && end) {
                        validityText = `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
                      }
                    } catch (e) {
                      validityText = null;
                    }

                return (
                  <div
                    key={tpl.id}
                    className="p-5 rounded-lg border border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="font-semibold text-slate-900">
                          {tpl.title}
                        </h3>
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                          v{tpl.version}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize ${
                            AGREEMENT_STATUS_BADGES[status] ||
                            "bg-slate-100 text-slate-600 border-slate-200"
                          }`}
                        >
                          {status.replace("_", " ")}
                        </span>
                        {validityText && (
                          <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>Valid: {validityText}</span>
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                        {tpl.introductionText}
                      </p>
                      {existingAgr?.review?.adminFeedback && (
                        <div className="mt-2 p-2.5 rounded bg-orange-50 border border-orange-200 text-xs text-orange-800 flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>
                            <strong>Admin Feedback / Correction Required:</strong>{" "}
                            {existingAgr.review.adminFeedback}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {status === "active" ? (
                        <>
                          <div className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-medium">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>Agreement Active</span>
                          </div>
                          <button
                            onClick={() => handleOpenAgreementForm(tpl.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>View Document</span>
                          </button>
                          {existingAgr && (
                            <button
                              type="button"
                              onClick={() =>
                                downloadOfficialAgreementPdf(
                                  existingAgr,
                                  existingAgr.termsSnapshot || DEFAULT_ICEP_TERMS_AND_CONDITIONS,
                                  existingAgr.memberSnapshot?.workingGroupName
                                )
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#004aad] hover:bg-[#003882] text-white text-xs font-medium rounded-lg cursor-pointer transition-colors"
                            >
                              <Download className="h-3.5 w-3.5" />
                              <span>Download Official PDF</span>
                            </button>
                          )}
                        </>
                      ) : status === "pending_approval" ? (
                        <div className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-medium">
                          <Clock className="h-4 w-4" />
                          <span>Pending Review</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleOpenAgreementForm(tpl.id)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg cursor-pointer"
                        >
                          <PenTool className="h-3.5 w-3.5" />
                          <span>
                            {status === "needs_correction"
                              ? "Update & Re-Submit"
                              : status === "draft"
                              ? "Continue Agreement Draft"
                              : "Review & Sign Agreement"}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

     {/* ADMIN & EXEC VIEW */}
      {showAdminView && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-indigo-600" />
                  <span>Agreement Templates ({templates.length})</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Published commitment and policy templates for organizational members. Click any template to inspect full contents.
                </p>
              </div>

              {templates.length === 0 && (
                <button
                  onClick={seedSampleTemplate}
                  disabled={creatingTpl}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg border border-emerald-200 transition-colors cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>
                    {creatingTpl ? "Publishing..." : "Quick Publish Sample Template"}
                  </span>
                </button>
              )}
            </div>

            {templates.length === 0 ? (
              <p className="text-xs text-slate-400">
                No templates found in Firestore. Click the button above to seed the sample template instantly.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {templates.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => setInspectingTemplate(t)}
                    className="p-4 rounded-lg border border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/20 transition-all cursor-pointer space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-sm text-slate-900 hover:text-[#004aad]">
                        {t.title}
                      </div>
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">
                          v{t.version}
                        </span>
                        <button
                          type="button"
                          onClick={() => setInspectingTemplate(t)}
                          title="Inspect Full Template"
                          className="p-1 text-slate-500 hover:text-[#004aad] rounded hover:bg-white cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditTemplateModal(t)}
                          title="Edit Template"
                          className="p-1 text-slate-500 hover:text-amber-600 rounded hover:bg-white cursor-pointer"
                        >
                          <PenTool className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTemplate(t)}
                          title="Delete Template"
                          className="p-1 text-slate-500 hover:text-red-600 rounded hover:bg-white cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-2">
                      {t.introductionText}
                    </p>
                    <div className="text-xs text-slate-500 pt-1 flex items-center justify-between">
                      <span>
                        Duration: <strong>{t.defaultDurationMonths || 12} Months</strong> •{" "}
                        <strong>{t.generalResponsibilities?.length || 0} commitments</strong>
                      </span>
                      <span className="text-[#004aad] font-medium">Click to view contents →</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="p-5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Users className="h-5 w-5 text-indigo-600" />
                  <span>Member Agreement Submissions ({agreements.length})</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  All member drafts, pending submissions, active signed agreements, and lifecycle statuses.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Loading agreements...
              </div>
            ) : agreements.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">
                No member agreements created or submitted yet. Switch to &ldquo;My Personal Agreements&rdquo; above to preview and test signing!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-4">Member</th>
                      <th className="py-3 px-4">Working Group</th>
                      <th className="py-3 px-4">Validity Period</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {agreements.map((agr) => {
                      const memberName = getUserName(agr.userId);

                      let validityText = "Not Activated";
                          try {
                            const start = parseSafeDate(agr.duration?.startDate);
                            const end = parseSafeDate(agr.duration?.endDate);

                            if (start && end) {
                              validityText = `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
                            }
                          } catch (e) {
                            validityText = "Active Term";
                          }

                      const statusKey = agr.status || "draft";

                      return (
                        <tr
                          key={agr.id || Math.random()}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="py-3.5 px-4 font-semibold text-slate-900">
                            {memberName}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600">
                            {agr.memberSnapshot?.workingGroupName || "Unassigned"}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-500">
                            {validityText}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize ${
                                AGREEMENT_STATUS_BADGES[statusKey] ||
                                "bg-slate-100 text-slate-600 border-slate-200"
                              }`}
                            >
                              {statusKey.replace("_", " ")}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right space-x-2">
                            <button
                              onClick={() => {
                                setReviewingAgreement(agr);
                                setReviewDecision("approved");
                                setAdminFeedback(agr.review?.adminFeedback || "");
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                            >
                              <FileSignature className="h-3.5 w-3.5" />
                              <span>Inspect & Review</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                downloadOfficialAgreementPdf(
                                  agr,
                                  agr.termsSnapshot || DEFAULT_ICEP_TERMS_AND_CONDITIONS,
                                  agr.memberSnapshot?.workingGroupName
                                )
                              }
                              title="Download Official PDF"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-[#004aad] hover:bg-[#003882] rounded-lg cursor-pointer"
                            >
                              <Download className="h-3.5 w-3.5" />
                              <span>PDF</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ADMIN REVIEW & FULL INSPECTION MODAL */}
      {reviewingAgreement && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200 bg-slate-50 flex items-center justify-between sticky top-0 z-10">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200">
                  Official Agreement Review & Audit
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">
                  {getUserName(reviewingAgreement.userId)} ({reviewingAgreement.memberSnapshot?.workingGroupName || "Assigned Working Group"})
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    downloadOfficialAgreementPdf(
                      reviewingAgreement,
                      reviewingAgreement.termsSnapshot || DEFAULT_ICEP_TERMS_AND_CONDITIONS,
                      reviewingAgreement.memberSnapshot?.workingGroupName
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#004aad] hover:bg-[#003882] rounded-lg cursor-pointer transition-colors shadow-sm"
                >
                  <Download className="h-4 w-4" />
                  <span>Download Official PDF</span>
                </button>
                <button
                  onClick={() => setReviewingAgreement(null)}
                  className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-200/50 cursor-pointer text-sm font-bold"
                >
                  ✕ Close
                </button>
              </div>
            </div>

            {/* Modal Body: Full Agreement Preview & Decision Form */}
            <div className="p-6 space-y-6 text-sm text-slate-700">
              {/* Member Profile & Availability Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-xs font-semibold uppercase text-slate-400">Member Details</span>
                  <p className="font-bold text-slate-900">{reviewingAgreement.memberSnapshot?.fullName || getUserName(reviewingAgreement.userId)}</p>
                  <p className="text-xs text-slate-500">{reviewingAgreement.memberSnapshot?.email || "No email recorded"}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-xs font-semibold uppercase text-slate-400">Organizational Unit</span>
                  <p className="font-bold text-slate-900">{reviewingAgreement.memberSnapshot?.workingGroupName || "Working Group Unassigned"}</p>
                  <p className="text-xs text-slate-500">Sub-Team: {reviewingAgreement.memberSnapshot?.subTeamName || "None"}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-xs font-semibold uppercase text-slate-400">Committed Availability</span>
                  <p className="font-bold text-slate-900">{reviewingAgreement.availability?.hoursPerWeek || 4} hrs/week</p>
                  <p className="text-xs text-slate-500">Window: {reviewingAgreement.availability?.preferredHours || "Flexible"}</p>
                </div>
              </div>

              {/* Section 1: Introduction & Mandate */}
              <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  1. Introduction & Mandate Snapshot
                </h4>
                <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {libraryIntroText || "ICEP interdisciplinary coalition mandate and foundational governance terms."}
                </p>
              </div>

              {/* Section 2: Aggregated Responsibilities */}
              <div className="p-5 bg-white rounded-xl border border-slate-200 space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  2. Aggregated Organizational Responsibilities
                </h4>

                {/* General Commitments */}
                <div>
                  <h5 className="text-xs font-bold text-slate-900 mb-1">A. General ICEP Commitments</h5>
                  <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600">
                    {reviewingAgreement.responsibilitiesSnapshot?.general?.length ? (
                      reviewingAgreement.responsibilitiesSnapshot.general.map((r, i) => <li key={i}>{r}</li>)
                    ) : (
                      <li className="text-slate-400 italic">No general commitments snapshotted.</li>
                    )}
                  </ul>
                </div>

                {/* Working Group Specific */}
                <div>
                  <h5 className="text-xs font-bold text-slate-900 mb-1">
                    B. Working Group Responsibilities ({reviewingAgreement.memberSnapshot?.workingGroupName || "Assigned Working Group"})
                  </h5>
                  <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600">
                    {reviewingAgreement.responsibilitiesSnapshot?.workingGroup?.length ? (
                      reviewingAgreement.responsibilitiesSnapshot.workingGroup.map((r, i) => <li key={i}>{r}</li>)
                    ) : (
                      <li className="text-slate-400 italic">No working group responsibilities mapped.</li>
                    )}
                  </ul>
                </div>
              </div>

              {/* Section 3: Terms & Conditions Snapshot */}
              <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  3. Binding Terms & Conditions Snapshot (12 Clauses)
                </h4>
                <div className="max-h-56 overflow-y-auto p-3 bg-white rounded-lg border border-slate-200 text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">
                  {reviewingAgreement.termsSnapshot || DEFAULT_ICEP_TERMS_AND_CONDITIONS}
                </div>
              </div>

              {/* Section 4: Member Electronic Signature */}
              <div className="p-5 bg-indigo-50/50 rounded-xl border border-indigo-200 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-indigo-900 flex items-center gap-2">
                  <PenTool className="h-4 w-4 text-indigo-600" />
                  <span>Section 4: Execution & Electronic Signature</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                  <div>
                    <p className="text-xs text-slate-500">Typed Legal Name:</p>
                    <p className="text-base font-serif font-bold text-slate-900 mt-0.5">
                      {reviewingAgreement.signature?.typedLegalName || "Not signed"}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Agreed to Terms: {reviewingAgreement.signature?.agreedToTerms ? "Yes (Verified)" : "No"} • IP/Agent: {reviewingAgreement.signature?.userAgent ? "Recorded" : "N/A"}
                    </p>
                  </div>
                  {reviewingAgreement.signature?.drawnSignatureDataUrl ? (
                    <div className="p-2 bg-white rounded-lg border border-slate-300 inline-block">
                      <p className="text-[10px] text-slate-400 mb-1">Drawn Signature Pad:</p>
                      <img
                        src={reviewingAgreement.signature.drawnSignatureDataUrl}
                        alt="Member Signature"
                        className="h-16 object-contain"
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No drawn signature pad used (Typed signature valid).</p>
                  )}
                </div>
              </div>

              {/* Admin Review Action Form */}
              <form onSubmit={handleReviewSubmit} className="pt-4 border-t border-slate-200 space-y-4">
                <h4 className="text-sm font-bold text-slate-900">Executive Review Decision</h4>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: "approved", label: "Approve & Activate", activeBg: "bg-emerald-600 text-white border-emerald-700" },
                    { id: "needs_correction", label: "Return for Correction", activeBg: "bg-amber-600 text-white border-amber-700" },
                    { id: "rejected", label: "Reject Agreement", activeBg: "bg-rose-600 text-white border-rose-700" },
                    { id: "terminated", label: "Terminate Active", activeBg: "bg-slate-600 text-white border-slate-700" },
                  ].map((btn) => (
                    <button
                      key={btn.id}
                      type="button"
                      onClick={() => setReviewDecision(btn.id as any)}
                      className={`px-3 py-2 text-xs font-semibold rounded-lg border cursor-pointer transition-all ${
                        reviewDecision === btn.id
                          ? `${btn.activeBg} shadow-sm`
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Feedback / Revision Notes for Member *
                  </label>
                  <textarea
                    rows={3}
                    value={adminFeedback}
                    onChange={(e) => setAdminFeedback(e.target.value)}
                    placeholder="Provide clear reasons for approval, requested corrections, or termination..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    required={reviewDecision === "needs_correction" || reviewDecision === "rejected"}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setReviewingAgreement(null)}
                    className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingReview}
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg cursor-pointer disabled:opacity-50"
                  >
                    {submittingReview ? "Submitting Decision..." : "Confirm & Submit Decision"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {/* THREE-STAGE SIGNING WIZARD MODAL */}
      {activeSigningAgreement && activeTemplate && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-8 shadow-2xl max-h-[92vh] overflow-y-auto">
            {/* Modal Header & Step Indicator */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-6">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                  Stage {wizardStage} of 3: {wizardStage === 1 ? "Member Information & Availability" : wizardStage === 2 ? "Official Agreement Preview" : "Execution & Electronic Signature"}
                </span>
                <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                  {activeTemplate.title}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Print / PDF</span>
                </button>
                <button
                  onClick={() => setActiveSigningAgreement(null)}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            {/* WIZARD STAGE 1: LOCKED MEMBER INFO & STRUCTURED AVAILABILITY */}
            {wizardStage === 1 && (
              <div className="space-y-6">
                <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <User className="h-4 w-4 text-indigo-600" />
                      <span>Official Member & Organizational Assignments (Locked)</span>
                    </h3>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-xs font-semibold">
                      <Lock className="h-3 w-3" />
                      <span>Read-Only Official Records</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-white rounded-lg border border-slate-200">
                      <span className="text-slate-500 block mb-0.5 font-semibold">Full Legal Name</span>
                      <strong className="text-slate-900">{activeSigningAgreement.memberSnapshot.fullName}</strong>
                    </div>
                    <div className="p-3 bg-white rounded-lg border border-slate-200">
                      <span className="text-slate-500 block mb-0.5 font-semibold">Email Address</span>
                      <strong className="text-slate-900">{activeSigningAgreement.memberSnapshot.email}</strong>
                    </div>
                    <div className="p-3 bg-purple-50/50 rounded-lg border border-purple-200">
                      <span className="text-purple-700 block mb-0.5 font-semibold">Working Group</span>
                      <strong className="text-purple-900">{activeSigningAgreement.memberSnapshot.workingGroupName}</strong>
                    </div>
                    <div className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-200">
                      <span className="text-emerald-700 block mb-0.5 font-semibold">Sub-Team</span>
                      <strong className="text-emerald-900">{activeSigningAgreement.memberSnapshot.subTeamName}</strong>
                    </div>
                  </div>
                </div>

                <div className="p-5 bg-white rounded-xl border border-slate-200 space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-indigo-600" />
                    <span>Time Commitment & Availability Inputs</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Committed Hours Per Week *
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        required
                        value={committedHours}
                        onChange={(e) => setCommittedHours(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Preferred Time Window / Time Zone
                      </label>
                      <input
                        type="text"
                        value={preferredHours}
                        onChange={(e) => setPreferredHours(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        placeholder="e.g., 16:00 - 20:00 UTC"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Available Days
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {DAYS_OF_WEEK.map((day) => {
                        const active = availabilityDays.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => toggleDay(day)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                              active
                                ? "bg-slate-900 text-white border-slate-900"
                                : "bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100"
                            }`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={submittingAction}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg cursor-pointer"
                  >
                    <Save className="h-4 w-4" />
                    <span>Save Draft</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWizardStage(2)}
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg cursor-pointer"
                  >
                    Next: Review Agreement Preview →
                  </button>
                </div>
              </div>
            )}

            {/* WIZARD STAGE 2: AGREEMENT PREVIEW & RESPONSIBILITIES */}
            {wizardStage === 2 && (
              <div className="space-y-6 text-slate-800 text-sm leading-relaxed">
                <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      1. Introduction & Mandate
                    </h4>
                    <span className="text-[11px] font-medium text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                      Organizational Overview & Mission
                    </span>
                  </div>

                  <div className="max-h-72 overflow-y-auto pr-2 space-y-3 text-xs text-slate-700 leading-relaxed bg-white p-4 rounded-lg border border-slate-200">
                    <p className="text-slate-700 whitespace-pre-wrap">
                      {libraryIntroText || activeTemplate.introductionText}
                    </p>
                  </div>
                </div>

                <div className="p-5 bg-white rounded-xl border border-slate-200 space-y-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    2. Aggregated Organizational Responsibilities
                  </h4>

                  <div>
                    <h5 className="text-xs font-bold text-slate-900 mb-1.5">
                      A. Working Group Responsibilities ({activeSigningAgreement.memberSnapshot?.workingGroupName || "Assigned Working Group"})
                    </h5>
                    {activeSigningAgreement.responsibilitiesSnapshot?.workingGroup &&
                    activeSigningAgreement.responsibilitiesSnapshot.workingGroup.length > 0 ? (
                      <ul className="list-disc pl-5 space-y-1 text-xs text-slate-700">
                        {activeSigningAgreement.responsibilitiesSnapshot.workingGroup.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    ) : wgResp.length > 0 ? (
                      <ul className="list-disc pl-5 space-y-1 text-xs text-slate-700">
                        {wgResp.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                        No specific responsibilities have been mapped for <strong>{activeSigningAgreement.memberSnapshot?.workingGroupName || "this Working Group"}</strong> yet. You may proceed, or contact your administrator to update the Responsibility Library.
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      3. Terms and Conditions
                    </h4>
                    <span className="text-[11px] font-medium text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                      12 Binding Clauses • Please Review Carefully
                    </span>
                  </div>

                  <div className="max-h-72 overflow-y-auto pr-2 space-y-3 text-xs text-slate-700 leading-relaxed bg-white p-4 rounded-lg border border-slate-200">
                    {(activeTemplate.termsAndConditions &&
                    activeTemplate.termsAndConditions.trim().length > 100
                      ? activeTemplate.termsAndConditions
                      : DEFAULT_ICEP_TERMS_AND_CONDITIONS
                    )
                      .split(/\n\n+/)
                      .map((clause, idx) => {
                        const [heading, ...bodyLines] = clause.split("\n");
                        return (
                          <div key={idx} className="space-y-1">
                            {bodyLines.length > 0 ? (
                              <>
                                <p className="font-bold text-slate-900">{heading}</p>
                                <p className="text-slate-600">{bodyLines.join(" ")}</p>
                              </>
                            ) : (
                              <p className="text-slate-700 whitespace-pre-wrap">{clause}</p>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setWizardStage(1)}
                    className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                  >
                    ← Back to Info & Availability
                  </button>
                  <button
                    type="button"
                    onClick={() => setWizardStage(3)}
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg cursor-pointer"
                  >
                    Next: Sign & Submit Agreement →
                  </button>
                </div>
              </div>
            )}

            {/* WIZARD STAGE 3: SIGNING & SUBMISSION */}
            {wizardStage === 3 && (
              <form onSubmit={handleSignAndSubmit} className="space-y-6">
                <div className="p-5 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900">
                  You are about to sign this official agreement as <strong>{activeSigningAgreement.memberSnapshot.fullName}</strong>. Upon submission, your agreement will enter the executive review queue with a 12-month validity window.
                </div>

                <div className="p-6 bg-white rounded-xl border-2 border-slate-900 space-y-4">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <PenTool className="h-4 w-4" />
                    <span>Section 4: Execution & Electronic Signature</span>
                  </h4>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Type Full Legal Name (Electronic Signature) *
                    </label>
                    <input
                      type="text"
                      required
                      value={typedLegalName}
                      onChange={(e) => setTypedLegalName(e.target.value)}
                      placeholder="Type your full legal name"
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm font-serif"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-slate-700">
                        Draw Signature (Optional Touch / Mouse Pad)
                      </label>
                      <button
                        type="button"
                        onClick={clearCanvas}
                        className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>Clear</span>
                      </button>
                    </div>
                    <div className="border border-slate-300 rounded-lg bg-slate-50 overflow-hidden">
                      <canvas
                        ref={canvasRef}
                        width={600}
                        height={130}
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={stopDrawing}
                        className="w-full h-32 cursor-crosshair touch-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setWizardStage(2)}
                    className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                  >
                    ← Back to Preview
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSaveDraft}
                      disabled={submittingAction}
                      className="px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg cursor-pointer"
                    >
                      Save Draft
                    </button>
                    <button
                      type="submit"
                      disabled={submittingAction}
                      className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg cursor-pointer disabled:opacity-50"
                    >
                      {submittingAction ? "Submitting..." : "Sign & Submit Agreement"}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* CREATE TEMPLATE MODAL */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">
                Create Agreement Template
              </h2>
              <button
                onClick={() => setShowTemplateModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTemplate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Template Title *
                </label>
                <input
                  type="text"
                  required
                  value={tplTitle}
                  onChange={(e) => setTplTitle(e.target.value)}
                  placeholder="e.g., ICEP WG Member Commitment Agreement"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Version Number *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={tplVersion}
                    onChange={(e) => setTplVersion(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Duration (Months) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={tplDuration}
                    onChange={(e) => setTplDuration(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Introduction / Overview *
                </label>
                <textarea
                  required
                  rows={3}
                  value={tplIntro}
                  onChange={(e) => setTplIntro(e.target.value)}
                  placeholder="The International Commission for Equity and Peace (ICEP)..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  General Responsibilities (One per line) *
                </label>
                <textarea
                  required
                  rows={3}
                  value={tplGeneralResp}
                  onChange={(e) => setTplGeneralResp(e.target.value)}
                  placeholder="Attend meetings whenever possible\nComplete assigned tasks"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Terms and Conditions *
                </label>
                <textarea
                  required
                  rows={3}
                  value={tplTerms}
                  onChange={(e) => setTplTerms(e.target.value)}
                  placeholder="This agreement signifies my good-faith commitment..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowTemplateModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingTpl}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  {creatingTpl ? "Creating..." : "Publish Template"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}