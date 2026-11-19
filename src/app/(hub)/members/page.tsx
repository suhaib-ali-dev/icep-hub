"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { canManageOrganization, ROLE_LABELS } from "@/lib/permissions";
import {
  fetchAllUsers,
  fetchWorkingGroups,
  fetchSubTeams,
} from "@/lib/orgService";
import {
  inviteNewMember,
  updateMemberPlacement,
  updateMyAvailability,
} from "@/lib/memberService";
import {
  UserProfile,
  WorkingGroup,
  SubTeam,
  UserRole,
  MembershipStatus,
} from "@/types";
import {
  Users,
  UserPlus,
  Search,
  Globe,
  Clock,
  Edit3,
  CheckCircle2,
  Copy,
  Check,
  X,
  AlertCircle,
} from "lucide-react";

const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const STATUS_BADGES: Record<MembershipStatus, string> = {
  invited: "bg-amber-50 text-amber-700 border-amber-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  inactive: "bg-slate-100 text-slate-600 border-slate-200",
  suspended: "bg-red-50 text-red-700 border-red-200",
};

const AGREEMENT_BADGES: Record<string, string> = {
  none: "bg-slate-100 text-slate-600",
  draft: "bg-slate-100 text-slate-700",
  pending_approval: "bg-amber-50 text-amber-700",
  needs_correction: "bg-orange-50 text-orange-700",
  active: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  expired: "bg-red-50 text-red-700",
};

