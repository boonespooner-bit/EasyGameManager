"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { POSITIONS } from "@/types";
import Link from "next/link";

interface PlayerRating {
  position: string;
  rating: number;
}

interface Player {
  id: string;
  name: string;
  battingOrder: number;
  ratings: PlayerRating[];
}

interface TeamMember {
  id: string;
  role: string;
  user: { id: string; name: string | null; email: string };
}

interface Team {
  id: string;
  name: string;
  players: Player[];
  members: TeamMember[];
}

export default function RosterPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const teamId = params.teamId as string;

  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [showInvite, setShowInvite] = useState(false);

  const fetchTeam = useCallback(async () => {
    const res = await fetch(`/api/teams/${teamId}`);
    if (res.ok) {
      const data = await res.json();
      setTeam(data);
    }
    setLoading(false);
  }, [teamId]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated") fetchTeam();
  }, [status, router, fetchTeam]);

  if (loading || !team) {
    return <div className="flex items-center justify-center py-20 text-gray-400">Loading...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Team header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{team.name} Roster</h1>
          <p className="text-sm text-gray-500">{team.players.length}/12 players</p>
        </div>
        <div className="flex gap-3">
          <Link
            href={`/team/${teamId}/games`}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-500 transition-colors text-sm"
          >
            View Games
          </Link>
          {team.players.length < 12 && (
            <button
              onClick={() => setShowAddPlayer(true)}
              className="bg-green-700 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-600 transition-colors text-sm"
            >
              + Add Player
            </button>
          )}
        </div>
      </div>

      {/* Add Player Form */}
      {showAddPlayer && (
        <PlayerForm
          teamId={teamId}
          nextBattingOrder={team.players.length + 1}
          onSave={() => { setShowAddPlayer(false); fetchTeam(); }}
          onCancel={() => setShowAddPlayer(false)}
        />
      )}

      {/* Players table */}
      {team.players.length > 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Bat #</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Player</th>
                {POSITIONS.map((pos) => (
                  <th key={pos} className="text-center px-2 py-3 text-xs font-semibold text-gray-500 uppercase">
                    {pos}
                  </th>
                ))}
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {team.players
                .sort((a, b) => a.battingOrder - b.battingOrder)
                .map((player) => (
                  <tr key={player.id} className="border-b last:border-0 hover:bg-gray-50">
                    {editingPlayer === player.id ? (
                      <td colSpan={POSITIONS.length + 3} className="p-0">
                        <PlayerForm
                          teamId={teamId}
                          player={player}
                          nextBattingOrder={player.battingOrder}
                          onSave={() => { setEditingPlayer(null); fetchTeam(); }}
                          onCancel={() => setEditingPlayer(null)}
                        />
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm font-bold text-gray-400">{player.battingOrder}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{player.name}</td>
                        {POSITIONS.map((pos) => {
                          const r = player.ratings.find((r) => r.position === pos);
                          const rating = r?.rating ?? 0;
                          return (
                            <td key={pos} className="text-center px-2 py-3">
                              <RatingBadge rating={rating} />
                            </td>
                          );
                        })}
                        <td className="text-center px-4 py-3">
                          <button
                            onClick={() => setEditingPlayer(player.id)}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            Edit
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm">
          <p className="text-gray-500">No players yet. Add your 12 players to get started!</p>
        </div>
      )}

      {/* Coaches Section */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-900">Coaches</h2>
          {team.members.length < 7 && (
            <button
              onClick={() => setShowInvite(!showInvite)}
              className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors"
            >
              + Invite Coach
            </button>
          )}
        </div>

        {showInvite && (
          <div className="bg-white rounded-lg shadow-sm border p-4 mb-4 flex gap-3">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Coach email address"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-sm"
            />
            <button
              onClick={async () => {
                await fetch(`/api/teams/${teamId}/coaches`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email: inviteEmail, role: "assistant_coach" }),
                });
                setInviteEmail("");
                setShowInvite(false);
                fetchTeam();
              }}
              className="bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-600"
            >
              Invite
            </button>
          </div>
        )}

        <div className="grid gap-2">
          {team.members.map((m) => (
            <div key={m.id} className="bg-white rounded-lg border p-3 flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">{m.user.name || m.user.email}</span>
                <span className="ml-2 text-xs text-gray-400 capitalize">{m.role.replace("_", " ")}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RatingBadge({ rating }: { rating: number }) {
  let bg = "bg-gray-100 text-gray-400";
  if (rating >= 7) bg = "bg-green-100 text-green-700";
  else if (rating >= 4) bg = "bg-yellow-100 text-yellow-700";
  else if (rating >= 1) bg = "bg-red-100 text-red-700";

  return (
    <span className={`inline-block w-6 h-6 leading-6 rounded text-xs font-bold ${bg}`}>
      {rating || "—"}
    </span>
  );
}

function PlayerForm({
  teamId,
  player,
  nextBattingOrder,
  onSave,
  onCancel,
}: {
  teamId: string;
  player?: Player;
  nextBattingOrder: number;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(player?.name || "");
  const [battingOrder, setBattingOrder] = useState(player?.battingOrder || nextBattingOrder);
  const [ratings, setRatings] = useState<Record<string, number>>(() => {
    const r: Record<string, number> = {};
    for (const pos of POSITIONS) {
      r[pos] = player?.ratings.find((pr) => pr.position === pos)?.rating ?? 5;
    }
    return r;
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);

    const url = player
      ? `/api/teams/${teamId}/players/${player.id}`
      : `/api/teams/${teamId}/players`;

    await fetch(url, {
      method: player ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, battingOrder, ratings }),
    });

    setSaving(false);
    onSave();
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Player Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
            placeholder="Player name"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Batting Order</label>
          <input
            type="number"
            min={1}
            max={12}
            value={battingOrder}
            onChange={(e) => setBattingOrder(parseInt(e.target.value) || 1)}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
          />
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-600 mb-2">Position Ratings (1-9)</label>
        <div className="grid grid-cols-9 gap-2">
          {POSITIONS.map((pos) => (
            <div key={pos} className="text-center">
              <div className="text-xs font-bold text-gray-500 mb-1">{pos}</div>
              <select
                value={ratings[pos]}
                onChange={(e) =>
                  setRatings({ ...ratings, [pos]: parseInt(e.target.value) })
                }
                className="w-full border border-gray-300 rounded px-1 py-1.5 text-sm text-center focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none bg-white"
              >
                {[9, 8, 7, 6, 5, 4, 3, 2, 1].map((val) => (
                  <option key={val} value={val}>
                    {val}{val === 9 ? " ★" : val === 1 ? " ▽" : ""}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1">9 ★ = Best &nbsp; 1 ▽ = Worst</p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-green-700 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-green-600 disabled:opacity-50"
        >
          {saving ? "Saving..." : player ? "Update" : "Add Player"}
        </button>
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-700 px-3 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}
