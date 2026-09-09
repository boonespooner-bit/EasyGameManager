"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { OWNER_EMAIL } from "@/lib/admin";

interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  createdAt: string;
  teams: { id: string; name: string; role: string }[];
}

interface AdminGame {
  id: string;
  opponent: string;
  date: string;
  isLocked: boolean;
  inningCount: number;
}

interface AdminTeam {
  id: string;
  name: string;
  createdAt: string;
  playerCount: number;
  members: { userId: string; name: string | null; email: string; role: string }[];
  games: AdminGame[];
}

interface AdminData {
  users: AdminUser[];
  teams: AdminTeam[];
  stats: {
    totalUsers: number;
    totalTeams: number;
    totalGames: number;
    lockedGames: number;
  };
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/admin/overview");
    if (res.ok) {
      setData(await res.json());
    } else if (res.status === 403) {
      setError("This view is only available to the account owner.");
    } else {
      setError("Failed to load admin data.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated") {
      const email = session?.user?.email?.toLowerCase();
      if (email !== OWNER_EMAIL.toLowerCase()) {
        setError("This view is only available to the account owner.");
        setLoading(false);
        return;
      }
      fetchData();
    }
  }, [status, router, fetchData, session]);

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-gray-400">Loading...</div>;
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="inline-block bg-red-50 border border-red-200 rounded-lg px-6 py-4 text-red-700">
          {error}
        </div>
        <div className="mt-4">
          <Link href="/dashboard" className="text-sm text-green-700 hover:underline">
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">God View</h1>
          <p className="text-sm text-gray-500">
            All users, teams, and games on Easy Game Manager
          </p>
        </div>
        <Link href="/dashboard" className="text-sm text-green-700 hover:underline">
          &larr; Back to Dashboard
        </Link>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard label="Users" value={data.stats.totalUsers} color="bg-blue-50 text-blue-800 border-blue-200" />
        <StatCard label="Teams" value={data.stats.totalTeams} color="bg-green-50 text-green-800 border-green-200" />
        <StatCard label="Games" value={data.stats.totalGames} color="bg-purple-50 text-purple-800 border-purple-200" />
        <StatCard label="Locked Games" value={data.stats.lockedGames} color="bg-amber-50 text-amber-800 border-amber-200" />
      </div>

      {/* Users */}
      <section className="mb-10">
        <h2 className="text-lg font-bold text-gray-900 mb-3">
          Users ({data.users.length})
        </h2>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Name</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Email</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Signed Up</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Teams</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900">
                    {u.name || <span className="text-gray-400 italic">no name</span>}
                    {u.email.toLowerCase() === OWNER_EMAIL.toLowerCase() && (
                      <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold uppercase">
                        Owner
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{u.email}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2">
                    {u.teams.length === 0 ? (
                      <span className="text-gray-400 italic text-xs">none</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {u.teams.map((t) => (
                          <span
                            key={t.id}
                            className="text-xs bg-blue-50 border border-blue-200 text-blue-700 rounded px-2 py-0.5"
                            title={t.role}
                          >
                            {t.name}{" "}
                            <span className="text-blue-400">({t.role.replace("_", " ")})</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {data.users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400 italic">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Teams + Games */}
      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-3">
          Teams ({data.teams.length})
        </h2>
        <div className="space-y-3">
          {data.teams.map((t) => {
            const open = expandedTeam === t.id;
            return (
              <div key={t.id} className="bg-white rounded-lg border border-gray-200 shadow-sm">
                <button
                  onClick={() => setExpandedTeam(open ? null : t.id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                >
                  <div>
                    <div className="font-semibold text-gray-900">{t.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {t.playerCount} player{t.playerCount === 1 ? "" : "s"} &middot;{" "}
                      {t.members.length} coach{t.members.length === 1 ? "" : "es"} &middot;{" "}
                      {t.games.length} game{t.games.length === 1 ? "" : "s"} &middot; created{" "}
                      {new Date(t.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <span className="text-gray-400 text-xl leading-none select-none">
                    {open ? "–" : "+"}
                  </span>
                </button>

                {open && (
                  <div className="border-t border-gray-100 px-4 py-3 space-y-3">
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Coaches</div>
                      <div className="flex flex-wrap gap-2">
                        {t.members.map((m) => (
                          <div
                            key={m.userId}
                            className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1"
                          >
                            <span className="font-medium text-gray-800">
                              {m.name || m.email.split("@")[0]}
                            </span>
                            <span className="text-gray-400 ml-1">({m.role.replace("_", " ")})</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                        Games
                      </div>
                      {t.games.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No games yet.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {t.games.map((g) => (
                            <div
                              key={g.id}
                              className={`border rounded-lg px-3 py-2 text-sm ${
                                g.isLocked
                                  ? "bg-green-50 border-green-200"
                                  : "bg-blue-50 border-blue-200"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-gray-900">vs {g.opponent}</span>
                                <span
                                  className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                                    g.isLocked
                                      ? "bg-green-200 text-green-800"
                                      : "bg-blue-200 text-blue-800"
                                  }`}
                                >
                                  {g.isLocked ? "Locked" : "Draft"}
                                </span>
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                {new Date(g.date).toLocaleDateString()} &middot;{" "}
                                {g.inningCount} inning row{g.inningCount === 1 ? "" : "s"}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {data.teams.length === 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-400 italic">
              No teams yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`border rounded-lg px-4 py-3 ${color}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs uppercase font-semibold tracking-wide opacity-80">{label}</div>
    </div>
  );
}
