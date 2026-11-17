"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { canManageOrganization } from "@/lib/permissions";
import { fetchTasks, createTask, updateTaskStatus, deleteTask } from "@/lib/taskService";
import { fetchAllUsers, fetchWorkingGroups, fetchSubTeams } from "@/lib/orgService";
import { Task, UserProfile, WorkingGroup, SubTeam, TaskPriority, TaskStatus } from "@/types";
import {
  CheckSquare,
  Plus,
  Clock,
  AlertCircle,
  CheckCircle2,
  Filter,
  Trash2,
  User,
  Calendar,
  X,
} from "lucide-react";

const PRIORITY_BADGES: Record<TaskPriority, string> = {
  low: "bg-slate-100 text-slate-700 border-slate-200",
  medium: "bg-blue-50 text-blue-700 border-blue-200",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  urgent: "bg-red-50 text-red-700 border-red-200",
};

const STATUS_BADGES: Record<TaskStatus, string> = {
  not_started: "bg-slate-100 text-slate-600",
  in_progress: "bg-amber-50 text-amber-700",
  completed: "bg-emerald-50 text-emerald-700",
  on_hold: "bg-purple-50 text-purple-700",
};

export default function TasksPage() {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [workingGroups, setWorkingGroups] = useState<WorkingGroup[]>([]);
  const [subTeams, setSubTeams] = useState<SubTeam[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Modal: Create Task
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [wgId, setWgId] = useState("");
  const [stId, setStId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [expectedOutput, setExpectedOutput] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [creating, setCreating] = useState(false);

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
      if (wgs.length > 0) setWgId(wgs[0].id);
      if (userList.length > 0) setAssigneeId(userList[0].uid);
    } catch (err) {
      console.error("Failed to load tasks data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [profile]);

  const canManage = canManageOrganization(profile) || profile?.role === "wg_chair";

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setCreating(true);

    try {
      await createTask(
        {
          title: title.trim(),
          description: description.trim(),
          workingGroupId: wgId,
          subTeamId: stId || null,
          assigneeId,
          deadline: deadline ? new Date(deadline) : new Date(),
          expectedOutput: expectedOutput.trim(),
          priority,
        },
        { uid: profile.uid, role: profile.role }
      );

      setTitle("");
      setDescription("");
      setExpectedOutput("");
      setDeadline("");
      setShowCreateModal(false);
      await loadData();
    } catch (err) {
      console.error("Failed to create task:", err);
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    if (!profile) return;
    try {
      await updateTaskStatus(taskId, newStatus, profile.uid);
      await loadData();
    } catch (err) {
      console.error("Failed to update task status:", err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!profile || !window.confirm("Are you sure you want to delete this task?")) return;
    try {
      await deleteTask(taskId, { uid: profile.uid, role: profile.role });
      await loadData();
    } catch (err) {
      console.error("Failed to delete task:", err);
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    return true;
  });

  const getUserName = (uid: string) => users.find((u) => u.uid === uid)?.fullName || "Unassigned";
  const getWgName = (id: string) => workingGroups.find((w) => w.id === id)?.name || "General";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Tasks & Deliverables
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Track working group assignments, deadlines, and deliverables.
          </p>
        </div>

        {canManage && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Create Task</span>
          </button>
        )}
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
            Filter Status:
          </span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
          >
            <option value="all">All Tasks</option>
            <option value="not_started">Not Started</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="on_hold">On Hold</option>
          </select>
        </div>
        <div className="text-xs text-slate-500">
          Showing <strong>{filteredTasks.length}</strong> tasks
        </div>
      </div>

      {/* Tasks List */}
      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500">Loading tasks...</div>
      ) : filteredTasks.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <CheckSquare className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700">No tasks found</p>
          <p className="text-xs text-slate-400 mt-1">
            Get started by creating a task for your working group.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredTasks.map((task) => {
            const isAssignee = task.assigneeId === profile?.uid;
            const deadlineDate = task.deadline?.toDate
              ? task.deadline.toDate().toLocaleDateString()
              : "No deadline";

            return (
              <div
                key={task.id}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition-all space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="font-bold text-slate-900 text-base">{task.title}</h3>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider border ${PRIORITY_BADGES[task.priority]}`}>
                        {task.priority}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGES[task.status]}`}>
                        {task.status.replace("_", " ")}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                      {task.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={task.status}
                      onChange={(e) => handleStatusChange(task.id, e.target.value as TaskStatus)}
                      className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium bg-white cursor-pointer"
                    >
                      <option value="not_started">Not Started</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="on_hold">On Hold</option>
                    </select>

                    {canManage && (
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                        title="Delete Task"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Task Meta Footer */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="flex items-center gap-1.5 font-medium text-slate-700">
                      <User className="h-3.5 w-3.5 text-slate-400" />
                      Assignee: {getUserName(task.assigneeId)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      Due: {deadlineDate}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                      WG: {getWgName(task.workingGroupId)}
                    </span>
                  </div>

                  {task.expectedOutput && (
                    <div className="text-slate-600">
                      <strong>Expected Output:</strong> {task.expectedOutput}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE TASK MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Create New Task</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4">
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Working Group *
                  </label>
                  <select
                    value={wgId}
                    onChange={(e) => setWgId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
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
                    Assignee *
                  </label>
                  <select
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    {users.map((u) => (
                      <option key={u.uid} value={u.uid}>
                        {u.fullName} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Priority *
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TaskPriority)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
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
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
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
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  {creating ? "Creating..." : "Create Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}