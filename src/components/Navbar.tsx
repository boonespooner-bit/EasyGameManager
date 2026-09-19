"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { OWNER_EMAIL } from "@/lib/admin";

export default function Navbar() {
  const { data: session, update } = useSession();
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  if (!session) return null;

  const isOwner = session.user?.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();

  const saveName = async () => {
    if (!newName.trim() || saving) return;
    setSaving(true);
    const res = await fetch("/api/user/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    if (res.ok) {
      await update();
      setEditingName(false);
    }
    setSaving(false);
  };

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
              Admin View
            </Link>
          )}
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") setEditingName(false);
                }}
                className="text-sm text-gray-900 px-2 py-1 rounded border-none outline-none w-36"
                autoFocus
              />
              <button
                onClick={saveName}
                disabled={saving}
                className="text-sm text-green-200 hover:text-white font-medium"
              >
                Save
              </button>
              <button
                onClick={() => setEditingName(false)}
                className="text-sm text-green-300 hover:text-white"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setNewName(session.user?.name || "");
                setEditingName(true);
              }}
              className="text-sm text-green-200 hover:text-white transition-colors"
              title="Click to edit your name"
            >
              {session.user?.name || session.user?.email}
            </button>
          )}
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
