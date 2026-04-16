"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
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
  hasPitched: boolean;
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
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [pitchingToggles, setPitchingToggles] = useState<Record<string, boolean>>({});

  const fetchTeam = useCallback(async () => {
    const res = await fetch(`/api/teams/${teamId}`);
    if (res.ok) {
      const data = await res.json();
      setTeam(data);
      const toggles: Record<string, boolean> = {};
      for (const p of (data.players as Player[])) {
        toggles[p.id] = p.hasPitched ?? false;
      }
      setPitchingToggles(toggles);
    }
    setLoading(false);
  }, [teamId]);

  const handlePitchedToggle = async (playerId: string) => {
    const next = !pitchingToggles[playerId];
    setPitchingToggles((prev) => ({ ...prev, [playerId]: next }));
    await fetch(`/api/teams/${teamId}/players/${playerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hasPitched: next }),
    });
  };

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated") fetchTeam();
  }, [status, router, fetchTeam]);

  const sortedPlayers = team?.players.slice().sort((a, b) => a.battingOrder - b.battingOrder) ?? [];

  const handleBattingDrop = async (targetIdx: number) => {
    if (dragIndex === null || dragIndex === targetIdx || !team) return;

    const reordered = [...sortedPlayers];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIdx, 0, moved);

    const order = reordered.map((p, i) => ({ playerId: p.id, battingOrder: i + 1 }));

    // Optimistic update
    const updatedPlayers = team.players.map((p) => {
      const newOrder = order.find((o) => o.playerId === p.id);
      return newOrder ? { ...p, battingOrder: newOrder.battingOrder } : p;
    });
    setTeam({ ...team, players: updatedPlayers });
    setDragIndex(null);
    setDragOverIndex(null);

    await fetch(`/api/teams/${teamId}/players`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order }),
    });
  };

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
        <>
          <p className="text-xs text-gray-400 mb-2">Drag rows to reorder batting order</p>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="w-8 px-2 py-3"></th>
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
                {sortedPlayers.map((player, idx) => (
                  <tr
                    key={player.id}
                    className={`border-b last:border-0 transition-colors ${
                      dragOverIndex === idx ? "bg-blue-50 border-t-2 border-t-blue-400" : "hover:bg-gray-50"
                    } ${dragIndex === idx ? "opacity-40" : ""}`}
                    draggable={editingPlayer !== player.id}
                    onDragStart={() => setDragIndex(idx)}
                    onDragOver={(e) => { e.preventDefault(); setDragOverIndex(idx); }}
                    onDragLeave={() => setDragOverIndex(null)}
                    onDrop={() => handleBattingDrop(idx)}
                    onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                  >
                    {editingPlayer === player.id ? (
                      <td colSpan={POSITIONS.length + 4} className="p-0">
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
                        <td className="px-2 py-3 text-gray-300 cursor-grab active:cursor-grabbing text-center">
                          <span className="text-lg leading-none select-none">&#8801;</span>
                        </td>
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
                          {confirmDeleteId === player.id ? (
                            <div className="flex items-center justify-center gap-2">
                              <span className="text-xs text-red-600 font-medium">Delete?</span>
                              <button
                                onClick={async () => {
                                  const res = await fetch(`/api/teams/${teamId}/players/${player.id}`, { method: "DELETE" });
                                  if (res.ok) fetchTeam();
                                  setConfirmDeleteId(null);
                                }}
                                className="text-white bg-red-600 hover:bg-red-700 text-xs font-medium px-2 py-0.5 rounded"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="text-gray-500 hover:text-gray-700 text-xs font-medium px-2 py-0.5 rounded border border-gray-300"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-3">
                              <button
                                onClick={() => setEditingPlayer(player.id)}
                                className="text-blue-500 hover:text-blue-700 transition-colors"
                                title="Edit player"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                  <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(player.id)}
                                className="text-red-400 hover:text-red-600 transition-colors"
                                title="Delete player"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                  <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm">
          <p className="text-gray-500">No players yet. Add your 12 players to get started!</p>
        </div>
      )}

      {/* Pitching Tracker */}
      {sortedPlayers.length > 0 && (() => {
        const pitchedCount = sortedPlayers.filter((p) => pitchingToggles[p.id]).length;
        const notYet = sortedPlayers.filter((p) => !pitchingToggles[p.id]);
        const hasPitched = sortedPlayers.filter((p) => pitchingToggles[p.id]);
        return (
          <div className="mt-8">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-lg font-bold text-gray-900">Pitching Tracker</h2>
              <span className="text-sm text-gray-500">
                {pitchedCount} of {sortedPlayers.length} have taken the mound
              </span>
              {pitchedCount === sortedPlayers.length && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">
                  All players have pitched!
                </span>
              )}
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              {notYet.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Needs to pitch ({notYet.length})
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {notYet.map((p) => (
                      <label
                        key={p.id}
                        className="flex items-center gap-2 cursor-pointer group px-3 py-2 rounded-lg border border-orange-100 bg-orange-50 hover:bg-orange-100 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={false}
                          onChange={() => handlePitchedToggle(p.id)}
                          className="w-4 h-4 rounded accent-green-600 cursor-pointer"
                        />
                        <span className="text-sm text-gray-800 truncate">{p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {hasPitched.length > 0 && (
                <div>
                  {notYet.length > 0 && (
                    <div className="border-t border-gray-100 mb-3" />
                  )}
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Has pitched ({hasPitched.length})
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {hasPitched.map((p) => (
                      <label
                        key={p.id}
                        className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border border-green-100 bg-green-50 hover:bg-green-100 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={true}
                          onChange={() => handlePitchedToggle(p.id)}
                          className="w-4 h-4 rounded accent-green-600 cursor-pointer"
                        />
                        <span className="text-sm text-gray-600 truncate line-through decoration-green-400">
                          {p.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

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
  if (rating === 0) {
    return (
      <span className="inline-block w-8 h-6 leading-6 rounded text-[10px] font-bold bg-gray-800 text-gray-200">
        DNP
      </span>
    );
  }

  let bg = "bg-gray-100 text-gray-400";
  if (rating >= 7) bg = "bg-green-100 text-green-700";
  else if (rating >= 4) bg = "bg-yellow-100 text-yellow-700";
  else if (rating >= 1) bg = "bg-red-100 text-red-700";

  return (
    <span className={`inline-block w-6 h-6 leading-6 rounded text-xs font-bold ${bg}`}>
      {rating || "\u2014"}
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
                {[9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map((val) => (
                  <option key={val} value={val}>
                    {val === 0 ? "DNP" : val}{val === 9 ? " \u2605" : val === 1 ? " \u25BD" : ""}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1">9 \u2605 = Best &nbsp; 1 \u25BD = Worst &nbsp; DNP = Do Not Play</p>
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
