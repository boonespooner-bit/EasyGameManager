"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { POSITIONS, type Position } from "@/types";

interface RosterPlayer {
  id: string;
  name: string;
  battingOrder: number;
}

interface PoolPlayerInput {
  name: string;
  ratings: Record<string, number>;
}

export default function NewGamePage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const teamId = params.teamId as string;

  const [opponent, setOpponent] = useState("");
  const [date, setDate] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const [rosterPlayers, setRosterPlayers] = useState<RosterPlayer[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

  const [poolPlayers, setPoolPlayers] = useState<PoolPlayerInput[]>([]);
  const [showPoolForm, setShowPoolForm] = useState(false);
  const [poolName, setPoolName] = useState("");
  const [poolRatings, setPoolRatings] = useState<Record<string, number>>(() => {
    const r: Record<string, number> = {};
    POSITIONS.forEach((p) => (r[p] = 5));
    return r;
  });

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    async function fetchRoster() {
      const res = await fetch(`/api/teams/${teamId}/players`);
      if (res.ok) {
        const players = await res.json();
        setRosterPlayers(players);
      }
      setLoadingRoster(false);
    }
    if (status === "authenticated") fetchRoster();
  }, [status, teamId]);

  const toggleExclude = (playerId: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  };

  const addPoolPlayer = () => {
    if (!poolName.trim()) return;
    setPoolPlayers([...poolPlayers, { name: poolName.trim(), ratings: { ...poolRatings } }]);
    setPoolName("");
    const r: Record<string, number> = {};
    POSITIONS.forEach((p) => (r[p] = 5));
    setPoolRatings(r);
    setShowPoolForm(false);
  };

  const removePoolPlayer = (index: number) => {
    setPoolPlayers(poolPlayers.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    if (!opponent.trim() || !date) return;
    setCreating(true);
    setError("");

    const res = await fetch(`/api/teams/${teamId}/games`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        opponent,
        date,
        excludedPlayerIds: Array.from(excludedIds),
        poolPlayers,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create game");
      setCreating(false);
      return;
    }

    const game = await res.json();
    router.push(`/team/${teamId}/games/${game.id}`);
  };

  const availableCount =
    rosterPlayers.length - excludedIds.size + poolPlayers.length;

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Create New Game</h1>

      <div className="bg-white rounded-lg shadow-sm border p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Opponent Team</label>
          <input
            type="text"
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            placeholder="e.g., Cardinals"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Game Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
          />
        </div>

        {/* Player Availability */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Player Availability ({availableCount} players)
          </label>
          {loadingRoster ? (
            <p className="text-sm text-gray-400">Loading roster...</p>
          ) : rosterPlayers.length === 0 ? (
            <p className="text-sm text-gray-400">No players on roster yet.</p>
          ) : (
            <div className="space-y-1 max-h-60 overflow-y-auto border rounded-lg p-2">
              {rosterPlayers.map((player) => (
                <label
                  key={player.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={!excludedIds.has(player.id)}
                    onChange={() => toggleExclude(player.id)}
                    className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <span className={`text-sm ${excludedIds.has(player.id) ? "text-gray-400 line-through" : "text-gray-900"}`}>
                    {player.name}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Pool Players */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Pool Players (Temporary)
          </label>

          {poolPlayers.length > 0 && (
            <div className="space-y-1 mb-2">
              {poolPlayers.map((pp, i) => (
                <div key={i} className="flex items-center justify-between px-2 py-1.5 bg-blue-50 rounded">
                  <span className="text-sm text-blue-800">{pp.name} (pool)</span>
                  <button
                    onClick={() => removePoolPlayer(i)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {showPoolForm ? (
            <div className="border rounded-lg p-3 space-y-3 bg-gray-50">
              <input
                type="text"
                value={poolName}
                onChange={(e) => setPoolName(e.target.value)}
                placeholder="Pool player name"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
              <div className="grid grid-cols-3 gap-2">
                {POSITIONS.map((pos) => (
                  <div key={pos} className="flex items-center gap-1">
                    <label className="text-xs text-gray-600 w-8">{pos}</label>
                    <input
                      type="number"
                      min={1}
                      max={9}
                      value={poolRatings[pos]}
                      onChange={(e) =>
                        setPoolRatings({ ...poolRatings, [pos]: parseInt(e.target.value) || 1 })
                      }
                      className="w-14 border border-gray-300 rounded px-1.5 py-1 text-xs text-center"
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={addPoolPlayer}
                  disabled={!poolName.trim()}
                  className="bg-blue-600 text-white px-3 py-1 rounded text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
                >
                  Add
                </button>
                <button
                  onClick={() => setShowPoolForm(false)}
                  className="text-gray-500 text-sm hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowPoolForm(true)}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              + Add Pool Player
            </button>
          )}
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleCreate}
            disabled={creating || !opponent.trim() || !date}
            className="bg-green-700 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-600 disabled:opacity-50 transition-colors"
          >
            {creating ? "Creating..." : "Create Game Plan"}
          </button>
          <button
            onClick={() => router.back()}
            className="text-gray-500 hover:text-gray-700 px-4 py-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
