"use client";

import React, { useEffect, useState, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { canManageOrganization } from "@/lib/permissions";
import {
  fetchAgreementTemplates,
  fetchAgreements,
  createAgreementTemplate,
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
} from "lucide-react";

const AGREEMENT_STATUS_BADGES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  pending_approval: "bg-amber-50 text-amber-700 border-amber-200",
  needs_correction: "bg-orange-50 text-orange-700 border-orange-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  expired: "bg-red-50 text-red-700 border-red-200",
};

export default function ContractsPage() {
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<AgreementTemplate[]>([]);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  // Member Document Form / Preview State
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
    "approved" | "needs_correction" | "rejected"
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
        fetchAgreements({ uid: profile.uid, role: profile.role }),
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
      loadData();
    }
  }, [profile]);

  const isAdminOrExec = canManageOrganization(profile);

  const getUserName = (uid: string) => {
    return users.find((u) => u.uid === uid)?.fullName || "Unknown Member";
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
            "As an active member of the International Commission for Equity and Peace (ICEP), my role is to contribute my expertise, ideas, and effort to support Working Group strategic goals. Working Group members are responsible for fulfilling commitments they voluntarily undertake in pursuit of peace, equity, and organizational impact.",
          generalResponsibilities: [
            "Attend meetings whenever possible and actively engage in collaborative sessions.",
            "Complete assigned tasks diligently and in accordance with agreed timelines.",
            "Share expertise and resources to empower fellow members and advance objectives.",
            "Participate respectfully in discussions, fostering inclusivity and dialogue.",
            "Communicate progress and challenges transparently to Working Group Chairs.",
            "Support collaborative decision-making and maintain organizational confidentiality.",
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
    } finally {
      setCreatingTpl(false);
    }
  };

  const handleOpenAgreementForm = async (templateId: string) => {
    if (!profile) return;
    try {
      const agreementId = await getOrCreateMemberAgreement(profile.uid, templateId);
      await loadData();

      const [tpls, agrs] = await Promise.all([
        fetchAgreementTemplates(),
        fetchAgreements({ uid: profile.uid, role: profile.role }),
      ]);
      setTemplates(tpls || []);
      setAgreements(agrs || []);

      const agr = agrs.find((a) => a.id === agreementId);
      const tpl = tpls.find((t) => t.id === templateId);

      if (agr && tpl) {
        setActiveSigningAgreement(agr);
        setActiveTemplate(tpl);
        setTypedLegalName(
          agr.signature?.typedLegalName || profile.fullName || ""
        );
        setCommittedHours(agr.availability?.hoursPerWeek || 4);
        setAvailabilityDays(agr.availability?.days || []);
        setPreferredHours(agr.availability?.preferredHours || "Flexible");
        setGeneralResp(agr.responsibilitiesSnapshot?.general || []);
        setWgResp(agr.responsibilitiesSnapshot?.workingGroup || []);
        setStResp(agr.responsibilitiesSnapshot?.subTeam || []);
      }
    } catch (error) {
      console.error("Failed to initialize agreement:", error);
    }
  };

  // Canvas Handlers
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
    const x =
      "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y =
      "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
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
    const x =
      "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y =
      "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
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
        },
        profile.uid
      );
      await loadData();
      alert("Draft saved successfully!");
    } catch (err) {
      console.error("Failed to save draft:", err);
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

    const canvas = canvasRef.current;
    let drawnSignatureDataUrl = activeSigningAgreement.signature?.drawnSignatureDataUrl || null;
    if (canvas && hasDrawn) {
      drawnSignatureDataUrl = canvas.toDataURL("image/png");
    }

    setSubmittingAction(true);
    try {
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
          typedLegalName: typedLegalName.trim(),
          drawnSignatureDataUrl,
        },
        profile.uid
      );

      setActiveSigningAgreement(null);
      setActiveTemplate(null);
      await loadData();
    } catch (error) {
      console.error("Failed to submit agreement:", error);
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
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">
              Contracts & Agreements Hub
            </h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              {isAdminOrExec ? "Admin Mode" : "Member Portal"}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Membership commitment agreements, three-tier responsibility mapping, and e-signatures.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            title="Refresh Data"
            className="p-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>

          {isAdminOrExec && (
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
      {!isAdminOrExec && (
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
                  (a) => a.templateId === tpl.id
                );
                const status = existingAgr ? existingAgr.status : "not_started";

                return (
                  <div
                    key={tpl.id}
                    className="p-5 rounded-lg border border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2.5">
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

                    <div>
                      {status === "active" ? (
                        <div className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-medium">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Agreement Active</span>
                        </div>
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
      {isAdminOrExec && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-indigo-600" />
                  <span>Agreement Templates ({templates.length})</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Published commitment and policy templates for organizational members.
                </p>
              </div>

              {templates.length === 0 && (
                <button
                  onClick={seedSampleTemplate}
                  disabled={creatingTpl}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg border border-emerald-200 transition-colors cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{creatingTpl ? "Publishing..." : "Quick Publish Sample Template"}</span>
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
                  <div key={t.id} className="p-3.5 rounded-lg border border-slate-200 bg-slate-50">
                    <div className="font-semibold text-sm text-slate-900">{t.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">Version {t.version} • {t.defaultDurationMonths || 12} Months</div>
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
                  Review and approve member commitments and signed agreements.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Loading agreements...
              </div>
            ) : agreements.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">
                No member agreements submitted yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-4">Member</th>
                      <th className="py-3 px-4">Working Group</th>
                      <th className="py-3 px-4">Committed Hours</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Submitted At</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {agreements.map((agr) => {
                      const memberName = getUserName(agr.userId);
                      const submittedDate = agr.submittedAt?.toDate
                        ? agr.submittedAt.toDate().toLocaleDateString()
                        : "Draft / Pending";

                      return (
                        <tr
                          key={agr.id}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="py-3.5 px-4 font-semibold text-slate-900">
                            {memberName}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600">
                            {agr.memberSnapshot?.workingGroupName || "Unassigned"}
                          </td>
                          <td className="py-3.5 px-4 text-slate-700">
                            {agr.availability?.hoursPerWeek || 4} hrs/week
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize ${
                                AGREEMENT_STATUS_BADGES[agr.status] ||
                                "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {agr.status.replace("_", " ")}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-500">
                            {submittedDate}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => {
                                setReviewingAgreement(agr);
                                setReviewDecision("approved");
                                setAdminFeedback(
                                  agr.review?.adminFeedback || ""
                                );
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                            >
                              <FileSignature className="h-3.5 w-3.5" />
                              <span>Review</span>
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

      {/* PROFESSIONAL DOCUMENT PREVIEW & SIGNING MODAL */}
      {activeSigningAgreement && activeTemplate && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-8 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-6">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Official Executive Document Preview
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
                  <span>Print Document</span>
                </button>
                <button
                  onClick={() => setActiveSigningAgreement(null)}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            <div className="space-y-6 text-slate-800 text-sm leading-relaxed">
              <div className="p-5 bg-slate-50 rounded-xl border border-slate-200">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  1. Introduction & Mandate
                </h4>
                <p className="text-slate-700">
                  {activeTemplate.introductionText}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-white rounded-xl border border-slate-200">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Member Information
                  </h4>
                  <div className="space-y-1 text-xs">
                    <div>
                      <span className="text-slate-500">Full Name:</span>{" "}
                      <strong className="text-slate-900">
                        {activeSigningAgreement.memberSnapshot.fullName}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Email:</span>{" "}
                      <strong className="text-slate-900">
                        {activeSigningAgreement.memberSnapshot.email}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Country:</span>{" "}
                      <strong className="text-slate-900">
                        {activeSigningAgreement.memberSnapshot.country}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-white rounded-xl border border-slate-200">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Organizational Appointment
                  </h4>
                  <div className="space-y-1 text-xs">
                    <div>
                      <span className="text-slate-500">Position:</span>{" "}
                      <strong className="text-slate-900">
                        {activeSigningAgreement.memberSnapshot.positionTitle}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Working Group:</span>{" "}
                      <strong className="text-slate-900">
                        {activeSigningAgreement.memberSnapshot.workingGroupName}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Sub-Team:</span>{" "}
                      <strong className="text-slate-900">
                        {activeSigningAgreement.memberSnapshot.subTeamName}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Three-Tier Responsibilities Hierarchy */}
              <div className="p-5 bg-white rounded-xl border border-slate-200 space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  2. Aggregated Organizational Responsibilities
                </h4>

                <div>
                  <h5 className="text-xs font-bold text-slate-900 mb-1.5">
                    A. General ICEP Commitments
                  </h5>
                  <ul className="list-disc pl-5 space-y-1 text-xs text-slate-700">
                    {generalResp.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h5 className="text-xs font-bold text-slate-900 mb-1.5">
                    B. Working Group Responsibilities ({activeSigningAgreement.memberSnapshot.workingGroupName})
                  </h5>
                  {wgResp.length > 0 ? (
                    <ul className="list-disc pl-5 space-y-1 text-xs text-slate-700">
                      {wgResp.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-400 italic">
                      No specific working group default responsibilities assigned.
                    </p>
                  )}
                </div>

                <div>
                  <h5 className="text-xs font-bold text-slate-900 mb-1.5">
                    C. Sub-Team Responsibilities ({activeSigningAgreement.memberSnapshot.subTeamName})
                  </h5>
                  {stResp.length > 0 ? (
                    <ul className="list-disc pl-5 space-y-1 text-xs text-slate-700">
                      {stResp.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-400 italic">
                      No sub-team assigned.
                    </p>
                  )}
                </div>
              </div>

              <div className="p-5 bg-white rounded-xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  3. Time Commitment & Availability
                </h4>
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
                      Preferred Time Window
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
              </div>

              <div className="p-5 bg-slate-50 rounded-xl border border-slate-200">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  4. Terms and Conditions
                </h4>
                <p className="text-xs text-slate-700 whitespace-pre-wrap">
                  {activeTemplate.termsAndConditions}
                </p>
              </div>

              <form onSubmit={handleSignAndSubmit} id="signingForm" className="p-6 bg-white rounded-xl border-2 border-slate-900 space-y-4">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <PenTool className="h-4 w-4" />
                  <span>Section 5: Execution & Electronic Signature</span>
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
                      className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
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

                <div className="pt-4 flex flex-wrap items-center justify-end gap-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={submittingAction}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg cursor-pointer"
                  >
                    <Save className="h-4 w-4" />
                    <span>Save Draft & Return Later</span>
                  </button>

                  <button
                    type="submit"
                    disabled={submittingAction}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg cursor-pointer disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    <span>{submittingAction ? "Submitting..." : "Sign & Submit Agreement"}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN REVIEW MODAL */}
      {reviewingAgreement && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Review Agreement
                </h2>
                <p className="text-xs text-slate-500">
                  Member: {getUserName(reviewingAgreement.userId)}
                </p>
              </div>
              <button
                onClick={() => setReviewingAgreement(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleReviewSubmit} className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1">
                <div>
                  <span className="text-slate-500">Committed Hours:</span>{" "}
                  <strong>
                    {reviewingAgreement.availability?.hoursPerWeek} hrs/week
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Signer:</span>{" "}
                  <strong>
                    {reviewingAgreement.signature?.typedLegalName || "Not signed yet"}
                  </strong>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Decision *
                </label>
                <select
                  value={reviewDecision}
                  onChange={(e) =>
                    setReviewDecision(
                      e.target.value as
                        | "approved"
                        | "needs_correction"
                        | "rejected"
                    )
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="approved">Approve & Activate Membership</option>
                  <option value="needs_correction">Return for Corrections</option>
                  <option value="rejected">Reject Agreement</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Feedback / Revision Notes for Member
                </label>
                <textarea
                  rows={3}
                  value={adminFeedback}
                  onChange={(e) => setAdminFeedback(e.target.value)}
                  placeholder="Provide feedback if corrections are needed..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
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
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  {submittingReview ? "Submitting..." : "Confirm Review"}
                </button>
              </div>
            </form>
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
                  placeholder="As an active member of an ICEP Working Group..."
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
                  placeholder={
                    "Attend meetings whenever possible\nComplete assigned tasks"
                  }
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