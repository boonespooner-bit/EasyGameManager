"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import BaseballField from "@/components/BaseballField";
import Link from "next/link";
import type { FieldPosition } from "@/types";

interface Assignment {
  playerId: string;
  playerName: string;
  inning: number;
  position: FieldPosition;
  player?: { name: string };
}

interface GameData {
  id: string;
  opponent: string;
  date: string;
  isLocked: boolean;
  team: {
    name: string;
    players: {
      id: string;
      name: string;
      battingOrder: number;
      isPoolPlayer?: boolean;
      ratings: { position: string; rating: number }[];
    }[];
  };
  innings: {
    playerId: string;
    inning: number;
    position: string;
    player: { name: string };
  }[];
  exclusions?: { playerId: string }[];
  poolPlayers?: { id: string; name: string }[];
}

export default function GamePlanPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const teamId = params.teamId as string;
  const gameId = params.gameId as string;

  const [game, setGame] = useState<GameData | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchGame = useCallback(async () => {
    const res = await fetch(`/api/teams/${teamId}/games/${gameId}`);
    if (res.ok) {
      const data: GameData = await res.json();
      setGame(data);
      setAssignments(
        data.innings.map((i) => ({
          playerId: i.playerId,
          playerName: i.player.name,
          inning: i.inning,
          position: i.position as FieldPosition,
        })),
      );
    }
    setLoading(false);
  }, [teamId, gameId]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated") fetchGame();
  }, [status, router, fetchGame]);

  const handleUpdate = async (updated: Assignment[]) => {
    setAssignments(updated);
    setSaving(true);

    await fetch(`/api/teams/${teamId}/games/${gameId}/assignments`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignments: updated.map((a) => ({
          playerId: a.playerId,
          inning: a.inning,
          position: a.position,
        })),
      }),
    });

    setSaving(false);
  };

  const toggleLock = async () => {
    const res = await fetch(`/api/teams/${teamId}/games/${gameId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isLocked: !game?.isLocked }),
    });
    if (res.ok) fetchGame();
  };

  if (loading || !game) {
    return <div className="flex items-center justify-center py-20 text-gray-400">Loading...</div>;
  }

  const excludedPlayerIds = new Set((game.exclusions || []).map((e) => e.playerId));
  const activePlayerIds = new Set(
    assignments.map((a) => a.playerId),
  );

  const battingOrder = game.team.players
    .filter((p) => !excludedPlayerIds.has(p.id) || activePlayerIds.has(p.id))
    .sort((a, b) => a.battingOrder - b.battingOrder)
    .map((p) => ({
      playerId: p.id,
      playerName: p.isPoolPlayer ? `${p.name} (pool)` : p.name,
      order: p.battingOrder,
    }));

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <Link
          href={`/team/${teamId}/games`}
          className="text-sm text-green-700 hover:underline"
        >
          &larr; Back to Games
        </Link>
        <div className="flex items-center gap-3">
          {saving && <span className="text-xs text-gray-400">Saving...</span>}
          <button
            onClick={toggleLock}
            className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
              game.isLocked
                ? "bg-green-100 text-green-700 hover:bg-green-200"
                : "bg-red-100 text-red-700 hover:bg-red-200"
            }`}
          >
            {game.isLocked ? "Unlock Game" : "Lock Game (Finalize)"}
          </button>
        </div>
      </div>

      {((game.exclusions && game.exclusions.length > 0) || (game.poolPlayers && game.poolPlayers.length > 0)) && (
        <div className="flex flex-wrap gap-2 mb-3 text-xs">
          {game.exclusions && game.exclusions.length > 0 && (
            <span className="bg-red-50 text-red-700 px-2 py-1 rounded">
              Absent: {game.exclusions.map((e) => {
                const player = game!.team.players.find((p) => p.id === e.playerId);
                return player?.name || "Unknown";
              }).join(", ")}
            </span>
          )}
          {game.poolPlayers && game.poolPlayers.length > 0 && (
            <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded">
              Pool: {game.poolPlayers.map((p) => p.name).join(", ")}
            </span>
          )}
        </div>
      )}

      <BaseballField
        assignments={assignments}
        battingOrder={battingOrder}
        opponent={game.opponent}
        date={game.date}
        teamName={game.team.name}
        isLocked={game.isLocked}
        onUpdate={handleUpdate}
      />
    </div>
  );
}
