"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Team {
  id: string;
  name: string;
  players: { id: string }[];
  members: { role: string; user: { id: string } }[];
  _count: { games: number };
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const fetchTeams = () => {
    fetch("/api/teams")
      .then((r) => r.json())
      .then((data) => { setTeams(data); setLoading(false); });
  };

  const deleteTeam = async (teamId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this team? This will delete all players and games.")) return;
    const res = await fetch(`/api/teams/${teamId}`, { method: "DELETE" });
    if (res.ok) fetchTeams();
  };

  const renameTeam = async (teamId: string) => {
    if (!editingName.trim()) return;
    const res = await fetch(`/api/teams/${teamId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editingName }),
    });
    if (res.ok) {
      setEditingTeamId(null);
      fetchTeams();
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") fetchTeams();
  }, [status]);

  const createTeam = async () => {
    if (!teamName.trim()) return;
    const res = await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: teamName }),
    });
    const team = await res.json();
    router.push(`/team/${team.id}/roster`);
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Teams</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-green-700 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-600 transition-colors"
        >
          + New Team
        </button>
      </div>

      {showCreate && (
        <div className="bg-white rounded-lg shadow-md p-4 mb-6 flex gap-3">
          <input
            type="text"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="Team name (e.g., Giants)"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
            onKeyDown={(e) => e.key === "Enter" && createTeam()}
            autoFocus
          />
          <button
            onClick={createTeam}
            className="bg-green-700 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-600"
          >
            Create
          </button>
          <button
            onClick={() => setShowCreate(false)}
            className="text-gray-500 hover:text-gray-700 px-2"
          >
            Cancel
          </button>
        </div>
      )}

      {teams.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl shadow-sm">
          <div className="text-5xl mb-4">&#9918;</div>
          <h2 className="text-xl font-semibold text-gray-700">No teams yet</h2>
          <p className="text-gray-500 mt-1">Create your first team to get started!</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {teams.map((team) => {
            const currentUserId = (session?.user as { id?: string })?.id;
            const isHeadCoach = team.members.some(
              (m) => m.user.id === currentUserId && m.role === "head_coach",
            );
            return (
            <div
              key={team.id}
              onClick={() => editingTeamId !== team.id && router.push(`/team/${team.id}/roster`)}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer flex items-center justify-between"
            >
              <div>
                {editingTeamId === team.id ? (
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") renameTeam(team.id);
                        if (e.key === "Escape") setEditingTeamId(null);
                      }}
                      className="border border-gray-300 rounded-lg px-3 py-1 text-lg font-semibold focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                      autoFocus
                    />
                    <button
                      onClick={() => renameTeam(team.id)}
                      className="text-green-700 hover:text-green-800 text-sm font-medium"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingTeamId(null)}
                      className="text-gray-400 hover:text-gray-600 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-gray-900">{team.name}</h2>
                    {isHeadCoach && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTeamId(team.id);
                        setEditingName(team.name);
                      }}
                      className="text-gray-400 hover:text-gray-600"
                      title="Rename team"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    )}
                  </div>
                )}
                <div className="flex gap-4 mt-2 text-sm text-gray-500">
                  <span>{team.players.length} players</span>
                  <span>{team._count.games} games</span>
                </div>
              </div>
              {isHeadCoach && (
              <button
                onClick={(e) => deleteTeam(team.id, e)}
                className="text-red-500 hover:text-red-700 text-sm font-medium px-3 py-1"
              >
                Delete
              </button>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
