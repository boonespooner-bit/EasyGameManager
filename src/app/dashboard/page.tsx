"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Team {
  id: string;
  name: string;
  players: { id: string }[];
  _count: { games: number };
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [teamName, setTeamName] = useState("");

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
          {teams.map((team) => (
            <div
              key={team.id}
              onClick={() => router.push(`/team/${team.id}/roster`)}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer flex items-center justify-between"
            >
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{team.name}</h2>
                <div className="flex gap-4 mt-2 text-sm text-gray-500">
                  <span>{team.players.length} players</span>
                  <span>{team._count.games} games</span>
                </div>
              </div>
              <button
                onClick={(e) => deleteTeam(team.id, e)}
                className="text-red-500 hover:text-red-700 text-sm font-medium px-3 py-1"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
