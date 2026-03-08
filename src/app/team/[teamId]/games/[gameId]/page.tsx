"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import BaseballField from "@/components/BaseballField";
import Link from "next/link";
import type { FieldPosition } from "@/types";
import { INNINGS } from "@/types";

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
  gameBattingOrder?: { playerId: string; order: number }[];
}

export default function GamePlanPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const teamId = params.teamId as string;
  const gameId = params.gameId as string;

  const [game, setGame] = useState<GameData | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [battingOrder, setBattingOrder] = useState<{ playerId: string; playerName: string; order: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pitchingMode, setPitchingMode] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

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

      // Build batting order: use per-game order if available, else team order
      const excludedIds = new Set((data.exclusions || []).map((e) => e.playerId));
      const activeIds = new Set(data.innings.map((i) => i.playerId));
      const activePlayers = data.team.players.filter(
        (p) => !excludedIds.has(p.id) || activeIds.has(p.id),
      );

      const gameOrder = data.gameBattingOrder || [];
      const gameOrderMap = new Map(gameOrder.map((o) => [o.playerId, o.order]));

      const ordered = activePlayers
        .map((p) => ({
          playerId: p.id,
          playerName: p.isPoolPlayer ? `${p.name} (pool)` : p.name,
          order: gameOrderMap.get(p.id) ?? p.battingOrder,
        }))
        .sort((a, b) => a.order - b.order)
        .map((item, i) => ({ ...item, order: i + 1 }));

      setBattingOrder(ordered);
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

  const handleBattingOrderUpdate = async (
    newOrder: { playerId: string; playerName: string; order: number }[],
  ) => {
    setBattingOrder(newOrder);
    setSaving(true);

    await fetch(`/api/teams/${teamId}/games/${gameId}/batting-order`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order: newOrder.map((o) => ({ playerId: o.playerId, order: o.order })),
      }),
    });

    setSaving(false);
  };

  // Get current pitchers from assignments
  const getCurrentPitchers = () => {
    return INNINGS.map((inning) => {
      const a = assignments.find((a) => a.position === "P" && a.inning === inning);
      return { inning, playerId: a?.playerId || null, playerName: a?.playerName || null };
    });
  };

  // Handle pitcher change: regenerate entire lineup with locked pitchers
  const handlePitcherChange = async (inning: number, playerId: string) => {
    const currentPitchers = getCurrentPitchers();
    const newPitchers = currentPitchers.map((p) => {
      if (p.inning === inning) {
        const player = game?.team.players.find((pl) => pl.id === playerId);
        return { inning, playerId, playerName: player?.name || "" };
      }
      return p;
    });

    // Build locked pitchers array (only non-null ones)
    const lockedPitchers = newPitchers
      .filter((p) => p.playerId !== null)
      .map((p) => ({ playerId: p.playerId, inning: p.inning }));

    setRegenerating(true);

    const res = await fetch(`/api/teams/${teamId}/games/${gameId}/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lockedPitchers }),
    });

    if (res.ok) {
      await fetchGame();
    }

    setRegenerating(false);
  };

  if (loading || !game) {
    return <div className="flex items-center justify-center py-20 text-gray-400">Loading...</div>;
  }

  const currentPitchers = getCurrentPitchers();

  // Get all active players for this game (for the pitcher picker)
  const excludedIds = new Set((game.exclusions || []).map((e) => e.playerId));
  const activePlayers = game.team.players.filter(
    (p) => !excludedIds.has(p.id),
  );

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
          {(saving || regenerating) && (
            <span className="text-xs text-gray-400">
              {regenerating ? "Regenerating lineup..." : "Saving..."}
            </span>
          )}
          {!game.isLocked && (
            <button
              onClick={() => setPitchingMode(!pitchingMode)}
              className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
                pitchingMode
                  ? "bg-orange-100 text-orange-700 hover:bg-orange-200"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {pitchingMode ? "Exit Pitching Mode" : "Prioritize Pitching"}
            </button>
          )}
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
        onBattingOrderUpdate={handleBattingOrderUpdate}
        pitchingMode={pitchingMode}
        allPlayers={activePlayers.map((p) => ({ id: p.id, name: p.isPoolPlayer ? `${p.name} (pool)` : p.name }))}
        onPitcherChange={handlePitcherChange}
        regenerating={regenerating}
      />
    </div>
  );
}
