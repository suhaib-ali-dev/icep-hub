"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { canManageOrganization } from "@/lib/permissions";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  arrayUnion,
  Timestamp,
} from "firebase/firestore";
import {
  LayoutDashboard,
  FileSignature,
  Users,
  Network,
  CheckSquare,
  CalendarDays,
  LogOut,
  ShieldCheck,
  Menu,
  X,
  Bell,
  CheckCheck,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Contracts & Agreements", href: "/contracts", icon: FileSignature },
  { label: "Members", href: "/members", icon: Users },
  { label: "Working Groups", href: "/working-groups", icon: Network },
  { label: "Tasks", href: "/tasks", icon: CheckSquare },
  { label: "Activities", href: "/activities", icon: CalendarDays },
];

interface HubNotification {
  id: string;
  title?: string;
  message?: string;
  taskId?: string | null;
  workingGroupId?: string | null;
  assigneeId?: string | null;
  scope?: "system" | "working_group";
  createdAt?: Timestamp | Date | null;
  readBy?: string[];
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { firebaseUser, profile, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [rawNotifications, setRawNotifications] = useState<HubNotification[]>([]);

  // Redirect unauthenticated users back to login once auth state finishes resolving
  useEffect(() => {
    if (!loading && !firebaseUser) {
      router.push("/login");
    }
  }, [loading, firebaseUser, router]);

  // Close mobile drawer and notification popover on navigation
  useEffect(() => {
    setMobileMenuOpen(false);
    setNotifOpen(false);
  }, [pathname]);

  // Allow Escape key to close mobile drawer or notification menu
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileMenuOpen(false);
        setNotifOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Subscribe to in-app notifications ("New task added", WG-scoped alerts, etc.)
  // Inside AppShell.tsx notifications effect:
useEffect(() => {
  if (!firebaseUser || !profile) return;

  const q = query(collection(db, "notifications"), limit(30));

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const items: HubNotification[] = snapshot.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<HubNotification, "id">),
        }))
        .sort((a, b) => {
          const aTime =
            a.createdAt && typeof (a.createdAt as Timestamp).toMillis === "function"
              ? (a.createdAt as Timestamp).toMillis()
              : a.createdAt instanceof Date
              ? a.createdAt.getTime()
              : 0;
          const bTime =
            b.createdAt && typeof (b.createdAt as Timestamp).toMillis === "function"
              ? (b.createdAt as Timestamp).toMillis()
              : b.createdAt instanceof Date
              ? b.createdAt.getTime()
              : 0;
          return bTime - aTime;
        });

      setRawNotifications(items);
    },
    (err) => {
      if (err.code !== "permission-denied") {
        console.warn("Notifications listener error:", err);
      }
    }
  );

  return () => unsubscribe();
}, [firebaseUser, profile]);

  const visibleNotifications = useMemo(() => {
    const isPrivileged = canManageOrganization(profile);
    return rawNotifications.filter((n) => {
      if (isPrivileged) return true;
      if (n.scope === "working_group" && n.workingGroupId) {
        return (
          n.workingGroupId === profile?.workingGroupId ||
          n.assigneeId === profile?.uid
        );
      }
      return true;
    });
  }, [rawNotifications, profile]);

  const unreadCount = useMemo(() => {
    if (!firebaseUser?.uid) return 0;
    return visibleNotifications.filter(
      (n) => !(n.readBy || []).includes(firebaseUser.uid)
    ).length;
  }, [visibleNotifications, firebaseUser?.uid]);

  const handleMarkAsRead = async (notif: HubNotification) => {
    if (!firebaseUser?.uid) return;
    if (!(notif.readBy || []).includes(firebaseUser.uid)) {
      try {
        await updateDoc(doc(db, "notifications", notif.id), {
          readBy: arrayUnion(firebaseUser.uid),
        });
      } catch (err) {
        console.warn("Could not mark notification as read:", err);
      }
    }
    setNotifOpen(false);
    if (notif.taskId) {
      router.push("/tasks");
    }
  };

  const handleMarkAllRead = async () => {
    if (!firebaseUser?.uid) return;
    const unread = visibleNotifications.filter(
      (n) => !(n.readBy || []).includes(firebaseUser.uid)
    );
    await Promise.all(
      unread.map((n) =>
        updateDoc(doc(db, "notifications", n.id), {
          readBy: arrayUnion(firebaseUser.uid),
        }).catch(() => null)
      )
    );
  };

  if (!loading && !firebaseUser) return null;

  const notificationBell = (
    <div className="relative">
      <button
        type="button"
        onClick={() => setNotifOpen((prev) => !prev)}
        aria-label="Notifications"
        className="relative p-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:text-[#004aad] hover:border-[#004aad]/40 hover:bg-[#004aad]/5 transition-colors cursor-pointer"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#004aad] text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {notifOpen && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setNotifOpen(false)}
          />
          <div className="fixed sm:absolute right-4 sm:right-0 left-4 sm:left-auto top-16 sm:top-auto sm:mt-2 z-40 sm:w-88 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-white">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Notifications ({unreadCount} unread)
              </span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#004aad] hover:underline cursor-pointer"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span>Mark all read</span>
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
              {visibleNotifications.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No notifications yet. New tasks will appear here.
                </div>
              ) : (
                visibleNotifications.slice(0, 12).map((n) => {
                  const isUnread = firebaseUser?.uid
                    ? !(n.readBy || []).includes(firebaseUser.uid)
                    : false;

                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleMarkAsRead(n)}
                      className={`w-full text-left px-4 py-3 hover:bg-[#004aad]/5 transition-colors cursor-pointer ${
                        isUnread ? "bg-[#004aad]/[0.03]" : "bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-900">
                          {n.title || "New task added"}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {n.scope === "working_group" && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#004aad]/10 text-[#004aad]">
                              WG
                            </span>
                          )}
                          {isUnread && (
                            <span className="h-2 w-2 rounded-full bg-[#004aad]" />
                          )}
                        </div>
                      </div>
                      {n.message && (
                        <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                          {n.message}
                        </p>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );

  const sidebarContent = (
    <div className="h-full flex flex-col justify-between bg-white border-r border-slate-200">
      <div>
        {/* Brand Header */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-8 w-8 rounded-md bg-[#004aad] text-white flex items-center justify-center shadow-2xs shrink-0">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <span className="font-bold text-slate-900 tracking-tight block leading-none truncate">
                ICEP Hub
              </span>
              <span className="text-[11px] text-[#004aad] font-medium block mt-0.5">
                Version 1.0
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation"
            className="md:hidden p-1.5 rounded-lg text-slate-500 hover:text-[#004aad] hover:bg-[#004aad]/5 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 6 Main Navigation Links */}
        <nav className="p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[#004aad] text-white shadow-2xs"
                    : "text-slate-600 hover:bg-[#004aad]/5 hover:text-[#004aad]"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* User Footer & Logout */}
      <div className="p-4 border-t border-slate-200 bg-white">
        <div className="mb-3 px-2">
          <p className="text-sm font-medium text-slate-900 truncate">
            {loading
              ? "Loading profile..."
              : profile?.fullName || firebaseUser?.email || "ICEP Member"}
          </p>
          <p className="text-xs text-[#004aad] font-medium capitalize truncate">
            {profile?.role?.replace("_", " ") || "Member"}
          </p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-white text-slate-900 overflow-x-hidden">
      {/* Mobile Top Bar */}
      <header className="md:hidden sticky top-0 z-30 h-14 px-4 bg-white border-b border-slate-200 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-7 w-7 rounded-md bg-[#004aad] text-white flex items-center justify-center shrink-0">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <span className="font-bold text-slate-900 text-sm truncate">
            ICEP Hub
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {notificationBell}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation"
            className="p-2 rounded-lg text-slate-700 hover:text-[#004aad] hover:bg-[#004aad]/5 transition-colors cursor-pointer"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Mobile Slide-Over Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] h-full z-10">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden md:block w-64 shrink-0">{sidebarContent}</aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Desktop Utility Header */}
        <div className="hidden md:flex h-16 px-6 lg:px-8 border-b border-slate-100 bg-white items-center justify-between">
          <div className="text-xs text-slate-500 truncate">
            {profile?.fullName ? (
              <span>
                Signed in as{" "}
                <strong className="text-slate-800">{profile.fullName}</strong>
              </span>
            ) : (
              <span>ICEP Organizational Workspace</span>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {notificationBell}
          </div>
        </div>

        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:p-8 max-w-7xl w-full mx-auto min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}