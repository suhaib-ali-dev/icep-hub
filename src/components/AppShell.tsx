"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard,
  FileSignature,
  Users,
  Network,
  CheckSquare,
  CalendarDays,
  LogOut,
  ShieldCheck,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Contracts & Agreements", href: "/contracts", icon: FileSignature },
  { label: "Members", href: "/members", icon: Users },
  { label: "Working Groups", href: "/working-groups", icon: Network },
  { label: "Tasks", href: "/tasks", icon: CheckSquare },
  { label: "Activities", href: "/activities", icon: CalendarDays },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { firebaseUser, profile, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // Redirect unauthenticated users back to login once auth state finishes resolving
  useEffect(() => {
    if (!loading && !firebaseUser) {
      router.push("/login");
    }
  }, [loading, firebaseUser, router]);

  if (!loading && !firebaseUser) return null;

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0">
        <div>
          {/* Brand Header */}
          <div className="h-16 px-6 flex items-center gap-3 border-b border-slate-200">
            <div className="h-8 w-8 rounded-md bg-slate-900 text-white flex items-center justify-center">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <span className="font-bold text-slate-900 tracking-tight block leading-none">
                ICEP Hub
              </span>
              <span className="text-[11px] text-slate-500">Version 1.0</span>
            </div>
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
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Footer & Logout */}
        <div className="p-4 border-t border-slate-200">
          <div className="mb-3 px-2">
            <p className="text-sm font-medium text-slate-900 truncate">
              {loading
                ? "Loading profile..."
                : profile?.fullName || firebaseUser?.email || "ICEP Member"}
            </p>
            <p className="text-xs text-slate-500 capitalize">
              {profile?.role?.replace("_", " ") || "Member"}
            </p>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}