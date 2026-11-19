"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { canManageOrganization } from "@/lib/permissions";
import {
  fetchActivities,
  createActivity,
  updateActivityReport,
  deleteActivity,
} from "@/lib/activityService";
import { fetchAllUsers, fetchWorkingGroups } from "@/lib/orgService";
import {
  Activity,
  UserProfile,
  WorkingGroup,
  ActivityCategory,
  ActivityStatus,
} from "@/types";
import {
  CalendarDays,
  Plus,
  Users,
  FileText,
  Trash2,
  X,
  Calendar,
} from "lucide-react";

const CATEGORY_BADGES: Record<ActivityCategory, string> = {
  meeting: "bg-[#004aad]/10 text-[#004aad] border-[#004aad]/20",
  workshop: "bg-purple-50 text-purple-700 border-purple-200",
  project: "bg-emerald-50 text-emerald-700 border-emerald-200",
  event: "bg-amber-50 text-amber-700 border-amber-200",
};

const STATUS_BADGES: Record<ActivityStatus, string> = {
  upcoming: "bg-slate-100 text-slate-700",
  in_progress: "bg-amber-50 text-amber-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-50 text-red-700",
};

const INPUT_CLASS =
  "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#004aad]/20 focus:border-[#004aad]";

export default function ActivitiesPage() {
  const { profile } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [workingGroups, setWorkingGroups] = useState<WorkingGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal: Create Activity
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ActivityCategory>("meeting");
  const [description, setDescription] = useState("");
  const [wgId, setWgId] = useState("");
  const [leadId, setLeadId] = useState("");
  const [date, setDate] = useState("");
  const [expectedOutcomes, setExpectedOutcomes] = useState("");
  const [creating, setCreating] = useState(false);

  // Modal: Report Summary
  const [reportModalActivity, setReportModalActivity] = useState<Activity | null>(
    null
  );
  const [reportSummary, setReportSummary] = useState("");
  const [reportStatus, setReportStatus] = useState<ActivityStatus>("completed");
  const [savingReport, setSavingReport] = useState(false);

  const loadData = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const [acts, userList, wgs] = await Promise.all([
        fetchActivities(),
        fetchAllUsers(),
        fetchWorkingGroups(),
      ]);
      setActivities(acts);
      setUsers(userList);
      setWorkingGroups(wgs);
      if (userList.length > 0) setLeadId(userList[0].uid);
    } catch (err) {
      console.error("Failed to load activities data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [profile]);

  const canManage =
    canManageOrganization(profile) || profile?.role === "wg_chair";

  const handleCreateActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setCreating(true);

    try {
      await createActivity(
        {
          name: name.trim(),
          category,
          description: description.trim(),
          workingGroupId: wgId || null,
          leadPersonId: leadId,
          date: date ? new Date(date) : new Date(),
          expectedOutcomes: expectedOutcomes.trim(),
        },
        { uid: profile.uid, role: profile.role }
      );

      setName("");
      setDescription("");
      setExpectedOutcomes("");
      setDate("");
      setShowCreateModal(false);
      await loadData();
    } catch (err) {
      console.error("Failed to create activity:", err);
    } finally {
      setCreating(false);
    }
  };

  const handleSaveReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !reportModalActivity) return;
    setSavingReport(true);

    try {
      await updateActivityReport(
        reportModalActivity.id,
        {
          status: reportStatus,
          reportSummary: reportSummary.trim(),
        },
        profile.uid
      );

      setReportModalActivity(null);
      setReportSummary("");
      await loadData();
    } catch (err) {
      console.error("Failed to update activity report:", err);
    } finally {
      setSavingReport(false);
    }
  };

  const handleDeleteActivity = async (activityId: string) => {
    if (
      !profile ||
      !window.confirm("Are you sure you want to delete this activity?")
    )
      return;
    try {
      await deleteActivity(activityId, {
        uid: profile.uid,
        role: profile.role,
      });
      await loadData();
    } catch (err) {
      console.error("Failed to delete activity:", err);
    }
  };

  const getUserName = (uid: string) =>
    users.find((u) => u.uid === uid)?.fullName || "Unassigned";
  const getWgName = (id: string | null) =>
    workingGroups.find((w) => w.id === id)?.name ||
    "General / Organization-wide";

  return (
    <div className="space-y-6 min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900">
            Activities & Meetings
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Schedule meetings, workshops, events, and track post-session report summaries.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#004aad] hover:bg-[#003882] text-white text-sm font-medium rounded-lg shadow-2xs transition-colors cursor-pointer shrink-0 w-full sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            <span>Schedule Activity</span>
          </button>
        )}
      </div>

      {/* Activities List */}
      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500 bg-white rounded-xl border border-slate-200">
          Loading activities...
        </div>
      ) : activities.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 sm:p-12 text-center">
          <CalendarDays className="h-10 w-10 text-[#004aad]/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700">
            No activities scheduled
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Schedule a working group meeting or workshop to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {activities.map((act) => {
            const dateObj = act.date?.toDate
              ? act.date.toDate().toLocaleString()
              : "TBD";

            return (
              <div
                key={act.id}
                className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-2xs hover:border-[#004aad]/40 transition-all space-y-4 min-w-0"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-slate-900 text-base break-words">
                        {act.name}
                      </h3>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider border ${
                          CATEGORY_BADGES[act.category]
                        }`}
                      >
                        {act.category}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                          STATUS_BADGES[act.status]
                        }`}
                      >
                        {act.status.replace("_", " ")}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1.5 leading-relaxed break-words">
                      {act.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-start">
                    <button
                      type="button"
                      onClick={() => {
                        setReportModalActivity(act);
                        setReportSummary(act.reportSummary || "");
                        setReportStatus(act.status);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:border-[#004aad]/40 hover:text-[#004aad] hover:bg-[#004aad]/5 transition-colors cursor-pointer"
                    >
                      <FileText className="h-3.5 w-3.5 text-[#004aad]" />
                      <span>
                        {act.reportSummary ? "Edit Report" : "Add Report"}
                      </span>
                    </button>

                    {canManage && (
                      <button
                        type="button"
                        onClick={() => handleDeleteActivity(act.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="Delete Activity"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {act.reportSummary && (
                  <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs text-slate-700">
                    <strong className="text-[#004aad]">
                      Meeting Report Summary:
                    </strong>
                    <p className="mt-1 whitespace-pre-line break-words">
                      {act.reportSummary}
                    </p>
                  </div>
                )}

                <div className="pt-3 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs text-slate-500">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1.5 font-medium text-slate-700">
                      <Users className="h-3.5 w-3.5 text-[#004aad] shrink-0" />
                      Lead: {getUserName(act.leadPersonId)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-[#004aad] shrink-0" />
                      {dateObj}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#004aad]/10 text-[#004aad] font-medium">
                      {getWgName(act.workingGroupId)}
                    </span>
                  </div>

                  {act.expectedOutcomes && (
                    <div className="text-slate-600 break-words">
                      <strong>Expected Outcomes:</strong> {act.expectedOutcomes}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE ACTIVITY MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full p-4 sm:p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">
                Schedule New Activity
              </h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateActivity} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Activity Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Working Group Bi-Weekly Alignment Meeting"
                  className={INPUT_CLASS}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Category *
                  </label>
                  <select
                    value={category}
                    onChange={(e) =>
                      setCategory(e.target.value as ActivityCategory)
                    }
                    className={INPUT_CLASS}
                  >
                    <option value="meeting">Meeting</option>
                    <option value="workshop">Workshop</option>
                    <option value="project">Project</option>
                    <option value="event">Event</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Working Group
                  </label>
                  <select
                    value={wgId}
                    onChange={(e) => setWgId(e.target.value)}
                    className={INPUT_CLASS}
                  >
                    <option value="">Organization-wide</option>
                    {workingGroups.map((wg) => (
                      <option key={wg.id} value={wg.id}>
                        {wg.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Description *
                </label>
                <textarea
                  required
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Agenda and session details..."
                  className={INPUT_CLASS}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Lead Person *
                  </label>
                  <select
                    value={leadId}
                    onChange={(e) => setLeadId(e.target.value)}
                    className={INPUT_CLASS}
                  >
                    {users.map((u) => (
                      <option key={u.uid} value={u.uid}>
                        {u.fullName} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Date & Time *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Expected Outcomes *
                </label>
                <input
                  type="text"
                  required
                  value={expectedOutcomes}
                  onChange={(e) => setExpectedOutcomes(e.target.value)}
                  placeholder="e.g., Action plan agreement and task distribution"
                  className={INPUT_CLASS}
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-[#004aad] hover:bg-[#003882] text-white text-sm font-medium rounded-lg shadow-2xs disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {creating ? "Scheduling..." : "Schedule Activity"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REPORT SUMMARY MODAL */}
      {reportModalActivity && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full p-4 sm:p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-900">
                  Activity Report Summary
                </h2>
                <p className="text-xs text-slate-500 truncate">
                  {reportModalActivity.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReportModalActivity(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveReport} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Activity Status *
                </label>
                <select
                  value={reportStatus}
                  onChange={(e) =>
                    setReportStatus(e.target.value as ActivityStatus)
                  }
                  className={INPUT_CLASS}
                >
                  <option value="upcoming">Upcoming</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Report Summary / Minutes *
                </label>
                <textarea
                  required
                  rows={5}
                  value={reportSummary}
                  onChange={(e) => setReportSummary(e.target.value)}
                  placeholder="Summarize key discussions, decisions made, and next steps..."
                  className={INPUT_CLASS}
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReportModalActivity(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingReport}
                  className="px-4 py-2 bg-[#004aad] hover:bg-[#003882] text-white text-sm font-medium rounded-lg shadow-2xs disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {savingReport ? "Saving..." : "Save Report Summary"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}