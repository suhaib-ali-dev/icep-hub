"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  canManageOrganization,
  canManageSubTeams,
} from "@/lib/permissions";
import {
  fetchWorkingGroups,
  fetchSubTeams,
  fetchAllUsers,
  createWorkingGroup,
  createSubTeam,
  updateWorkingGroup,
  deleteWorkingGroup,
  updateSubTeam,
  deleteSubTeam,
} from "@/lib/orgService";
import { WorkingGroup, SubTeam, UserProfile } from "@/types";
import {
  Network,
  Plus,
  Users,
  UserCheck,
  ListChecks,
  Layers,
  X,
  Pencil,
  Trash2,
  Eye,
  Search,
} from "lucide-react";

export default function WorkingGroupsPage() {
  const { profile } = useAuth();
  const [workingGroups, setWorkingGroups] = useState<WorkingGroup[]>([]);
  const [subTeams, setSubTeams] = useState<SubTeam[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [feedbackMsg, setFeedbackMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Detail modal (hidden full mission & responsibilities view)
  const [detailWg, setDetailWg] = useState<WorkingGroup | null>(null);

  // Working Group Create/Edit Modal
  const [showWgModal, setShowWgModal] = useState(false);
  const [editingWg, setEditingWg] = useState<WorkingGroup | null>(null);
  const [wgName, setWgName] = useState("");
  const [wgDescription, setWgDescription] = useState("");
  const [wgMission, setWgMission] = useState("");
  const [wgChairId, setWgChairId] = useState("");
  const [wgIsActive, setWgIsActive] = useState(true);
  const [wgResponsibilitiesText, setWgResponsibilitiesText] = useState("");

  // Sub-Team Create/Edit Modal
  const [selectedWgForSubTeam, setSelectedWgForSubTeam] =
    useState<WorkingGroup | null>(null);
  const [editingSubTeam, setEditingSubTeam] = useState<SubTeam | null>(null);
  const [stName, setStName] = useState("");
  const [stDescription, setStDescription] = useState("");
  const [stLeaderId, setStLeaderId] = useState("");
  const [stIsActive, setStIsActive] = useState(true);
  const [stResponsibilitiesText, setStResponsibilitiesText] = useState("");

  // Delete confirmation modal state
  const [confirmDelete, setConfirmDelete] = useState<
    | { kind: "wg"; item: WorkingGroup }
    | { kind: "st"; item: SubTeam }
    | null
  >(null);

  const [submitting, setSubmitting] = useState(false);

  const isAdminOrExec = canManageOrganization(profile);

  const loadData = async () => {
    setLoading(true);
    try {
      const [wgData, stData, userData] = await Promise.all([
        fetchWorkingGroups(),
        fetchSubTeams(),
        fetchAllUsers(),
      ]);
      setWorkingGroups(wgData);
      setSubTeams(stData);
      setUsers(userData);
    } catch (error) {
      console.error("Error loading working groups:", error);
      setFeedbackMsg({
        type: "error",
        text: "Failed to load working groups from database.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getUser = (uid: string | null) =>
    uid ? users.find((u) => u.uid === uid) || null : null;

  const getUserName = (uid: string | null) => {
    if (!uid) return "Unassigned";
    const found = getUser(uid);
    return found ? found.fullName : "Unknown Member";
  };

  const openCreateWgModal = () => {
    setEditingWg(null);
    setWgName("");
    setWgDescription("");
    setWgMission("");
    setWgChairId("");
    setWgIsActive(true);
    setWgResponsibilitiesText("");
    setShowWgModal(true);
  };

  const openEditWgModal = (wg: WorkingGroup) => {
    setEditingWg(wg);
    setWgName(wg.name || "");
    setWgDescription(wg.description || "");
    setWgMission(wg.missionAndObjectives || "");
    setWgChairId(wg.chairId || "");
    setWgIsActive(wg.isActive ?? true);
    setWgResponsibilitiesText((wg.defaultResponsibilities || []).join("\n"));
    setShowWgModal(true);
  };

  const handleSaveWorkingGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSubmitting(true);
    setFeedbackMsg(null);

    try {
      const responsibilities = wgResponsibilitiesText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      const payload = {
        name: wgName.trim(),
        description: wgDescription.trim(),
        missionAndObjectives: wgMission.trim(),
        chairId: wgChairId || null,
        isActive: wgIsActive,
        defaultResponsibilities: responsibilities,
      };

      if (editingWg) {
  await updateWorkingGroup(editingWg.id, payload, {
    uid: profile.uid,
    role: profile.role,
  });
  setFeedbackMsg({
    type: "success",
    text: `Updated "${payload.name}".`,
  });
} else {
  const { isActive: _ignoredIsActive, ...createPayload } = payload;
  const created: unknown = await createWorkingGroup(createPayload, {
    uid: profile.uid,
    role: profile.role,
  });

  const createdId =
    typeof created === "string"
      ? created
      : typeof created === "object" &&
        created !== null &&
        "id" in created &&
        typeof (created as { id?: unknown }).id === "string"
      ? (created as { id: string }).id
      : "";

  if (!wgIsActive && createdId) {
    await updateWorkingGroup(
      createdId,
      { isActive: false },
      { uid: profile.uid, role: profile.role }
    );
  }

  setFeedbackMsg({
    type: "success",
    text: `Created working group "${payload.name}".`,
  });
}

      setShowWgModal(false);
      setEditingWg(null);
      await loadData();
    } catch (error) {
      console.error("Failed to save working group:", error);
      setFeedbackMsg({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to save working group.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const openCreateSubTeamModal = (wg: WorkingGroup) => {
    setSelectedWgForSubTeam(wg);
    setEditingSubTeam(null);
    setStName("");
    setStDescription("");
    setStLeaderId("");
    setStIsActive(true);
    setStResponsibilitiesText("");
  };

  const openEditSubTeamModal = (wg: WorkingGroup, st: SubTeam) => {
    setSelectedWgForSubTeam(wg);
    setEditingSubTeam(st);
    setStName(st.name || "");
    setStDescription(st.description || "");
    setStLeaderId(st.leaderId || "");
    setStIsActive(st.isActive ?? true);
    setStResponsibilitiesText((st.defaultResponsibilities || []).join("\n"));
  };

  const handleSaveSubTeam = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!profile || !selectedWgForSubTeam) return;
  setSubmitting(true);
  setFeedbackMsg(null);

  try {
    const responsibilities = stResponsibilitiesText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (editingSubTeam) {
      await updateSubTeam(
        editingSubTeam.id,
        {
          name: stName.trim(),
          description: stDescription.trim(),
          leaderId: stLeaderId || null,
          isActive: stIsActive,
          defaultResponsibilities: responsibilities,
        },
        { uid: profile.uid, role: profile.role }
      );
      setFeedbackMsg({
        type: "success",
        text: `Updated sub-team "${stName.trim()}".`,
      });
    } else {
      const created: unknown = await createSubTeam(
        {
          workingGroupId: selectedWgForSubTeam.id,
          name: stName.trim(),
          description: stDescription.trim(),
          leaderId: stLeaderId || null,
          defaultResponsibilities: responsibilities,
        },
        { uid: profile.uid, role: profile.role }
      );

      const createdId =
        typeof created === "string"
          ? created
          : typeof created === "object" &&
            created !== null &&
            "id" in created &&
            typeof (created as { id?: unknown }).id === "string"
          ? (created as { id: string }).id
          : "";

      if (!stIsActive && createdId) {
        await updateSubTeam(
          createdId,
          { isActive: false },
          { uid: profile.uid, role: profile.role }
        );
      }

      setFeedbackMsg({
        type: "success",
        text: `Added sub-team "${stName.trim()}" to ${selectedWgForSubTeam.name}.`,
      });
    }

    setSelectedWgForSubTeam(null);
    setEditingSubTeam(null);
    await loadData();
  } catch (error) {
    console.error("Failed to save sub-team:", error);
    setFeedbackMsg({
      type: "error",
      text:
        error instanceof Error ? error.message : "Failed to save sub-team.",
    });
  } finally {
    setSubmitting(false);
  }
};

  const handleConfirmDelete = async () => {
    if (!profile || !confirmDelete) return;
    setSubmitting(true);
    setFeedbackMsg(null);

    try {
      if (confirmDelete.kind === "wg") {
        const target = confirmDelete.item;
        await deleteWorkingGroup(target.id, {
          uid: profile.uid,
          role: profile.role,
        });
        if (detailWg?.id === target.id) setDetailWg(null);
        setFeedbackMsg({
          type: "success",
          text: `Deleted working group "${target.name}".`,
        });
      } else {
        const target = confirmDelete.item;
        await deleteSubTeam(target.id, {
          uid: profile.uid,
          role: profile.role,
        });
        setFeedbackMsg({
          type: "success",
          text: `Deleted sub-team "${target.name}".`,
        });
      }

      setConfirmDelete(null);
      await loadData();
    } catch (error) {
      console.error("Failed to delete item:", error);
      setFeedbackMsg({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to delete item.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredWorkingGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return workingGroups;
    return workingGroups.filter((wg) => {
      const chairName = getUserName(wg.chairId).toLowerCase();
      const matchingSubTeam = subTeams.some(
        (st) =>
          st.workingGroupId === wg.id &&
          (st.name.toLowerCase().includes(q) ||
            st.description?.toLowerCase().includes(q))
      );
      return (
        wg.name.toLowerCase().includes(q) ||
        wg.description?.toLowerCase().includes(q) ||
        chairName.includes(q) ||
        matchingSubTeam
      );
    });
  }, [workingGroups, subTeams, users, searchQuery]);

  const activeDetailWg = useMemo(() => {
    if (!detailWg) return null;
    return workingGroups.find((w) => w.id === detailWg.id) || detailWg;
  }, [detailWg, workingGroups]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Working Groups</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage working groups, leadership chairs, and sub-teams. Click any group to inspect mission & responsibilities.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search groups, chairs, sub-teams..."
              className="pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#004aad]/20"
            />
          </div>

          {isAdminOrExec && (
            <button
              onClick={openCreateWgModal}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#004aad] hover:bg-[#003882] text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>New Working Group</span>
            </button>
          )}
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackMsg && (
        <div
          className={`px-4 py-3 rounded-lg border text-sm flex items-center justify-between ${
            feedbackMsg.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <span>{feedbackMsg.text}</span>
          <button
            onClick={() => setFeedbackMsg(null)}
            className="text-xs underline ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Compact Directory Cards */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-sm text-slate-500">
          Loading ICEP working groups...
        </div>
      ) : filteredWorkingGroups.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Network className="h-10 w-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-900">
            {searchQuery ? "No Matching Working Groups" : "No Working Groups Created Yet"}
          </h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            {searchQuery
              ? "Try clearing or adjusting your search query."
              : "Create your first ICEP Working Group to assign chairs and organize sub-teams."}
          </p>
          {isAdminOrExec && !searchQuery && (
            <button
              onClick={openCreateWgModal}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-[#004aad] text-white text-sm font-medium rounded-lg hover:bg-[#003882] cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Create First Working Group</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredWorkingGroups.map((wg) => {
            const wgSubTeams = subTeams.filter(
              (st) => st.workingGroupId === wg.id
            );
            const memberCount = users.filter(
              (u) => u.workingGroupId === wg.id
            ).length;
            const canAddSubTeam =
              isAdminOrExec ||
              (canManageSubTeams(profile) && wg.chairId === profile?.uid);

            return (
              <div
                key={wg.id}
                onClick={() => setDetailWg(wg)}
                className="bg-white rounded-xl border border-slate-200 hover:border-[#004aad]/50 hover:shadow-sm transition p-5 flex flex-col justify-between gap-4 cursor-pointer"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-bold text-slate-900">
                        {wg.name}
                      </h2>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                          wg.isActive
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                      >
                        {wg.isActive ? "Active" : "Archived"}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetailWg(wg);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#004aad] hover:underline shrink-0 cursor-pointer"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Details</span>
                    </button>
                  </div>

                  <p className="text-xs text-slate-600 mt-1.5 line-clamp-2">
                    {wg.description || "No short description provided."}
                  </p>

                  {/* Compact Metadata Strip */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <UserCheck className="h-3.5 w-3.5 text-slate-400" />
                      Chair: <strong className="text-slate-800">{getUserName(wg.chairId)}</strong>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-slate-400" />
                      <strong className="text-slate-800">{memberCount}</strong> members
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5 text-slate-400" />
                      <strong className="text-slate-800">{wgSubTeams.length}</strong> sub-teams
                    </span>
                  </div>
                </div>

                {/* Action Bar */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap"
                >
                  <div className="flex items-center gap-1.5">
                    {isAdminOrExec && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditWgModal(wg)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDelete({ kind: "wg", item: wg })
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete</span>
                        </button>
                      </>
                    )}
                  </div>

                  {canAddSubTeam && (
                    <button
                      type="button"
                      onClick={() => openCreateSubTeamModal(wg)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add Sub-Team</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 0: WORKING GROUP FULL DETAILS (HIDDEN UNTIL CLICKED) */}
{activeDetailWg && (
  <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl max-w-2xl w-full p-6 sm:p-7 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-6">
      {/* Modal Header */}
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              {activeDetailWg.name}
            </h2>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                activeDetailWg.isActive
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-slate-100 text-slate-600 border border-slate-200"
              }`}
            >
              {activeDetailWg.isActive ? "Active" : "Archived"}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            ICEP Working Group Charter & Structure
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDetailWg(null)}
          aria-label="Close modal"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Leadership & Membership Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-slate-50 p-4 rounded-xl border border-slate-200/80 text-xs">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
            Assigned Chair
          </span>
          <strong className="text-sm font-semibold text-slate-900 mt-0.5 block">
            {getUserName(activeDetailWg.chairId)}
          </strong>
          {getUser(activeDetailWg.chairId)?.email && (
            <span className="text-slate-500 block mt-0.5">
              {getUser(activeDetailWg.chairId)?.email}
            </span>
          )}
        </div>
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
            Assigned Members
          </span>
          <strong className="text-sm font-semibold text-slate-900 mt-0.5 block">
            {users.filter((u) => u.workingGroupId === activeDetailWg.id).length}{" "}
            members
          </strong>
        </div>
      </div>

      {/* Vertically Stacked Sections: 1. Mission & Objectives -> 2. Purpose -> 3. Default Member Responsibilities */}
      <div className="space-y-4">
        {/* Section 1: Mission & Objectives */}
        <section className="rounded-xl border border-blue-100 bg-blue-50/35 p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="h-2 w-2 rounded-full bg-[#004aad]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#004aad]">
              1. Mission & Objectives
            </h3>
          </div>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
            {activeDetailWg.missionAndObjectives ||
              "No mission and objectives statement has been added for this working group yet."}
          </p>
        </section>

        {/* Section 2: Purpose
        <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="h-2 w-2 rounded-full bg-slate-700" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              2. Purpose
            </h3>
          </div>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
            {activeDetailWg.description ||
              "No purpose summary has been added for this working group yet."}
          </p>
        </section> */}

        {/* Section 3: Default Member Responsibilities */}
        <section className="rounded-xl border border-emerald-200/80 bg-emerald-50/30 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
              <ListChecks className="h-4 w-4 text-emerald-700" />
              <span>2. Default Member Responsibilities</span>
            </h3>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-white border border-emerald-200 text-emerald-700">
              {activeDetailWg.defaultResponsibilities?.length || 0} items
            </span>
          </div>

          {activeDetailWg.defaultResponsibilities?.length > 0 ? (
            <ul className="space-y-2 text-sm text-slate-700">
              {activeDetailWg.defaultResponsibilities.map((resp, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 rounded-lg bg-white/90 border border-emerald-100 px-3.5 py-2.5"
                >
                  <span className="text-xs font-bold text-emerald-700 mt-0.5 shrink-0">
                    {i + 1}.
                  </span>
                  <span className="leading-relaxed">{resp}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400 italic">
              No default member responsibilities defined.
            </p>
          )}
        </section>
      </div>

      {/* Sub-Teams Section (Scrollable below the 3 core charter blocks) */}
      <section className="pt-4 border-t border-slate-200 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-slate-500" />
            <span>
              Sub-Teams (
              {
                subTeams.filter((st) => st.workingGroupId === activeDetailWg.id)
                  .length
              }
              )
            </span>
          </h3>

          {(isAdminOrExec ||
            (canManageSubTeams(profile) &&
              activeDetailWg.chairId === profile?.uid)) && (
            <button
              type="button"
              onClick={() => openCreateSubTeamModal(activeDetailWg)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#004aad] bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Sub-Team</span>
            </button>
          )}
        </div>

        {subTeams.filter((st) => st.workingGroupId === activeDetailWg.id)
          .length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
            No sub-teams under this working group yet.
          </div>
        ) : (
          <div className="space-y-2.5">
            {subTeams
              .filter((st) => st.workingGroupId === activeDetailWg.id)
              .map((st) => (
                <div
                  key={st.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-slate-900">
                        {st.name}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                        {st.defaultResponsibilities?.length || 0} duties
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {st.description || "No description provided."}
                    </p>
                    <p className="text-xs text-slate-600 pt-1">
                      Team Lead:{" "}
                      <strong className="text-slate-800">
                        {getUserName(st.leaderId)}
                      </strong>
                    </p>
                  </div>

                  {(isAdminOrExec ||
                    (canManageSubTeams(profile) &&
                      activeDetailWg.chairId === profile?.uid)) && (
                    <div className="flex items-center gap-2 shrink-0 sm:pt-0.5">
                      <button
                        type="button"
                        onClick={() => openEditSubTeamModal(activeDetailWg, st)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                      >
                        <Pencil className="h-3 w-3" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmDelete({ kind: "st", item: st })
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-rose-200 text-xs font-medium text-rose-600 hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Delete</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}
      </section>

      {/* Modal Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200 sticky bottom-0 bg-white">
        {isAdminOrExec ? (
          <button
            type="button"
            onClick={() => {
              const target = activeDetailWg;
              setDetailWg(null);
              openEditWgModal(target);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg transition cursor-pointer"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span>Edit Working Group / Chair</span>
          </button>
        ) : (
          <div />
        )}
        <button
          type="button"
          onClick={() => setDetailWg(null)}
          className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}

      {/* MODAL 1: CREATE / EDIT WORKING GROUP */}
      {showWgModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">
                {editingWg ? "Edit Working Group" : "Create Working Group"}
              </h2>
              <button
                onClick={() => {
                  setShowWgModal(false);
                  setEditingWg(null);
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveWorkingGroup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Working Group Name *
                </label>
                <input
                  type="text"
                  required
                  value={wgName}
                  onChange={(e) => setWgName(e.target.value)}
                  placeholder="e.g., Peacebuilding & Mediation"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Short Description *
                </label>
                <input
                  type="text"
                  required
                  value={wgDescription}
                  onChange={(e) => setWgDescription(e.target.value)}
                  placeholder="Brief summary of the group's focus"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Mission & Objectives *
                </label>
                <textarea
                  required
                  rows={3}
                  value={wgMission}
                  onChange={(e) => setWgMission(e.target.value)}
                  placeholder="Core strategic goals and mandate of this working group..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Working Group Chair
                  </label>
                  <select
                    value={wgChairId}
                    onChange={(e) => setWgChairId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="">-- Unassigned / Assign Later --</option>
                    {users.map((u) => (
                      <option key={u.uid} value={u.uid}>
                        {u.fullName} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Status
                  </label>
                  <select
                    value={wgIsActive ? "active" : "archived"}
                    onChange={(e) => setWgIsActive(e.target.value === "active")}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Default Member Responsibilities (One per line)
                </label>
                <textarea
                  rows={4}
                  value={wgResponsibilitiesText}
                  onChange={(e) => setWgResponsibilitiesText(e.target.value)}
                  placeholder={
                    "Attend bi-weekly working group meetings\nContribute to quarterly policy briefs\nSubmit monthly progress updates"
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowWgModal(false);
                    setEditingWg(null);
                  }}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-[#004aad] hover:bg-[#003882] text-white text-sm font-medium rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  {submitting
                    ? "Saving..."
                    : editingWg
                    ? "Save Changes"
                    : "Create Working Group"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CREATE / EDIT SUB-TEAM */}
      {selectedWgForSubTeam && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {editingSubTeam ? "Edit Sub-Team" : "Add Sub-Team"}
                </h2>
                <p className="text-xs text-slate-500">
                  Under {selectedWgForSubTeam.name}
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedWgForSubTeam(null);
                  setEditingSubTeam(null);
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSubTeam} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Sub-Team Name *
                </label>
                <input
                  type="text"
                  required
                  value={stName}
                  onChange={(e) => setStName(e.target.value)}
                  placeholder="e.g., Regional Dialogue Unit"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Description *
                </label>
                <textarea
                  required
                  rows={2}
                  value={stDescription}
                  onChange={(e) => setStDescription(e.target.value)}
                  placeholder="Specific focus area and scope of this sub-team..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Team Leader
                  </label>
                  <select
                    value={stLeaderId}
                    onChange={(e) => setStLeaderId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="">-- Unassigned / Assign Later --</option>
                    {users.map((u) => (
                      <option key={u.uid} value={u.uid}>
                        {u.fullName} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Status
                  </label>
                  <select
                    value={stIsActive ? "active" : "archived"}
                    onChange={(e) => setStIsActive(e.target.value === "active")}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Sub-Team Default Responsibilities (One per line)
                </label>
                <textarea
                  rows={3}
                  value={stResponsibilitiesText}
                  onChange={(e) => setStResponsibilitiesText(e.target.value)}
                  placeholder={
                    "Coordinate stakeholder outreach\nDraft monthly field summaries"
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedWgForSubTeam(null);
                    setEditingSubTeam(null);
                  }}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-[#004aad] hover:bg-[#003882] text-white text-sm font-medium rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  {submitting
                    ? "Saving..."
                    : editingSubTeam
                    ? "Save Sub-Team"
                    : "Add Sub-Team"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: DELETE CONFIRMATION */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-bold text-slate-900">
              Delete {confirmDelete.kind === "wg" ? "Working Group" : "Sub-Team"}?
            </h2>
            <p className="text-sm text-slate-600">
              Are you sure you want to permanently delete{" "}
              <strong className="text-slate-900">
                {confirmDelete.item.name}
              </strong>
              ? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 cursor-pointer"
              >
                {submitting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}