"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { canManageOrganization } from "@/lib/permissions";
import {
  fetchResponsibilities,
  createResponsibility,
  deleteResponsibility,
} from "@/lib/responsibilityService";
import { fetchWorkingGroups, fetchSubTeams } from "@/lib/orgService";
import {
  ResponsibilityItem,
  ResponsibilityScope,
  WorkingGroup,
  SubTeam,
} from "@/types";
import {
  BookOpen,
  Plus,
  Trash2,
  X,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

const SCOPE_BADGES: Record<
  ResponsibilityScope,
  { label: string; className: string }
> = {
  general: {
    label: "General ICEP",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  working_group: {
    label: "Working Group",
    className: "bg-purple-50 text-purple-700 border-purple-200",
  },
  sub_team: {
    label: "Sub-Team",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  leadership: {
    label: "Leadership",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
};

export default function ResponsibilitiesLibraryPage() {
  const { profile } = useAuth();
  const [responsibilities, setResponsibilities] = useState<ResponsibilityItem[]>(
    []
  );
  const [workingGroups, setWorkingGroups] = useState<WorkingGroup[]>([]);
  const [subTeams, setSubTeams] = useState<SubTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modal State & Form Fields
  const [showModal, setShowModal] = useState(false);
  const [scope, setScope] = useState<ResponsibilityScope>("general");
  const [selectedWgId, setSelectedWgId] = useState("");
  const [selectedStId, setSelectedStId] = useState("");
  const [leadershipTitle, setLeadershipTitle] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const [respList, wgList, stList] = await Promise.all([
        fetchResponsibilities(),
        fetchWorkingGroups(),
        fetchSubTeams(),
      ]);
      setResponsibilities(respList || []);
      setWorkingGroups(wgList || []);
      setSubTeams(stList || []);
    } catch (err) {
      console.error("Failed to load responsibility library:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [profile]);

  const isAdminOrExec = canManageOrganization(profile);

  // Filter sub-teams based on selected Working Group ID
  const filteredSubTeams = subTeams.filter(
    (st) => st.workingGroupId === selectedWgId || (st as any).wgId === selectedWgId
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setErrorMsg(null);

    // Frontend validation with explicit messages
    if (scope === "working_group" && !selectedWgId) {
      setErrorMsg("Missing Information: Please choose a Working Group for this responsibility.");
      return;
    }

    if (scope === "sub_team" && (!selectedWgId || !selectedStId)) {
      setErrorMsg("Missing Information: Please choose both a Working Group and a Sub-Team.");
      return;
    }

    if (scope === "leadership" && !leadershipTitle.trim()) {
      setErrorMsg("Missing Information: Please enter a Leadership Position title.");
      return;
    }

    if (!title.trim()) {
      setErrorMsg("Missing Information: Please enter a Responsibility Title.");
      return;
    }

    if (!description.trim()) {
      setErrorMsg("Missing Information: Please enter a Responsibility Description.");
      return;
    }

    setSubmitting(true);

    let targetId = null;
    let finalTitle = title.trim();

    if (scope === "working_group") {
      targetId = selectedWgId;
    } else if (scope === "sub_team") {
      targetId = selectedStId;
    } else if (scope === "leadership" && leadershipTitle.trim()) {
      finalTitle = `[${leadershipTitle.trim()}] ${title.trim()}`;
    }

    try {
      await createResponsibility(
        {
          scope,
          targetId,
          title: finalTitle,
          description: description.trim(),
        },
        { uid: profile.uid, role: profile.role }
      );

      setTitle("");
      setDescription("");
      setSelectedWgId("");
      setSelectedStId("");
      setLeadershipTitle("");
      setShowModal(false);
      await loadData();
    } catch (err) {
      console.error("Failed to create responsibility:", err);
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while saving the responsibility."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !profile ||
      !window.confirm("Are you sure you want to delete this responsibility?")
    )
      return;
    try {
      await deleteResponsibility(id, { uid: profile.uid, role: profile.role });
      await loadData();
    } catch (err) {
      console.error("Failed to delete responsibility:", err);
    }
  };

  const getTargetName = (
    itemScope: ResponsibilityScope,
    targetId?: string | null
  ) => {
    if (!targetId) return null;
    if (itemScope === "working_group") {
      return workingGroups.find((w) => (w.id === targetId || (w as any).uid === targetId))?.name;
    }
    if (itemScope === "sub_team") {
      return subTeams.find((s) => (s.id === targetId || (s as any).uid === targetId))?.name;
    }
    return null;
  };

  if (!isAdminOrExec) {
    return (
      <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
        <AlertCircle className="h-10 w-10 text-slate-300 mx-auto mb-3" />
        <h2 className="text-base font-bold text-slate-900">Restricted Access</h2>
        <p className="text-xs text-slate-500 mt-1">
          Responsibility library management is restricted to administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/contracts"
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Contracts Hub</span>
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            Centralized Responsibility Library
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage organization-wide, working group, sub-team, and leadership responsibility sets.
          </p>
        </div>

        <button
          onClick={() => {
            setErrorMsg(null);
            setShowModal(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>Add Responsibility</span>
        </button>
      </div>

      {/* Responsibility List */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-indigo-600" />
            <span>Library Items ({responsibilities.length})</span>
          </h2>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">Loading library...</div>
        ) : responsibilities.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-400">
            No responsibilities created yet. Click &quot;Add Responsibility&quot; to begin.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {responsibilities.map((item) => {
              const targetName = getTargetName(item.scope, item.targetId);
              const badge = SCOPE_BADGES[item.scope] || SCOPE_BADGES.general;

              return (
                <div
                  key={item.id}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.className}`}>
                        {badge.label}
                      </span>
                      {targetName && (
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                          {targetName}
                        </span>
                      )}
                      <h3 className="font-bold text-slate-900 text-sm">{item.title}</h3>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{item.description}</p>
                  </div>

                  <button
                    onClick={() => handleDelete(item.id)}
                    className="p-2 text-slate-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer self-end sm:self-center"
                    title="Delete Responsibility"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CREATE MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Add Responsibility Item</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              {/* Scope Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Scope Category *</label>
                <select
                  value={scope}
                  onChange={(e) => {
                    setScope(e.target.value as ResponsibilityScope);
                    setSelectedWgId("");
                    setSelectedStId("");
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white font-semibold text-slate-900"
                >
                  <option value="general">General Responsibilities (Organization-Wide)</option>
                  <option value="working_group">Working Group Specific</option>
                  <option value="sub_team">Sub-Team Specific</option>
                  <option value="leadership">Leadership Position</option>
                </select>
              </div>

              {/* General Scope Notice */}
              {scope === "general" && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                  <strong>General Responsibilities</strong> always sit at the top of every ICEP agreement as organization-wide commitments.
                </div>
              )}

              {/* Working Group Scope */}
              {scope === "working_group" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Select Working Group *</label>
                  <select
                    value={selectedWgId}
                    onChange={(e) => setSelectedWgId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="">-- Choose Working Group --</option>
                    {workingGroups.map((wg) => {
                      const wgId = wg.id || (wg as any).uid;
                      return (
                        <option key={wgId} value={wgId}>
                          {wg.name}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Sub-Team Scope (Dependent Dropdown: WG first, then Sub-Team) */}
              {scope === "sub_team" && (
                <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">1. Select Working Group *</label>
                    <select
                      value={selectedWgId}
                      onChange={(e) => {
                        setSelectedWgId(e.target.value);
                        setSelectedStId(""); // reset sub-team
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    >
                      <option value="">-- Choose Working Group First --</option>
                      {workingGroups.map((wg) => {
                        const wgId = wg.id || (wg as any).uid;
                        return (
                          <option key={wgId} value={wgId}>
                            {wg.name}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">2. Select Sub-Team *</label>
                    <select
                      disabled={!selectedWgId}
                      value={selectedStId}
                      onChange={(e) => setSelectedStId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white disabled:opacity-50"
                    >
                      <option value="">-- Choose Sub-Team --</option>
                      {filteredSubTeams.map((st) => {
                        const stId = st.id || (st as any).uid;
                        return (
                          <option key={stId} value={stId}>
                            {st.name}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
              )}

              {/* Leadership Position Scope */}
              {scope === "leadership" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Leadership Title / Position *</label>
                  <input
                    type="text"
                    value={leadershipTitle}
                    onChange={(e) => setLeadershipTitle(e.target.value)}
                    placeholder="e.g., Working Group Chair, Sub-Team Team Leader"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              )}

              {/* Expanding Input Field */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {scope === "general"
                    ? "General Responsibility Title *"
                    : scope === "leadership"
                    ? "Leadership Responsibility Title *"
                    : "Responsibility Title *"}
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Attend Bi-Weekly Strategic Alignment Sessions"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description / Expectation *</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detailed explanation of the duty and expected outcome..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? "Adding..." : "Add to Library"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}