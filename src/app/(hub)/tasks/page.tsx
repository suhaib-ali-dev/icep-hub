"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { canManageOrganization } from "@/lib/permissions";
import {
  fetchTasks,
  createTask,
  updateTaskStatus,
  deleteTask,
} from "@/lib/taskService";
import {
  fetchAllUsers,
  fetchWorkingGroups,
  fetchSubTeams,
} from "@/lib/orgService";
import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  Task,
  UserProfile,
  WorkingGroup,
  SubTeam,
  TaskPriority,
  TaskStatus,
} from "@/types";
import {
  CheckSquare,
  Plus,
  Search,
  Trash2,
  User,
  Calendar,
  X,
  Pencil,
  Eye,
  Bell,
  Mail,
  AlertTriangle,
  Layers,
  RotateCcw,
} from "lucide-react";

const PRIORITY_BADGES: Record<TaskPriority, string> = {
  low: "bg-slate-100 text-slate-700 border-slate-200",
  medium: "bg-[#004aad]/10 text-[#004aad] border-[#004aad]/20",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  urgent: "bg-red-50 text-red-700 border-red-200",
};

const STATUS_BADGES: Record<TaskStatus, string> = {
  not_started: "bg-slate-100 text-slate-600",
  in_progress: "bg-amber-50 text-amber-700",
  completed: "bg-emerald-50 text-emerald-700",
  on_hold: "bg-purple-50 text-purple-700",
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
  on_hold: "On Hold",
};

const INPUT_CLASS =
  "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#004aad]/20 focus:border-[#004aad]";

