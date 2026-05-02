"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import BaseballField from "@/components/BaseballField";
import Link from "next/link";
import type { FieldPosition } from "@/types";
import { INNINGS, POSITIONS } from "@/types";

interface Assignment {
  playerId: string;
  playerName: string;
  playerFirstName?: string;
  jerseyNumber?: string | null;
  inning: number;
  position: FieldPosition;
  player?: { name: string; firstName?: string; jerseyNumber?: string | null };
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
      firstName?: string;
      lastName?: string;
      jerseyNumber?: string | null;
      battingOrder: number;
      isPoolPlayer?: boolean;
      ratings: { position: string; rating: number }[];
    }[];
  };
  innings: {
    playerId: string;
    inning: number;
    position: string;
    player: { name: string; firstName?: string; jerseyNumber?: string | null };
  }[];
  exclusions?: { playerId: string }[];
  poolPlayers?: { id: string; name: string }[];
  gameBattingOrder?: { playerId: string; order: number }[];
  gameBalls?: { id: string; playerId: string; reason: string }[];
  heldPositions?: { playerId: string; inning: number; position: string }[];
  previousGameBench?: { date: string; opponent: string; players: string[] } | null;
}

export default function GamePlanPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const teamId = params.teamId as string;
  const gameId = params.gameId as string;

  const [game, setGame] = useState<GameData | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [battingOrder, setBattingOrder] = useState<{ playerId: string; playerName: string; jerseyNumber?: string | null; order: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pitchingMode, setPitchingMode] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [heldPositions, setHeldPositions] = useState<{ playerId: string; inning: number; position: string }[]>([]);
  const [swapDialog, setSwapDialog] = useState<{
    inning: number;
    targetPosition: string;
    selectedPlayerId: string;
    selectedPlayerName: string;
    currentPosition: string;
    currentPlayerId: string;
    currentPlayerName: string;
  } | null>(null);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [rosterUpdating, setRosterUpdating] = useState<string | null>(null);
  const [showPoolForm, setShowPoolForm] = useState(false);
  const [poolName, setPoolName] = useState("");
  const [poolRatings, setPoolRatings] = useState<Record<string, number>>(() => {
    const r: Record<string, number> = {};
    POSITIONS.forEach((p) => (r[p] = 5));
    return r;
  });
  const [suggestedAssignments, setSuggestedAssignments] = useState<Assignment[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  const fetchGame = useCallback(async (restoreHeldPositions = true) => {
    const res = await fetch(`/api/teams/${teamId}/games/${gameId}`);
    if (res.ok) {
      const data: GameData = await res.json();
      setGame(data);
      setAssignments(
        data.innings.map((i) => ({
          playerId: i.playerId,
          playerName: i.player.name,
          playerFirstName: i.player.firstName || i.player.name.split(" ")[0],
          jerseyNumber: i.player.jerseyNumber,
          inning: i.inning,
          position: i.position as FieldPosition,
        })),
      );

      // Restore held positions from DB on initial load
      if (restoreHeldPositions && data.heldPositions && data.heldPositions.length > 0) {
        setHeldPositions(data.heldPositions);
      }

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
          jerseyNumber: p.jerseyNumber,
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

  const saveHeldPositions = useCallback(async (positions: { playerId: string; inning: number; position: string }[]) => {
    await fetch(`/api/teams/${teamId}/games/${gameId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ heldPositions: positions }),
    });
  }, [teamId, gameId]);

  const toggleLock = async () => {
    // When locking, save current held positions; when unlocking, preserve them
    const res = await fetch(`/api/teams/${teamId}/games/${gameId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isLocked: !game?.isLocked,
        heldPositions: heldPositions,
      }),
    });
    if (res.ok) fetchGame(false); // Don't overwrite held positions from DB on toggle
  };

  const handleBattingOrderUpdate = async (
    newOrder: { playerId: string; playerName: string; jerseyNumber?: string | null; order: number }[],
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

  // Handle pitcher change: regenerate entire lineup with locked pitchers + held positions
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
      .map((p) => ({ playerId: p.playerId!, inning: p.inning }));

    setRegenerating(true);

    const res = await fetch(`/api/teams/${teamId}/games/${gameId}/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lockedPitchers,
        lockedPositions: heldPositions.length > 0 ? heldPositions : undefined,
      }),
    });

    if (res.ok) {
      await fetchGame(false);
    }

    setRegenerating(false);
  };

  // Handle unassigning a position: remove from held and regenerate
  const handlePositionUnassign = async (inning: number, position: string) => {
    const newHeld = heldPositions.filter(
      (h) => !(h.inning === inning && h.position === position),
    );
    setHeldPositions(newHeld);

    const lockedPitchers = pitchingMode
      ? getCurrentPitchers()
          .filter((p) => p.playerId !== null)
          .map((p) => ({ playerId: p.playerId!, inning: p.inning }))
      : [];

    setRegenerating(true);

    const res = await fetch(`/api/teams/${teamId}/games/${gameId}/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lockedPitchers: lockedPitchers.length > 0 ? lockedPitchers : undefined,
        lockedPositions: newHeld.length > 0 ? newHeld : undefined,
      }),
    });

    if (res.ok) {
      await fetchGame(false);
    }

    setRegenerating(false);
    saveHeldPositions(newHeld);
  };

  // Handle unassigning a pitcher: remove from pitching holds and regenerate
  const handlePitcherUnassign = async (inning: number) => {
    const currentPitchers = getCurrentPitchers();
    const lockedPitchers = currentPitchers
      .filter((p) => p.playerId !== null && p.inning !== inning)
      .map((p) => ({ playerId: p.playerId!, inning: p.inning }));

    setRegenerating(true);

    const res = await fetch(`/api/teams/${teamId}/games/${gameId}/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lockedPitchers: lockedPitchers.length > 0 ? lockedPitchers : undefined,
        lockedPositions: heldPositions.length > 0 ? heldPositions : undefined,
      }),
    });

    if (res.ok) {
      await fetchGame(false);
    }

    setRegenerating(false);
  };

  // Handle any position change: add to held positions and regenerate
  const handlePositionChange = async (inning: number, position: string, playerId: string) => {
    // Check if the selected player is already assigned to a HELD position in this inning
    const playerCurrentAssignment = assignments.find(
      (a) => a.playerId === playerId && a.inning === inning && a.position !== position,
    );
    if (playerCurrentAssignment) {
      const isCurrentPositionHeld = heldPositions.some(
        (h) => h.inning === inning && h.position === playerCurrentAssignment.position && h.playerId === playerId,
      );
      if (isCurrentPositionHeld) {
        // The player is locked at another position — show swap dialog
        const currentPlayerAtTarget = assignments.find(
          (a) => a.inning === inning && a.position === position,
        );
        const player = game?.team.players.find((p) => p.id === playerId);
        setSwapDialog({
          inning,
          targetPosition: position,
          selectedPlayerId: playerId,
          selectedPlayerName: player?.name || playerCurrentAssignment.playerName,
          currentPosition: playerCurrentAssignment.position,
          currentPlayerId: currentPlayerAtTarget?.playerId || "",
          currentPlayerName: currentPlayerAtTarget?.playerName || "",
        });
        return;
      }
    }

    // Also check: if the TARGET position has a held player, and the selected player
    // is already assigned elsewhere in this inning, offer a swap
    const targetHeld = heldPositions.find(
      (h) => h.inning === inning && h.position === position,
    );
    if (targetHeld && playerCurrentAssignment) {
      const player = game?.team.players.find((p) => p.id === playerId);
      const currentPlayerAtTarget = assignments.find(
        (a) => a.inning === inning && a.position === position,
      );
      setSwapDialog({
        inning,
        targetPosition: position,
        selectedPlayerId: playerId,
        selectedPlayerName: player?.name || playerCurrentAssignment.playerName,
        currentPosition: playerCurrentAssignment.position,
        currentPlayerId: currentPlayerAtTarget?.playerId || "",
        currentPlayerName: currentPlayerAtTarget?.playerName || "",
      });
      return;
    }

    await executePositionChange(inning, position, playerId);
  };

  const executePositionChange = async (inning: number, position: string, playerId: string) => {
    // Direct swap: find where the selected player currently is, and who's at the target
    const playerCurrentAssignment = assignments.find(
      (a) => a.playerId === playerId && a.inning === inning,
    );
    const targetAssignment = assignments.find(
      (a) => a.position === position && a.inning === inning,
    );

    const updated = assignments.map((a) => {
      // Move selected player to target position
      if (a.playerId === playerId && a.inning === inning && playerCurrentAssignment) {
        return { ...a, position: position as FieldPosition };
      }
      // Move displaced player to selected player's old position
      if (targetAssignment && a.playerId === targetAssignment.playerId && a.inning === inning && a.position === position && playerCurrentAssignment) {
        return { ...a, position: playerCurrentAssignment.position as FieldPosition };
      }
      return a;
    });

    // Update held positions — don't treat BENCH as a held position
    const filteredHeld = heldPositions.filter(
      (h) => !(h.inning === inning && h.position === position) &&
             !(h.inning === inning && h.playerId === playerId),
    );
    const newHeld = position === "BENCH"
      ? filteredHeld
      : [...filteredHeld, { playerId, inning, position }];
    setHeldPositions(newHeld);
    setAssignments(updated);

    // Save directly — no regeneration
    setSaving(true);
    await Promise.all([
      fetch(`/api/teams/${teamId}/games/${gameId}/assignments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignments: updated.map((a) => ({
            playerId: a.playerId,
            inning: a.inning,
            position: a.position,
          })),
        }),
      }),
      saveHeldPositions(newHeld),
    ]);
    setSaving(false);
  };

  const handleSwapConfirm = async () => {
    if (!swapDialog) return;
    const { inning, targetPosition, selectedPlayerId, currentPosition, currentPlayerId } = swapDialog;

    // Direct swap: only move the two players involved, no regeneration
    const updated = assignments.map((a) => {
      // Move selected player to target position
      if (a.playerId === selectedPlayerId && a.inning === inning && a.position === currentPosition) {
        return { ...a, position: targetPosition as FieldPosition };
      }
      // Move displaced player to selected player's old position
      if (currentPlayerId && a.playerId === currentPlayerId && a.inning === inning && a.position === targetPosition) {
        return { ...a, position: currentPosition as FieldPosition };
      }
      return a;
    });

    // Update held positions to reflect the swap — don't treat BENCH as a held position
    const newHeld = heldPositions.filter(
      (h) => !(h.inning === inning && (h.position === targetPosition || h.position === currentPosition)) &&
             !(h.inning === inning && (h.playerId === selectedPlayerId || (currentPlayerId && h.playerId === currentPlayerId))),
    );
    if (targetPosition !== "BENCH") {
      newHeld.push({ playerId: selectedPlayerId, inning, position: targetPosition });
    }
    if (currentPlayerId && currentPosition !== "BENCH") {
      newHeld.push({ playerId: currentPlayerId, inning, position: currentPosition });
    }

    setAssignments(updated);
    setHeldPositions(newHeld);
    setSwapDialog(null);

    // Save both assignments and held positions directly (no regeneration)
    setSaving(true);
    await Promise.all([
      fetch(`/api/teams/${teamId}/games/${gameId}/assignments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignments: updated.map((a) => ({
            playerId: a.playerId,
            inning: a.inning,
            position: a.position,
          })),
        }),
      }),
      saveHeldPositions(newHeld),
    ]);
    setSaving(false);
  };

  const handleGameInfoUpdate = async (newOpponent: string, newDate: string) => {
    setSaving(true);
    const res = await fetch(`/api/teams/${teamId}/games/${gameId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opponent: newOpponent, date: newDate }),
    });
    if (res.ok) {
      await fetchGame();
    }
    setSaving(false);
  };

  const handleGameBallUpdate = async (playerId: string, reason: string, id?: string) => {
    await fetch(`/api/teams/${teamId}/games/${gameId}/game-ball`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, reason, id }),
    });
    await fetchGame();
  };

  const handleGameBallRemove = async (id: string) => {
    await fetch(`/api/teams/${teamId}/games/${gameId}/game-ball?id=${id}`, {
      method: "DELETE",
    });
    await fetchGame();
  };

  const handleRosterToggle = async (playerId: string, action: "exclude" | "include") => {
    setRosterUpdating(playerId);
    await fetch(`/api/teams/${teamId}/games/${gameId}/roster`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, playerId }),
    });
    setHeldPositions([]);
    await fetchGame();
    setRosterUpdating(null);
  };

  const handleAddPoolPlayer = async () => {
    if (!poolName.trim()) return;
    setRosterUpdating("adding-pool");
    await fetch(`/api/teams/${teamId}/games/${gameId}/roster`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "addPool", name: poolName.trim(), ratings: poolRatings }),
    });
    setPoolName("");
    const r: Record<string, number> = {};
    POSITIONS.forEach((p) => (r[p] = 5));
    setPoolRatings(r);
    setShowPoolForm(false);
    setHeldPositions([]);
    await fetchGame();
    setRosterUpdating(null);
  };

  const handleRemovePoolPlayer = async (playerId: string) => {
    setRosterUpdating(playerId);
    await fetch(`/api/teams/${teamId}/games/${gameId}/roster`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "removePool", playerId }),
    });
    setHeldPositions([]);
    await fetchGame();
    setRosterUpdating(null);
  };

  const handleSuggestPositions = async () => {
    setSuggesting(true);
    const res = await fetch(`/api/teams/${teamId}/games/${gameId}/suggest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const data = await res.json();
      const mapped: Assignment[] = data.suggestions.map((s: { playerId: string; playerName: string; inning: number; position: string }) => {
        const player = game?.team.players.find((p) => p.id === s.playerId);
        return {
          playerId: s.playerId,
          playerName: s.playerName,
          playerFirstName: player?.firstName || s.playerName.split(" ")[0],
          jerseyNumber: player?.jerseyNumber,
          inning: s.inning,
          position: s.position as FieldPosition,
        };
      });
      setSuggestedAssignments(mapped);
    }
    setSuggesting(false);
  };

  const handleAcceptSuggestions = async () => {
    if (!suggestedAssignments) return;
    setAssignments(suggestedAssignments);
    setSuggestedAssignments(null);
    setHeldPositions([]);

    setSaving(true);
    await Promise.all([
      fetch(`/api/teams/${teamId}/games/${gameId}/assignments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignments: suggestedAssignments.map((a) => ({
            playerId: a.playerId,
            inning: a.inning,
            position: a.position,
          })),
        }),
      }),
      saveHeldPositions([]),
    ]);
    setSaving(false);
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
      <div className="no-print flex items-center justify-between mb-4">
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
          {!game.isLocked && heldPositions.length > 0 && (
            <button
              onClick={() => { setHeldPositions([]); saveHeldPositions([]); }}
              className="text-sm px-3 py-1.5 rounded-lg font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
            >
              Clear Holds ({heldPositions.length})
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="text-sm px-3 py-1.5 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors no-print"
          >
            Print Game Plan
          </button>
          <button
            onClick={() => {
              document.body.classList.add("print-batting");
              window.print();
              document.body.classList.remove("print-batting");
            }}
            className="text-sm px-3 py-1.5 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors no-print"
          >
            Print Batting Order
          </button>
          {!game.isLocked && (
            <button
              onClick={() => setRosterOpen(!rosterOpen)}
              className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
                rosterOpen
                  ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Manage Roster
            </button>
          )}
          {!game.isLocked && (
            <button
              onClick={handleSuggestPositions}
              disabled={suggesting}
              className="text-sm px-3 py-1.5 rounded-lg font-medium bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors disabled:opacity-50"
            >
              {suggesting ? "Analyzing..." : "Suggest Positions"}
            </button>
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
        <div className="no-print flex flex-wrap gap-2 mb-3 text-xs">
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

      {/* Roster Management Panel */}
      {rosterOpen && !game.isLocked && (
        <div className="no-print bg-white border border-indigo-200 rounded-lg p-4 mb-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-800">Game Roster</h3>
            <button
              onClick={() => { setRosterOpen(false); setShowPoolForm(false); }}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none"
            >
              &times;
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Toggle players in or out of this game. Changes will regenerate the lineup.
          </p>

          {/* Roster Players */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {game.team.players
              .filter((p) => !p.isPoolPlayer)
              .sort((a, b) => a.battingOrder - b.battingOrder)
              .map((player) => {
                const isExcluded = game.exclusions?.some((e) => e.playerId === player.id) ?? false;
                const isUpdating = rosterUpdating === player.id;
                return (
                  <button
                    key={player.id}
                    onClick={() => handleRosterToggle(player.id, isExcluded ? "include" : "exclude")}
                    disabled={!!rosterUpdating}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                      isUpdating
                        ? "opacity-50 cursor-wait"
                        : rosterUpdating
                          ? "opacity-70 cursor-not-allowed"
                          : isExcluded
                            ? "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                            : "bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isExcluded ? "bg-red-400" : "bg-green-400"}`} />
                    <span className="truncate">{player.name}</span>
                    {isExcluded && <span className="text-xs text-red-500 ml-auto flex-shrink-0">Out</span>}
                  </button>
                );
              })}
          </div>

          {/* Pool Players */}
          <div className="mt-4 pt-3 border-t border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Pool Players</h4>
            </div>

            {/* Existing pool players */}
            {game.poolPlayers && game.poolPlayers.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-3">
                {game.poolPlayers.map((player) => {
                  const isUpdating = rosterUpdating === player.id;
                  return (
                    <div
                      key={player.id}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-blue-50 text-blue-700 border border-blue-200 ${
                        isUpdating ? "opacity-50" : ""
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0 bg-blue-400" />
                      <span className="truncate">{player.name}</span>
                      <button
                        onClick={() => handleRemovePoolPlayer(player.id)}
                        disabled={!!rosterUpdating}
                        className="text-red-400 hover:text-red-600 ml-auto flex-shrink-0 text-xs font-bold disabled:opacity-50"
                        title="Remove pool player"
                      >
                        &times;
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add pool player form */}
            {showPoolForm ? (
              <div className="border border-blue-200 rounded-lg p-3 bg-blue-50/50 space-y-3">
                <input
                  type="text"
                  value={poolName}
                  onChange={(e) => setPoolName(e.target.value)}
                  placeholder="Pool player name"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  autoFocus
                />
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {POSITIONS.map((pos) => (
                    <div key={pos} className="flex items-center gap-1">
                      <label className="text-xs text-gray-600 w-8">{pos}</label>
                      <input
                        type="number"
                        min={0}
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
                <p className="text-xs text-gray-400">Rate 1-9 per position, or 0 for DNP</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddPoolPlayer}
                    disabled={!poolName.trim() || !!rosterUpdating}
                    className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-500 disabled:opacity-50 transition-colors"
                  >
                    {rosterUpdating === "adding-pool" ? "Adding..." : "Add Player"}
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
                disabled={!!rosterUpdating}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
              >
                + Add Pool Player
              </button>
            )}
          </div>
        </div>
      )}

      {/* Swap Position Dialog */}
      {swapDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-3">Swap Positions?</h3>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-gray-700">
                <span className="font-semibold">{swapDialog.selectedPlayerName}</span> is currently locked at{" "}
                <span className="font-semibold">{swapDialog.currentPosition === "BENCH" ? "Bench" : swapDialog.currentPosition}</span>{" "}
                in inning {swapDialog.inning}.
              </p>
            </div>
            {swapDialog.currentPlayerName ? (
              <p className="text-sm text-gray-700 mb-4">
                Swap with <span className="font-semibold">{swapDialog.currentPlayerName}</span>{" "}
                (currently at <span className="font-semibold">{swapDialog.targetPosition}</span>)?
                <br />
                <span className="text-gray-500 text-xs mt-1 block">
                  {swapDialog.selectedPlayerName} &rarr; {swapDialog.targetPosition},{" "}
                  {swapDialog.currentPlayerName} &rarr; {swapDialog.currentPosition === "BENCH" ? "Bench" : swapDialog.currentPosition}
                </span>
              </p>
            ) : (
              <p className="text-sm text-gray-700 mb-4">
                Move <span className="font-semibold">{swapDialog.selectedPlayerName}</span> to{" "}
                <span className="font-semibold">{swapDialog.targetPosition}</span>?
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setSwapDialog(null)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSwapConfirm}
                className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors font-medium"
              >
                Confirm Swap
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suggestion Preview Overlay */}
      {suggestedAssignments && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 overflow-y-auto py-8">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full mx-4">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Suggested Lineup</h3>
                <p className="text-sm text-gray-500">Based on coaching patterns from previous games</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setSuggestedAssignments(null)}
                  className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Dismiss
                </button>
                <button
                  onClick={handleAcceptSuggestions}
                  className="px-4 py-2 text-sm rounded-lg bg-purple-600 text-white hover:bg-purple-500 transition-colors font-medium"
                >
                  Accept Suggestions
                </button>
              </div>
            </div>
            <div className="p-4 overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left p-2 border border-gray-200 font-semibold text-gray-600 w-16">Pos</th>
                    {INNINGS.map((inn) => (
                      <th key={inn} className="text-center p-2 border border-gray-200 font-semibold text-gray-600">
                        Inn {inn}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"].map((pos) => (
                    <tr key={pos} className={pos === "P" || pos === "C" ? "bg-amber-50/50" : ""}>
                      <td className="p-2 border border-gray-200 font-semibold text-gray-700">{pos}</td>
                      {INNINGS.map((inn) => {
                        const a = suggestedAssignments.find(
                          (s) => s.inning === inn && s.position === pos,
                        );
                        return (
                          <td key={inn} className="p-2 border border-gray-200 text-center text-gray-800">
                            {a?.playerFirstName || a?.playerName?.split(" ")[0] || "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="bg-gray-50/50">
                    <td className="p-2 border border-gray-200 font-semibold text-gray-500">Bench</td>
                    {INNINGS.map((inn) => {
                      const benched = suggestedAssignments.filter(
                        (s) => s.inning === inn && s.position === "BENCH",
                      );
                      return (
                        <td key={inn} className="p-2 border border-gray-200 text-center text-gray-500 text-[10px]">
                          {benched.length > 0
                            ? benched.map((b) => b.playerFirstName || b.playerName.split(" ")[0]).join(", ")
                            : "—"}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
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
        allPlayers={activePlayers.map((p) => ({ id: p.id, name: p.isPoolPlayer ? `${p.name} (pool)` : p.name, firstName: p.firstName || p.name.split(" ")[0], ratings: p.ratings }))}
        onPitcherChange={handlePitcherChange}
        onPositionChange={handlePositionChange}
        onPositionUnassign={handlePositionUnassign}
        onPitcherUnassign={handlePitcherUnassign}
        regenerating={regenerating}
        heldPositions={heldPositions}
        onGameInfoUpdate={handleGameInfoUpdate}
        gameBalls={(game.gameBalls || []).map((gb) => ({
          id: gb.id,
          playerId: gb.playerId,
          playerName: game.team.players.find((p) => p.id === gb.playerId)?.name || "Unknown",
          reason: gb.reason,
        }))}
        onGameBallUpdate={handleGameBallUpdate}
        onGameBallRemove={handleGameBallRemove}
        previousGameBench={game.previousGameBench}
      />
    </div>
  );
}
