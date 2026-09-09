"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { OWNER_EMAIL } from "@/lib/admin";

export default function Navbar() {
  const { data: session } = useSession();

  if (!session) return null;

  const isOwner = session.user?.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();

  return (
    <nav className="bg-green-800 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/dashboard" className="text-xl font-bold tracking-tight">
          Easy Game Manager
        </Link>
        <div className="flex items-center gap-4">
          {isOwner && (
            <Link
              href="/admin"
              className="text-sm bg-amber-600 hover:bg-amber-500 px-3 py-1 rounded transition-colors font-semibold"
              title="Admin overview"
            >
              God View
            </Link>
          )}
          <span className="text-sm text-green-200">{session.user?.name || session.user?.email}</span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm bg-green-700 hover:bg-green-600 px-3 py-1 rounded transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </nav>
  );
}
