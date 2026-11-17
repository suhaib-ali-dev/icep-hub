"use client";

import React, { useEffect, useState } from "react";
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
} from "lucide-react";

export default function WorkingGroupsPage() {
  const { profile } = useAuth();
  const [workingGroups, setWorkingGroups] = useState<WorkingGroup[]>([]);
  const [subTeams, setSubTeams] = useState<SubTeam[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showWgModal, setShowWgModal] = useState(false);
  const [selectedWgForSubTeam, setSelectedWgForSubTeam] =
    useState<WorkingGroup | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Working Group Form State
  const [wgName, setWgName] = useState("");
  const [wgDescription, setWgDescription] = useState("");
  const [wgMission, setWgMission] = useState("");
  const [wgChairId, setWgChairId] = useState("");
  const [wgResponsibilitiesText, setWgResponsibilitiesText] = useState("");

  // Sub-Team Form State
  const [stName, setStName] = useState("");
  const [stDescription, setStDescription] = useState("");
  const [stLeaderId, setStLeaderId] = useState("");
  const [stResponsibilitiesText, setStResponsibilitiesText] = useState("");

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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getUserName = (uid: string | null) => {
    if (!uid) return "Unassigned";
    const found = users.find((u) => u.uid === uid);
    return found ? found.fullName : "Unknown Member";
  };

  const handleCreateWorkingGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSubmitting(true);

    try {
      const responsibilities = wgResponsibilitiesText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      await createWorkingGroup(
        {
          name: wgName.trim(),
          description: wgDescription.trim(),
          missionAndObjectives: wgMission.trim(),
          chairId: wgChairId || null,
          defaultResponsibilities: responsibilities,
        },
        { uid: profile.uid, role: profile.role }
      );

      // Reset & reload
      setWgName("");
      setWgDescription("");
      setWgMission("");
      setWgChairId("");
      setWgResponsibilitiesText("");
      setShowWgModal(false);
      await loadData();
    } catch (error) {
      console.error("Failed to create working group:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateSubTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !selectedWgForSubTeam) return;
    setSubmitting(true);

    try {
      const responsibilities = stResponsibilitiesText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      await createSubTeam(
        {
          workingGroupId: selectedWgForSubTeam.id,
          name: stName.trim(),
          description: stDescription.trim(),
          leaderId: stLeaderId || null,
          defaultResponsibilities: responsibilities,
        },
        { uid: profile.uid, role: profile.role }
      );

      // Reset & reload
      setStName("");
      setStDescription("");
      setStLeaderId("");
      setStResponsibilitiesText("");
      setSelectedWgForSubTeam(null);
      await loadData();
    } catch (error) {
      console.error("Failed to create sub-team:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const isAdminOrExec = canManageOrganization(profile);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Working Groups</h1>
          <p className="text-sm text-slate-500 mt-1">
            Organizational structure, sub-teams, and default agreement responsibilities.
          </p>
        </div>

        {isAdminOrExec && (
          <button
            onClick={() => setShowWgModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>New Working Group</span>
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-sm text-slate-500">
          Loading ICEP working groups...
        </div>
      ) : workingGroups.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Network className="h-10 w-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-900">
            No Working Groups Created Yet
          </h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            Create your first ICEP Working Group (e.g., Policy & Research, Peacebuilding Operations, Youth Engagement) to start placing members.
          </p>
          {isAdminOrExec && (
            <button
              onClick={() => setShowWgModal(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Create First Working Group</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {workingGroups.map((wg) => {
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
                className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
              >
                {/* Working Group Top Banner */}
                <div className="p-6 border-b border-slate-100">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-lg font-bold text-slate-900">
                          {wg.name}
                        </h2>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            wg.isActive
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {wg.isActive ? "Active" : "Archived"}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 mt-1">
                        {wg.description}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 bg-slate-50 px-3.5 py-2.5 rounded-lg border border-slate-200/60 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="h-4 w-4 text-slate-500" />
                        <span>
                          Chair:{" "}
                          <strong className="text-slate-900">
                            {getUserName(wg.chairId)}
                          </strong>
                        </span>
                      </div>
                      <span className="text-slate-300">|</span>
                      <div className="flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-slate-500" />
                        <span>
                          <strong className="text-slate-900">{memberCount}</strong>{" "}
                          {memberCount === 1 ? "Member" : "Members"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Mission & Default Responsibilities */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-5 pt-5 border-t border-slate-100">
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Mission & Objectives
                      </h4>
                      <p className="text-sm text-slate-700 leading-relaxed">
                        {wg.missionAndObjectives || "No mission statement added."}
                      </p>
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                        <ListChecks className="h-3.5 w-3.5" />
                        <span>Default Member Responsibilities</span>
                      </h4>
                      {wg.defaultResponsibilities?.length > 0 ? (
                        <ul className="space-y-1 text-sm text-slate-700 list-disc pl-4">
                          {wg.defaultResponsibilities.map((resp, i) => (
                            <li key={i}>{resp}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-slate-400 italic">
                          No default responsibilities defined.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sub-Teams Section */}
                <div className="bg-slate-50/70 px-6 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5" />
                      <span>Sub-Teams ({wgSubTeams.length})</span>
                    </h3>

                    {canAddSubTeam && (
                      <button
                        onClick={() => setSelectedWgForSubTeam(wg)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-200 px-2.5 py-1.5 rounded-md shadow-2xs cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Add Sub-Team</span>
                      </button>
                    )}
                  </div>

                  {wgSubTeams.length === 0 ? (
                    <p className="text-xs text-slate-400">
                      No sub-teams under this working group yet.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {wgSubTeams.map((st) => (
                        <div
                          key={st.id}
                          className="bg-white p-4 rounded-lg border border-slate-200"
                        >
                          <div className="font-semibold text-sm text-slate-900">
                            {st.name}
                          </div>
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                            {st.description}
                          </p>
                          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                            <span>
                              Lead:{" "}
                              <strong className="text-slate-800">
                                {getUserName(st.leaderId)}
                              </strong>
                            </span>
                            <span>
                              {st.defaultResponsibilities?.length || 0} duties
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: CREATE WORKING GROUP */}
      {showWgModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">
                Create Working Group
              </h2>
              <button
                onClick={() => setShowWgModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateWorkingGroup} className="space-y-4">
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

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Working Group Chair (Optional)
                </label>
                <select
                  value={wgChairId}
                  onChange={(e) => setWgChairId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="">-- Assign Later --</option>
                  {users.map((u) => (
                    <option key={u.uid} value={u.uid}>
                      {u.fullName} ({u.email})
                    </option>
                  ))}
                </select>
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
                <p className="text-xs text-slate-400 mt-1">
                  These duties automatically populate into Membership Commitment Agreements for members in this group.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowWgModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? "Creating..." : "Create Working Group"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CREATE SUB-TEAM */}
      {selectedWgForSubTeam && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Add Sub-Team
                </h2>
                <p className="text-xs text-slate-500">
                  Under {selectedWgForSubTeam.name}
                </p>
              </div>
              <button
                onClick={() => setSelectedWgForSubTeam(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubTeam} className="space-y-4">
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
                  placeholder="Specific focus area of this sub-team..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Team Leader (Optional)
                </label>
                <select
                  value={stLeaderId}
                  onChange={(e) => setStLeaderId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="">-- Assign Later --</option>
                  {users.map((u) => (
                    <option key={u.uid} value={u.uid}>
                      {u.fullName} ({u.email})
                    </option>
                  ))}
                </select>
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
                  onClick={() => setSelectedWgForSubTeam(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? "Adding..." : "Add Sub-Team"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}