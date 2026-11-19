"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import type {
  Activity,
  Agreement,
  AgreementStatus,
  Task,
  UserProfile,
} from "@/types";

const ADMIN_ROLE_SET = new Set([
  "super_admin",
  "exec_committee",
  "wg_chair",
  "team_leader",
  "admin",
]);

const toJsDate = (val?: Timestamp | Date | string | null): Date | null => {
  if (!val) return null;
  if (typeof (val as Timestamp).toDate === "function") {
    return (val as Timestamp).toDate();
  }
  const parsed = new Date(val as string | Date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (val?: Timestamp | Date | string | null): string => {
  const d = toJsDate(val);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatStatusLabel = (status: string) => status.replaceAll("_", " ");

const statusBadgeClasses = (status: AgreementStatus | string) => {
  switch (status) {
    case "active":
    case "approved":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "pending_approval":
    case "submitted":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "needs_correction":
      return "bg-orange-50 text-orange-700 border-orange-200";
    case "rejected":
    case "expired":
      return "bg-rose-50 text-rose-700 border-rose-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
};

export default function DashboardPage() {
  const authState = useAuth() as {
    user?: { uid?: string; email?: string | null; role?: string } | null;
    profile?: (Partial<UserProfile> & { role?: string }) | null;
    loading?: boolean;
  };

  const uid = authState?.user?.uid || (authState?.profile as any)?.uid || "";
  const effectiveRole = (
    authState?.profile?.role ||
    authState?.user?.role ||
    ""
  )
    .toString()
    .toLowerCase()
    .trim();

  const isAdmin = ADMIN_ROLE_SET.has(effectiveRole);

  const [loadingData, setLoadingData] = useState(true);
  const [memberCount, setMemberCount] = useState<number>(0);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [referenceTimeMs, setReferenceTimeMs] = useState<number | null>(null);

  useEffect(() => {
    setReferenceTimeMs(Date.now());
  }, [agreements, tasks]);

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      if (authState?.loading) return;

      if (!uid) {
        if (active) setLoadingData(false);
        return;
      }

      setLoadingData(true);

      try {
        const agreementsQuery = isAdmin
          ? query(collection(db, "agreements"), limit(100))
          : query(
              collection(db, "agreements"),
              where("userId", "==", uid),
              limit(25)
            );

        const agreementsSnap = await getDocs(agreementsQuery);
        const loadedAgreements = agreementsSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Agreement[];

        let totalMembers = 0;
        if (isAdmin) {
          const usersSnap = await getDocs(
            query(collection(db, "users"), limit(200))
          );
          totalMembers = usersSnap.size;
        }

        let loadedTasks: Task[] = [];
        try {
          const tasksSnap = await getDocs(
            query(collection(db, "tasks"), limit(20))
          );
          loadedTasks = tasksSnap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as Task[];
        } catch (taskErr) {
          console.warn("Tasks query failed:", taskErr);
        }

        let loadedActivities: Activity[] = [];
        try {
          const actQuery = query(
            collection(db, "activities"),
            orderBy("createdAt", "desc"),
            limit(6)
          );
          const actSnap = await getDocs(actQuery);
          loadedActivities = actSnap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as Activity[];
        } catch (actErr) {
          console.warn("Activities query failed:", actErr);
        }

        if (active) {
          setAgreements(loadedAgreements);
          setMemberCount(totalMembers);
          setTasks(loadedTasks);
          setActivities(loadedActivities);
        }
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        if (active) setLoadingData(false);
      }
    }

    loadDashboard();
    return () => {
      active = false;
    };
  }, [uid, isAdmin, authState?.loading]);

  const metrics = useMemo(() => {
    const pendingReview = agreements.filter(
      (a) =>
        a.status === "pending_approval" || (a.status as string) === "submitted"
    ).length;

    const approvedCount = agreements.filter(
      (a) =>
        a.status === "active" ||
        (a.status as string) === "approved" ||
        a.review?.decision === "approved"
    ).length;

    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const expiringSoon =
      referenceTimeMs === null
        ? 0
        : agreements.filter((a) => {
            const isApprovedOrActive =
              a.status === "active" ||
              (a.status as string) === "approved" ||
              a.review?.decision === "approved";
            if (!isApprovedOrActive) return false;
            const end = toJsDate(a.duration?.endDate);
            if (!end) return false;
            const endMs = end.getTime();
            return endMs >= referenceTimeMs && endMs <= referenceTimeMs + thirtyDaysMs;
          }).length;

    const openTasks = tasks.filter((t) => t.status !== "completed").length;

    return {
      pendingReview,
      approvedCount,
      expiringSoon,
      openTasks,
    };
  }, [agreements, tasks, referenceTimeMs]);

  const primaryMemberAgreement = useMemo(() => {
    if (isAdmin || agreements.length === 0) return null;
    return (
      agreements.find(
        (a) =>
          a.status === "active" ||
          (a.status as string) === "approved" ||
          a.review?.decision === "approved"
      ) ||
      agreements.find(
        (a) =>
          a.status === "pending_approval" || (a.status as string) === "submitted"
      ) ||
      agreements[0]
    );
  }, [agreements, isAdmin]);

  return (
    <div className="space-y-6">
      {/* Header + Quick Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {authState?.profile?.fullName
              ? `Welcome back, ${authState.profile.fullName.split(" ")[0]}`
              : "Dashboard"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Overview of ICEP members, agreements, tasks, and activities.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/contracts"
            className="inline-flex items-center justify-center rounded-lg bg-[#004aad] px-4 py-2 text-sm font-semibold text-white hover:bg-[#003882] transition"
          >
            {isAdmin ? "Review Agreements" : "My Agreement"}
          </Link>
          {isAdmin && (
            <Link
              href="/members"
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Manage Members
            </Link>
          )}
        </div>
      </div>

      {loadingData ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-28 rounded-xl border border-slate-200 bg-white p-5 animate-pulse"
            />
          ))}
        </div>
      ) : isAdmin ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Total Members
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{memberCount}</p>
            <p className="mt-1 text-xs text-slate-500">Registered in ICEP Hub</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Pending Review
            </p>
            <p className="mt-2 text-3xl font-bold text-amber-600">
              {metrics.pendingReview}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Submitted agreements awaiting action
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Approved Agreements
            </p>
            <p className="mt-2 text-3xl font-bold text-emerald-600">
              {metrics.approvedCount}
            </p>
            <p className="mt-1 text-xs text-slate-500">Active member commitments</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Expiring in 30 Days
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {metrics.expiringSoon}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Contracts approaching end date
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Your Membership & Contract Status
              </span>
              <h2 className="text-lg font-bold text-slate-900 mt-1">
                {authState?.profile?.positionTitle || "ICEP Member"}
              </h2>
              {primaryMemberAgreement ? (
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-600">
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${statusBadgeClasses(
                      primaryMemberAgreement.status
                    )}`}
                  >
                    {formatStatusLabel(primaryMemberAgreement.status)}
                  </span>
                  <span>
                    Duration:{" "}
                    <strong>
                      {formatDate(primaryMemberAgreement.duration?.startDate)} –{" "}
                      {formatDate(primaryMemberAgreement.duration?.endDate)}
                    </strong>
                  </span>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-600">
                  You have not submitted an agreement yet. Complete your agreement in
                  the Contracts section to activate your membership record.
                </p>
              )}
            </div>

            <Link
              href="/contracts"
              className="inline-flex items-center justify-center rounded-lg bg-[#004aad] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#003882] transition shrink-0"
            >
              {primaryMemberAgreement ? "View Agreement Details" : "Start Agreement"}
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900">
              {isAdmin ? "Recent Agreements" : "Your Agreements"}
            </h2>
            <Link
              href="/contracts"
              className="text-xs font-semibold text-[#004aad] hover:underline"
            >
              Open Contracts →
            </Link>
          </div>

          {agreements.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              No agreements found yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {agreements.slice(0, 6).map((item) => (
                <div
                  key={item.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {isAdmin
                        ? item.memberSnapshot?.fullName ||
                          item.memberSnapshot?.email ||
                          "Member"
                        : item.type === "position_specific"
                        ? "Position-Specific Agreement"
                        : "Membership Commitment Agreement"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {isAdmin
                        ? `${item.memberSnapshot?.positionTitle || "Member"} · ${
                            item.memberSnapshot?.workingGroupName || "Unassigned"
                          }`
                        : `Term: ${formatDate(item.duration?.startDate)} – ${formatDate(
                            item.duration?.endDate
                          )}`}
                    </p>
                  </div>

                  <span
                    className={`self-start sm:self-center inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${statusBadgeClasses(
                      item.status
                    )}`}
                  >
                    {formatStatusLabel(item.status)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-slate-900">Tasks</h2>
              <span className="text-xs font-semibold text-slate-500">
                {metrics.openTasks} open
              </span>
            </div>
            {tasks.length === 0 ? (
              <p className="text-sm text-slate-500 py-3">
                No tasks scheduled right now.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {tasks.slice(0, 4).map((task) => (
                  <li
                    key={task.id}
                    className="rounded-lg bg-slate-50 px-3 py-2 text-sm"
                  >
                    <p className="font-medium text-slate-800 truncate">{task.title}</p>
                    <p className="text-xs text-slate-500">
                      Due: {formatDate(task.deadline)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-base font-bold text-slate-900 mb-3">
              Recent Activity
            </h2>
            {activities.length === 0 ? (
              <p className="text-sm text-slate-500 py-3">
                Agreement approvals, submissions, and member updates will appear here.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {activities.slice(0, 4).map((act) => (
                  <li
                    key={act.id}
                    className="text-xs text-slate-600 border-b border-slate-100 pb-2 last:border-0 last:pb-0"
                  >
                    <p className="font-medium text-slate-800">
                      {act.name || act.description || "Hub update"}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {formatDate(act.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}