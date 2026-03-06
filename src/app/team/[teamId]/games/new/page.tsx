"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function NewGamePage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const teamId = params.teamId as string;

  const [opponent, setOpponent] = useState("");
  const [date, setDate] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const handleCreate = async () => {
    if (!opponent.trim() || !date) return;
    setCreating(true);
    setError("");

    const res = await fetch(`/api/teams/${teamId}/games`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opponent, date }),
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

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Create New Game</h1>

      <div className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
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