function toDateInputValue(deadline: Task["deadline"]): string {
  if (!deadline) return "";
  const d =
    typeof (deadline as { toDate?: () => Date }).toDate === "function"
      ? (deadline as { toDate: () => Date }).toDate()
      : deadline instanceof Date
      ? deadline
      : new Date(String(deadline));
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

function formatDeadline(deadline: Task["deadline"]): {
  label: string;
  isOverdue: boolean;
} {
  if (!deadline) return { label: "No deadline", isOverdue: false };
  const d =
    typeof (deadline as { toDate?: () => Date }).toDate === "function"
      ? (deadline as { toDate: () => Date }).toDate()
      : deadline instanceof Date
      ? deadline
      : new Date(String(deadline));
  if (Number.isNaN(d.getTime())) return { label: "No deadline", isOverdue: false };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(d);
  dueDay.setHours(0, 0, 0, 0);

  return {
    label: d.toLocaleDateString(),
    isOverdue: dueDay.getTime() < today.getTime(),
  };
}

export default function TasksPage() {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [workingGroups, setWorkingGroups] = useState<WorkingGroup[]>([]);
  const [subTeams, setSubTeams] = useState<SubTeam[]>([]);
  const [loading, setLoading] = useState(true);

  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Filters & Quick Views
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [wgFilter, setWgFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [scopeFilter, setScopeFilter] = useState<"all" | "mine" | "overdue">(
    "all"
  );

  // Create / Edit Task Modal State
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [wgId, setWgId] = useState("");
  const [stId, setStId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [expectedOutput, setExpectedOutput] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [notifyWgInApp, setNotifyWgInApp] = useState(false);
  const [emailAssignee, setEmailAssignee] = useState(true);
  const [saving, setSaving] = useState(false);

  // Detail Modal & Delete Confirmation Modal
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canManage =
    canManageOrganization(profile) ||
    profile?.role === "wg_chair" ||
    profile?.role === "team_leader";

  const loadData = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const [tsks, userList, wgs, sts] = await Promise.all([
        fetchTasks(),
        fetchAllUsers(),
        fetchWorkingGroups(),
        fetchSubTeams(),
      ]);
      setTasks(tsks);
      setUsers(userList);
      setWorkingGroups(wgs);
      setSubTeams(sts);
    } catch (err) {
      console.error("Failed to load tasks data:", err);
      setFeedback({
        type: "error",
        text: "Failed to load tasks and organizational directory.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [profile]);

  const availableSubTeams = useMemo(
    () => subTeams.filter((st) => st.workingGroupId === wgId),
    [subTeams, wgId]
  );

  const getUser = (uid: string) => users.find((u) => u.uid === uid) || null;
  const getUserName = (uid: string) =>
    getUser(uid)?.fullName || "Unassigned";
  const getWgName = (id: string) =>
    workingGroups.find((w) => w.id === id)?.name || "General";
  const getStName = (id: string | null | undefined) =>
    id ? subTeams.find((s) => s.id === id)?.name || "Sub-Team" : null;

  const createInAppTaskNotification = async (params: {
    taskId?: string;
    taskTitle: string;
    workingGroupId: string;
    subTeamId: string | null;
    assigneeId: string;
    wgScoped: boolean;
  }) => {
    try {
      const wgName = getWgName(params.workingGroupId);
      await addDoc(collection(db, "notifications"), {
        type: "new_task",
        title: "New task added",
        message: params.wgScoped
          ? `"${params.taskTitle}" added in ${wgName}`
          : `"${params.taskTitle}" assigned to ${getUserName(params.assigneeId)}`,
        taskId: params.taskId || null,
        workingGroupId: params.workingGroupId,
        subTeamId: params.subTeamId,
        assigneeId: params.assigneeId,
        scope: params.wgScoped ? "working_group" : "system",
        createdBy: profile?.uid || null,
        createdAt: serverTimestamp(),
        readBy: [],
      });
    } catch (err) {
      console.warn("Could not write in-app notification:", err);
    }
  };

  const sendAssigneeTaskEmail = async (params: {
    taskTitle: string;
    taskDescription: string;
    workingGroupId: string;
    assigneeId: string;
    deadlineStr: string;
    expectedOutputText: string;
    taskPriority: TaskPriority;
  }): Promise<{ ok: boolean; error?: string }> => {
    const assignee = getUser(params.assigneeId);
    if (!assignee?.email) {
      return {
        ok: false,
        error: "Selected assignee does not have an email address on file.",
      };
    }

    try {
      const res = await fetch("/api/notifications/task-assigned", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toEmail: assignee.email,
          toName: assignee.fullName,
          taskTitle: params.taskTitle,
          description: params.taskDescription,
          workingGroupName: getWgName(params.workingGroupId),
          deadline: params.deadlineStr || "No deadline",
          expectedOutput: params.expectedOutputText,
          priority: params.taskPriority,
          assignedBy: profile?.fullName || "ICEP Hub",
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          ok: false,
          error:
            data?.error ||
            `Email endpoint returned status ${res.status}.`,
        };
      }

      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Network error reaching email route.",
      };
    }
  };

  const openCreateModal = () => {
    setEditingTask(null);
    const defaultWg =
      workingGroups.find((w) => w.id === profile?.workingGroupId)?.id ||
      workingGroups[0]?.id ||
      "";
    const defaultAssignee =
      users.find((u) => u.uid === profile?.uid)?.uid || users[0]?.uid || "";

    setTitle("");
    setDescription("");
    setWgId(defaultWg);
    setStId("");
    setAssigneeId(defaultAssignee);
    setDeadline("");
    setExpectedOutput("");
    setPriority("medium");
    setNotifyWgInApp(false);
    setEmailAssignee(true);
    setShowTaskModal(true);
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setTitle(task.title || "");
    setDescription(task.description || "");
    setWgId(task.workingGroupId || workingGroups[0]?.id || "");
    setStId(task.subTeamId || "");
    setAssigneeId(task.assigneeId || users[0]?.uid || "");
    setDeadline(toDateInputValue(task.deadline));
    setExpectedOutput(task.expectedOutput || "");
    setPriority(task.priority || "medium");
    setNotifyWgInApp(false);
    setEmailAssignee(false);
    setShowTaskModal(true);
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setFeedback(null);

    try {
      const cleanTitle = title.trim();
      const cleanDesc = description.trim();
      const cleanOutput = expectedOutput.trim();
      const dueDateObj = deadline ? new Date(`${deadline}T12:00:00`) : new Date();

      if (editingTask) {
        await updateDoc(doc(db, "tasks", editingTask.id), {
          title: cleanTitle,
          description: cleanDesc,
          workingGroupId: wgId,
          subTeamId: stId || null,
          assigneeId,
          deadline: dueDateObj,
          expectedOutput: cleanOutput,
          priority,
          updatedAt: serverTimestamp(),
          updatedBy: profile.uid,
        });

        if (notifyWgInApp) {
          await createInAppTaskNotification({
            taskId: editingTask.id,
            taskTitle: cleanTitle,
            workingGroupId: wgId,
            subTeamId: stId || null,
            assigneeId,
            wgScoped: true,
          });
        }

        let emailFailed: string | null = null;
        if (emailAssignee && assigneeId) {
          const emailRes = await sendAssigneeTaskEmail({
            taskTitle: cleanTitle,
            taskDescription: cleanDesc,
            workingGroupId: wgId,
            assigneeId,
            deadlineStr: deadline || "No deadline",
            expectedOutputText: cleanOutput,
            taskPriority: priority,
          });
          if (!emailRes.ok) {
            emailFailed = emailRes.error || "Email could not be sent.";
          }
        }

        setFeedback({
          type: emailFailed ? "error" : "success",
          text: emailFailed
            ? `Updated task "${cleanTitle}", but assignee email failed: ${emailFailed}`
            : `Updated task "${cleanTitle}"${
                emailAssignee ? " and emailed the assignee" : ""
              }.`,
        });
      } else {
        const created = await createTask(
          {
            title: cleanTitle,
            description: cleanDesc,
            workingGroupId: wgId,
            subTeamId: stId || null,
            assigneeId,
            deadline: dueDateObj,
            expectedOutput: cleanOutput,
            priority,
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
            : undefined;

        await createInAppTaskNotification({
          taskId: createdId,
          taskTitle: cleanTitle,
          workingGroupId: wgId,
          subTeamId: stId || null,
          assigneeId,
          wgScoped: notifyWgInApp,
        });

        let emailFailed: string | null = null;
        if (emailAssignee && assigneeId) {
          const emailRes = await sendAssigneeTaskEmail({
            taskTitle: cleanTitle,
            taskDescription: cleanDesc,
            workingGroupId: wgId,
            assigneeId,
            deadlineStr: deadline || "No deadline",
            expectedOutputText: cleanOutput,
            taskPriority: priority,
          });
          if (!emailRes.ok) {
            emailFailed = emailRes.error || "Email could not be sent.";
          }
        }

        setFeedback({
          type: emailFailed ? "error" : "success",
          text: emailFailed
            ? `Created task "${cleanTitle}", but assignee email failed: ${emailFailed}`
            : `Created task "${cleanTitle}"${
                emailAssignee ? " and emailed the assignee" : ""
              }${notifyWgInApp ? " and alerted the working group in-app" : ""}.`,
        });
      }

      setShowTaskModal(false);
      setEditingTask(null);
      await loadData();
    } catch (err) {
      console.error("Failed to save task:", err);
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save task.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    if (!profile) return;
    try {
      await updateTaskStatus(taskId, newStatus, profile.uid);
      await loadData();
    } catch (err) {
      console.error("Failed to update task status:", err);
      setFeedback({
        type: "error",
        text: "Could not update task status.",
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (!profile || !taskToDelete) return;
    setDeleting(true);
    setFeedback(null);
    try {
      await deleteTask(taskToDelete.id, {
        uid: profile.uid,
        role: profile.role,
      });
      if (detailTask?.id === taskToDelete.id) setDetailTask(null);
      setTaskToDelete(null);
      setFeedback({
        type: "success",
        text: `Deleted task "${taskToDelete.title}".`,
      });
      await loadData();
    } catch (err) {
      console.error("Failed to delete task:", err);
      setFeedback({
        type: "error",
        text: "Failed to delete task.",
      });
    } finally {
      setDeleting(false);
    }
  };

  const hasActiveFilters =
    statusFilter !== "all" ||
    wgFilter !== "all" ||
    priorityFilter !== "all" ||
    scopeFilter !== "all" ||
    searchQuery.trim() !== "";

  const resetAllFilters = () => {
    setStatusFilter("all");
    setWgFilter("all");
    setPriorityFilter("all");
    setScopeFilter("all");
    setSearchQuery("");
  };

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: tasks.length,
      not_started: 0,
      in_progress: 0,
      completed: 0,
      on_hold: 0,
    };
    for (const t of tasks) {
      counts[t.status] = (counts[t.status] || 0) + 1;
    }
    return counts;
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tasks.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (wgFilter !== "all" && t.workingGroupId !== wgFilter) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;

      const { isOverdue } = formatDeadline(t.deadline);
      if (scopeFilter === "mine" && t.assigneeId !== profile?.uid) return false;
      if (scopeFilter === "overdue" && (!isOverdue || t.status === "completed"))
        return false;

      if (q) {
        const assigneeName = getUserName(t.assigneeId).toLowerCase();
        const matches =
          t.title?.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q) ||
          t.expectedOutput?.toLowerCase().includes(q) ||
          assigneeName.includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [
    tasks,
    statusFilter,
    wgFilter,
    priorityFilter,
    scopeFilter,
    searchQuery,
    profile?.uid,
    users,
  ]);

  const getFilterSelectClass = (isActive: boolean) =>
    `w-full sm:w-auto px-3 py-2 border rounded-lg text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#004aad]/20 focus:border-[#004aad] cursor-pointer ${
      isActive
        ? "border-[#004aad] bg-[#004aad]/[0.04] text-[#004aad]"
        : "border-slate-300 bg-white text-slate-700 hover:border-[#004aad]/50 hover:text-[#004aad]"
    }`;

  return (
    <div className="space-y-6 min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900">
            Tasks & Deliverables
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Track working group assignments, sub-team deliverables, and deadlines.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#004aad] hover:bg-[#003882] text-white text-sm font-medium rounded-lg shadow-2xs transition-colors cursor-pointer shrink-0 w-full sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            <span>Create Task</span>
          </button>
        )}
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`px-4 py-3 rounded-lg border text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <span className="break-words">{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-medium underline self-end sm:self-auto shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Branded Status Pills + Search & Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-4 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["all", "All"],
              ["not_started", STATUS_LABELS.not_started],
              ["in_progress", STATUS_LABELS.in_progress],
              ["completed", STATUS_LABELS.completed],
              ["on_hold", STATUS_LABELS.on_hold],
            ] as const
          ).map(([key, label]) => {
            const isSelected = statusFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-[#004aad] text-white border-[#004aad] shadow-2xs"
                    : "bg-white text-slate-700 border-slate-200 hover:border-[#004aad]/40 hover:bg-[#004aad]/5 hover:text-[#004aad]"
                }`}
              >
                <span>{label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[11px] font-semibold ${
                    isSelected
                      ? "bg-white/20 text-white"
                      : "bg-[#004aad]/10 text-[#004aad]"
                  }`}
                >
                  {statusCounts[key] || 0}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="relative flex-1 lg:max-w-md">
            <Search className="h-4 w-4 text-[#004aad]/70 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks, deliverables, or assignees..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#004aad]/20 focus:border-[#004aad]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 lg:flex lg:flex-wrap items-center gap-2">
            <select
              value={scopeFilter}
              onChange={(e) =>
                setScopeFilter(e.target.value as "all" | "mine" | "overdue")
              }
              className={getFilterSelectClass(scopeFilter !== "all")}
            >
              <option value="all">Scope: All Tasks</option>
              <option value="mine">Assigned to Me</option>
              <option value="overdue">Overdue Only</option>
            </select>

            <select
              value={wgFilter}
              onChange={(e) => setWgFilter(e.target.value)}
              className={getFilterSelectClass(wgFilter !== "all")}
            >
              <option value="all">All Working Groups</option>
              {workingGroups.map((wg) => (
                <option key={wg.id} value={wg.id}>
                  {wg.name}
                </option>
              ))}
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className={getFilterSelectClass(priorityFilter !== "all")}
            >
              <option value="all">All Priorities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="sm:col-span-3 lg:col-span-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-[#004aad] bg-[#004aad]/10 hover:bg-[#004aad]/15 transition-colors cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tasks List */}
      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500 bg-white rounded-xl border border-slate-200">
          Loading tasks...
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 sm:p-12 text-center">
          <CheckSquare className="h-10 w-10 text-[#004aad]/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700">No matching tasks</p>
          <p className="text-xs text-slate-400 mt-1">
            Adjust your filters or create a new task for your working group.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredTasks.map((task) => {
            const isAssignee = task.assigneeId === profile?.uid;
            const { label: deadlineLabel, isOverdue } = formatDeadline(
              task.deadline
            );
            const showOverdue = isOverdue && task.status !== "completed";
            const stName = getStName(task.subTeamId);

            return (
              <div
                key={task.id}
                onClick={() => setDetailTask(task)}
                className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-2xs hover:border-[#004aad]/40 transition-all space-y-4 cursor-pointer min-w-0"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-slate-900 text-base break-words">
                        {task.title}
                      </h3>
                      {isAssignee && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#004aad]/10 text-[#004aad]">
                          You
                        </span>
                      )}
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider border ${
                          PRIORITY_BADGES[task.priority]
                        }`}
                      >
                        {task.priority}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          STATUS_BADGES[task.status]
                        }`}
                      >
                        {STATUS_LABELS[task.status] || task.status}
                      </span>
                      {showOverdue && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          <AlertTriangle className="h-3 w-3" />
                          Overdue
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 break-words">
                      {task.description}
                    </p>
                  </div>

                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-2 shrink-0 flex-wrap self-start"
                  >
                    <select
                      value={task.status}
                      onChange={(e) =>
                        handleStatusChange(task.id, e.target.value as TaskStatus)
                      }
                      className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#004aad]/20 focus:border-[#004aad] cursor-pointer"
                    >
                      <option value="not_started">Not Started</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="on_hold">On Hold</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => setDetailTask(task)}
                      className="p-1.5 text-slate-500 hover:text-[#004aad] rounded-lg hover:bg-[#004aad]/5 transition cursor-pointer"
                      title="View Task Details"
                    >
                      <Eye className="h-4 w-4" />
                    </button>

                    {canManage && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditModal(task)}
                          className="p-1.5 text-slate-500 hover:text-[#004aad] rounded-lg hover:bg-[#004aad]/5 transition cursor-pointer"
                          title="Edit Task"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setTaskToDelete(task)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                          title="Delete Task"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Task Meta Footer */}
                <div className="pt-3 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs text-slate-500">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1.5 font-medium text-slate-700">
                      <User className="h-3.5 w-3.5 text-[#004aad] shrink-0" />
                      Assignee: {getUserName(task.assigneeId)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-[#004aad] shrink-0" />
                      Due: {deadlineLabel}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                      WG: {getWgName(task.workingGroupId)}
                    </span>
                    {stName && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#004aad]/10 text-[#004aad] font-medium">
                        <Layers className="h-3 w-3" />
                        {stName}
                      </span>
                    )}
                  </div>

                  {task.expectedOutput && (
                    <div className="text-slate-600 break-words">
                      <strong>Expected Output:</strong> {task.expectedOutput}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TASK DETAIL MODAL */}
      {detailTask && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-slate-900 break-words">
                    {detailTask.title}
                  </h2>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      STATUS_BADGES[detailTask.status]
                    }`}
                  >
                    {STATUS_LABELS[detailTask.status] || detailTask.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {getWgName(detailTask.workingGroupId)}
                  {getStName(detailTask.subTeamId)
                    ? ` · ${getStName(detailTask.subTeamId)}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailTask(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Description
                </h3>
                <p className="text-slate-700 leading-relaxed whitespace-pre-line break-words">
                  {detailTask.description || "No description provided."}
                </p>
              </div>

              <div className="rounded-xl bg-white border border-slate-200 p-3.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#004aad] mb-1">
                  Expected Output / Deliverable
                </h3>
                <p className="text-slate-800 font-medium break-words">
                  {detailTask.expectedOutput || "Not specified"}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-white p-3.5 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block">Assigned To</span>
                  <strong className="text-sm text-slate-900">
                    {getUserName(detailTask.assigneeId)}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Deadline</span>
                  <strong className="text-sm text-slate-900">
                    {formatDeadline(detailTask.deadline).label}
                  </strong>
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2 pt-4 border-t border-slate-100">
              {canManage ? (
                <button
                  type="button"
                  onClick={() => {
                    const target = detailTask;
                    setDetailTask(null);
                    openEditModal(target);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#004aad]/10 hover:bg-[#004aad]/15 text-[#004aad] rounded-lg transition-colors cursor-pointer"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span>Edit Task</span>
                </button>
              ) : (
                <div />
              )}
              <button
                type="button"
                onClick={() => setDetailTask(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT TASK MODAL */}
      {showTaskModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full p-4 sm:p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">
                {editingTask ? "Edit Task" : "Create New Task"}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowTaskModal(false);
                  setEditingTask(null);
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTask} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Task Title *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Draft policy brief on educational equity"
                  className={INPUT_CLASS}
                />
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
                  placeholder="Detailed description of the deliverable..."
                  className={INPUT_CLASS}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Working Group *
                  </label>
                  <select
                    value={wgId}
                    onChange={(e) => {
                      setWgId(e.target.value);
                      setStId("");
                    }}
                    className={INPUT_CLASS}
                  >
                    {workingGroups.map((wg) => (
                      <option key={wg.id} value={wg.id}>
                        {wg.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Sub-Team (Optional)
                  </label>
                  <select
                    value={stId}
                    onChange={(e) => setStId(e.target.value)}
                    className={INPUT_CLASS}
                  >
                    <option value="">-- Whole Working Group --</option>
                    {availableSubTeams.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Assignee *
                  </label>
                  <select
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                    className={INPUT_CLASS}
                  >
                    {users.map((u) => (
                      <option key={u.uid} value={u.uid}>
                        {u.fullName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Priority *
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TaskPriority)}
                    className={INPUT_CLASS}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Deadline *
                  </label>
                  <input
                    type="date"
                    required
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Expected Output / Deliverable *
                </label>
                <input
                  type="text"
                  required
                  value={expectedOutput}
                  onChange={(e) => setExpectedOutput(e.target.value)}
                  placeholder="e.g., 5-page PDF policy brief"
                  className={INPUT_CLASS}
                />
              </div>

              {/* Notification Options */}
              <div className="rounded-xl bg-white border border-slate-200 p-3.5 space-y-2.5">
                <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailAssignee}
                    onChange={(e) => setEmailAssignee(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 accent-[#004aad]"
                  />
                  <span className="flex items-center gap-1.5 font-medium">
                    <Mail className="h-3.5 w-3.5 text-[#004aad] shrink-0" />
                    Email assigned member with task details
                  </span>
                </label>

                <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifyWgInApp}
                    onChange={(e) => setNotifyWgInApp(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 accent-[#004aad]"
                  />
                  <div>
                    <span className="flex items-center gap-1.5 font-medium">
                      <Bell className="h-3.5 w-3.5 text-[#004aad] shrink-0" />
                      Notify working group in-app (zero extra email quota)
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      Creates a working-group-scoped alert inside ICEP Hub without sending group emails.
                    </span>
                  </div>
                </label>
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowTaskModal(false);
                    setEditingTask(null);
                  }}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-[#004aad] hover:bg-[#003882] text-white text-sm font-medium rounded-lg shadow-2xs disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {saving
                    ? "Saving..."
                    : editingTask
                    ? "Save Changes"
                    : "Create Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {taskToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-4 sm:p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Delete Task?</h2>
            <p className="text-sm text-slate-600 break-words">
              Are you sure you want to delete{" "}
              <strong className="text-slate-900">{taskToDelete.title}</strong>?
              This action cannot be undone.
            </p>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTaskToDelete(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 cursor-pointer"
              >
                {deleting ? "Deleting..." : "Delete Task"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}