export default function MembersPage() {
  const { profile, refreshProfile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [workingGroups, setWorkingGroups] = useState<WorkingGroup[]>([]);
  const [subTeams, setSubTeams] = useState<SubTeam[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterWg, setFilterWg] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Invite Modal State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [invEmail, setInvEmail] = useState("");
  const [invFullName, setInvFullName] = useState("");
  const [invCountry, setInvCountry] = useState("");
  const [invRole, setInvRole] = useState<UserRole>("member");
  const [invPosition, setInvPosition] = useState("");
  const [invWgId, setInvWgId] = useState("");
  const [invSubTeamId, setInvSubTeamId] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<{
    email: string;
    fullName: string;
    tempPassword: string;
    resetEmailSent: boolean;
  } | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  // Edit Placement Modal State (Admin/Exec)
  const [editingMember, setEditingMember] = useState<UserProfile | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editCountry, setEditCountry] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("member");
  const [editPosition, setEditPosition] = useState("");
  const [editWgId, setEditWgId] = useState("");
  const [editSubTeamId, setEditSubTeamId] = useState("");
  const [editStatus, setEditStatus] = useState<MembershipStatus>("active");
  const [savingEdit, setSavingEdit] = useState(false);

  // My Availability Modal State
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const [availDays, setAvailDays] = useState<string[]>([]);
  const [availHours, setAvailHours] = useState<number>(4);
  const [availPreferred, setAvailPreferred] = useState("");
  const [savingAvail, setSavingAvail] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [userList, wgList, stList] = await Promise.all([
        fetchAllUsers(),
        fetchWorkingGroups(),
        fetchSubTeams(),
      ]);
      setUsers(userList);
      setWorkingGroups(wgList);
      setSubTeams(stList);
    } catch (error) {
      console.error("Error loading members:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const isAdminOrExec = canManageOrganization(profile);

  const getWgName = (wgId: string | null) => {
    if (!wgId) return "Unassigned";
    return workingGroups.find((w) => w.id === wgId)?.name || "Unknown Group";
  };

  const getSubTeamName = (stId: string | null) => {
    if (!stId) return null;
    return subTeams.find((s) => s.id === stId)?.name || null;
  };

  // Filtered directory
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.country.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.positionTitle.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesWg =
      filterWg === "all" ||
      (filterWg === "unassigned"
        ? !u.workingGroupId
        : u.workingGroupId === filterWg);

    const matchesStatus =
      filterStatus === "all" || u.membershipStatus === filterStatus;

    return matchesSearch && matchesWg && matchesStatus;
  });

  // Handle Invite Submission
  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setInviting(true);
    setInviteError(null);

    try {
      const result = await inviteNewMember(
        {
          email: invEmail,
          fullName: invFullName,
          country: invCountry,
          role: invRole,
          positionTitle: invPosition,
          workingGroupId: invWgId || null,
          subTeamId: invSubTeamId || null,
        },
        { uid: profile.uid, role: profile.role }
      );

      setInviteSuccess({
        email: invEmail.trim(),
        fullName: invFullName.trim(),
        tempPassword: result.tempPassword,
        resetEmailSent: result.resetEmailSent,
      });

      setInvEmail("");
      setInvFullName("");
      setInvCountry("");
      setInvRole("member");
      setInvPosition("");
      setInvWgId("");
      setInvSubTeamId("");
      await loadData();
    } catch (err: unknown) {
      console.error("Invite error:", err);
      const message =
        err instanceof Error
          ? err.message
          : "Failed to invite member. Check if email is already registered.";
      setInviteError(message);
    } finally {
      setInviting(false);
    }
  };

  const copyInviteInstructions = () => {
    if (!inviteSuccess) return;
    const portalUrl =
      typeof window !== "undefined" ? `${window.location.origin}/login` : "";
    const text = `Hello ${inviteSuccess.fullName},\n\nYou have been invited to join the ICEP Hub.\nPortal Link: ${portalUrl}\nEmail: ${inviteSuccess.email}\nTemporary Password: ${inviteSuccess.tempPassword}\n\nPlease sign in (or use the password setup email sent to your inbox) and complete your Membership Commitment Agreement.`;
    navigator.clipboard.writeText(text);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2500);
  };

  // Open Edit Modal
  const openEditModal = (member: UserProfile) => {
    setEditingMember(member);
    setEditFullName(member.fullName);
    setEditCountry(member.country);
    setEditRole(member.role);
    setEditPosition(member.positionTitle);
    setEditWgId(member.workingGroupId || "");
    setEditSubTeamId(member.subTeamId || "");
    setEditStatus(member.membershipStatus);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !editingMember) return;
    setSavingEdit(true);

    try {
      await updateMemberPlacement(
        editingMember.uid,
        {
          fullName: editFullName.trim(),
          country: editCountry.trim(),
          role: editRole,
          positionTitle: editPosition.trim(),
          workingGroupId: editWgId || null,
          subTeamId: editSubTeamId || null,
          membershipStatus: editStatus,
        },
        { uid: profile.uid, role: profile.role }
      );
      setEditingMember(null);
      if (editingMember.uid === profile.uid) {
        await refreshProfile();
      }
      await loadData();
    } catch (error) {
      console.error("Failed to update member:", error);
    } finally {
      setSavingEdit(false);
    }
  };

  // Open My Availability Modal
  const openAvailabilityModal = () => {
    if (!profile) return;
    setAvailDays(profile.availability?.days || []);
    setAvailHours(profile.availability?.hoursPerWeek || 4);
    setAvailPreferred(profile.availability?.preferredHours || "");
    setShowAvailabilityModal(true);
  };

  const toggleDay = (day: string) => {
    setAvailDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSaveAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSavingAvail(true);

    try {
      await updateMyAvailability(profile.uid, {
        days: availDays,
        hoursPerWeek: Number(availHours),
        preferredHours: availPreferred.trim() || "Flexible",
      });
      await refreshProfile();
      await loadData();
      setShowAvailabilityModal(false);
    } catch (error) {
      console.error("Failed to update availability:", error);
    } finally {
      setSavingAvail(false);
    }
  };

  const inviteFilteredSubTeams = subTeams.filter(
    (s) => s.workingGroupId === invWgId
  );
  const editFilteredSubTeams = subTeams.filter(
    (s) => s.workingGroupId === editWgId
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Members</h1>
          <p className="text-sm text-slate-500 mt-1">
            ICEP member directory, organizational placements, and invitations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={openAvailabilityModal}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            <Clock className="h-4 w-4 text-slate-500" />
            <span>My Availability</span>
          </button>

          {isAdminOrExec && (
            <button
                type="button"
                onClick={() => {
                  setInviteSuccess(null);
                  setInviteError(null);
                  setShowInviteModal(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#004aad] hover:bg-[#003882] text-white text-sm font-medium rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <UserPlus className="h-4 w-4" />
                <span>Invite Member</span>
              </button>
          )}
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, email, country, or position..."
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>

        <select
          value={filterWg}
          onChange={(e) => setFilterWg(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
        >
          <option value="all">All Working Groups</option>
          <option value="unassigned">Unassigned</option>
          {workingGroups.map((wg) => (
            <option key={wg.id} value={wg.id}>
              {wg.name}
            </option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="invited">Invited</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {/* Members Table */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-sm text-slate-500">
          Loading ICEP member directory...
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Users className="h-10 w-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-900">
            No Members Found
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            No ICEP members match your current search or filter criteria.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-4">Member</th>
                  <th className="py-3.5 px-4">Role & Position</th>
                  <th className="py-3.5 px-4">Working Group / Sub-Team</th>
                  <th className="py-3.5 px-4">Availability</th>
                  <th className="py-3.5 px-4">Status & Agreement</th>
                  {isAdminOrExec && (
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredUsers.map((member) => {
                  const subTeamName = getSubTeamName(member.subTeamId);
                  return (
                    <tr
                      key={member.uid}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">
                          {member.fullName}
                        </div>
                        <div className="text-xs text-slate-500">
                          {member.email}
                        </div>
                        <div className="inline-flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                          <Globe className="h-3 w-3" />
                          <span>{member.country || "—"}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-800">
                          {member.positionTitle || "Member"}
                        </div>
                        <span className="inline-block mt-0.5 text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                          {ROLE_LABELS[member.role] || member.role}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="text-slate-800 font-medium">
                          {getWgName(member.workingGroupId)}
                        </div>
                        {subTeamName && (
                          <div className="text-xs text-slate-500 mt-0.5">
                            Sub-Team: {subTeamName}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-600">
                        <div>
                          <strong>
                            {member.availability?.hoursPerWeek || 0} hrs/wk
                          </strong>
                        </div>
                        <div className="text-slate-400 mt-0.5">
                          {member.availability?.days?.length
                            ? member.availability.days
                                .map((d) => d.slice(0, 3))
                                .join(", ")
                            : "Days not set"}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex flex-col items-start gap-1.5">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize ${
                              STATUS_BADGES[member.membershipStatus]
                            }`}
                          >
                            {member.membershipStatus}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize ${
                              AGREEMENT_BADGES[member.agreementStatus] ||
                              "bg-slate-100 text-slate-600"
                            }`}
                          >
                            Agreement:{" "}
                            {member.agreementStatus.replace("_", " ")}
                          </span>
                        </div>
                      </td>

                      {isAdminOrExec && (
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => openEditModal(member)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            <span>Manage</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: INVITE NEW MEMBER */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">
                Invite New ICEP Member
              </h2>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {inviteSuccess ? (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
                  <div className="flex items-center gap-2 font-semibold mb-1">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Invitation Created for {inviteSuccess.fullName}</span>
                  </div>
                  <p className="text-xs text-emerald-700">
                    {inviteSuccess.resetEmailSent
                      ? "A password setup link was automatically emailed to their inbox. You can also share the temporary credentials below:"
                      : "Share the temporary login credentials below with the member so they can sign in and complete their agreement:"}
                  </p>
                </div>

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-2 text-xs font-mono">
                  <div>
                    <span className="text-slate-500">Email:</span>{" "}
                    <strong className="text-slate-900">
                      {inviteSuccess.email}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Temp Password:</span>{" "}
                    <strong className="text-slate-900">
                      {inviteSuccess.tempPassword}
                    </strong>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={copyInviteInstructions}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 cursor-pointer"
                  >
                    {copiedInvite ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy Welcome Message</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleInviteSubmit} className="space-y-4">
                {inviteError && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2 text-xs text-red-700">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{inviteError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Full Legal Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={invFullName}
                      onChange={(e) => setInvFullName(e.target.value)}
                      placeholder="e.g., Amina Hassan"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Country *
                    </label>
                    <input
                      type="text"
                      required
                      value={invCountry}
                      onChange={(e) => setInvCountry(e.target.value)}
                      placeholder="e.g., Somalia"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={invEmail}
                    onChange={(e) => setInvEmail(e.target.value)}
                    placeholder="member@example.org"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      System Role *
                    </label>
                    <select
                      value={invRole}
                      onChange={(e) => setInvRole(e.target.value as UserRole)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    >
                      <option value="member">Member</option>
                      <option value="team_leader">Team Leader</option>
                      <option value="wg_chair">Working Group Chair</option>
                      <option value="exec_committee">
                        Executive Committee
                      </option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Position Title *
                    </label>
                    <input
                      type="text"
                      required
                      value={invPosition}
                      onChange={(e) => setInvPosition(e.target.value)}
                      placeholder="e.g., Policy Fellow"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Working Group
                    </label>
                    <select
                      value={invWgId}
                      onChange={(e) => {
                        setInvWgId(e.target.value);
                        setInvSubTeamId("");
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    >
                      <option value="">-- Assign Later --</option>
                      {workingGroups.map((wg) => (
                        <option key={wg.id} value={wg.id}>
                          {wg.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Sub-Team
                    </label>
                    <select
                      value={invSubTeamId}
                      disabled={!invWgId}
                      onChange={(e) => setInvSubTeamId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white disabled:bg-slate-50"
                    >
                      <option value="">-- None / Assign Later --</option>
                      {inviteFilteredSubTeams.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviting}
                    className="px-4 py-2 bg-[#004aad] hover:bg-[#003882] text-white text-sm font-medium rounded-lg shadow-2xs disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {inviting ? "Sending Invite..." : "Create Account & Invite"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT MEMBER PLACEMENT & ROLE (ADMIN/EXEC) */}
      {editingMember && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Manage Member Profile
                </h2>
                <p className="text-xs text-slate-500">{editingMember.email}</p>
              </div>
              <button
                onClick={() => setEditingMember(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Country *
                  </label>
                  <input
                    type="text"
                    required
                    value={editCountry}
                    onChange={(e) => setEditCountry(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    System Role *
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="member">Member</option>
                    <option value="team_leader">Team Leader</option>
                    <option value="wg_chair">Working Group Chair</option>
                    <option value="exec_committee">Executive Committee</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Membership Status *
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) =>
                      setEditStatus(e.target.value as MembershipStatus)
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="invited">Invited</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Position Title *
                </label>
                <input
                  type="text"
                  required
                  value={editPosition}
                  onChange={(e) => setEditPosition(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Working Group
                  </label>
                  <select
                    value={editWgId}
                    onChange={(e) => {
                      setEditWgId(e.target.value);
                      setEditSubTeamId("");
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="">-- Unassigned --</option>
                    {workingGroups.map((wg) => (
                      <option key={wg.id} value={wg.id}>
                        {wg.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Sub-Team
                  </label>
                  <select
                    value={editSubTeamId}
                    disabled={!editWgId}
                    onChange={(e) => setEditSubTeamId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white disabled:bg-slate-50"
                  >
                    <option value="">-- None --</option>
                    {editFilteredSubTeams.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
               <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 bg-[#004aad] hover:bg-[#003882] text-white text-sm font-medium rounded-lg shadow-2xs disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {savingEdit ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: MY AVAILABILITY */}
      {showAvailabilityModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  My Weekly Availability
                </h2>
                <p className="text-xs text-slate-500">
                  Used for task planning and your Membership Commitment Agreement.
                </p>
              </div>
              <button
                onClick={() => setShowAvailabilityModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAvailability} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Available Days
                </label>
                <div className="flex flex-wrap gap-2">
                  {DAYS_OF_WEEK.map((day) => {
                    const selected = availDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                          selected
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        {day.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Committed Hours Per Week *
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  required
                  value={availHours}
                  onChange={(e) => setAvailHours(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Preferred Time Window
                </label>
                <input
                  type="text"
                  value={availPreferred}
                  onChange={(e) => setAvailPreferred(e.target.value)}
                  placeholder="e.g., 16:00 - 20:00 EAT"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAvailabilityModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAvail}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  {savingAvail ? "Saving..." : "Save Availability"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}