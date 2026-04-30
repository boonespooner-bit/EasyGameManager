"use client";

import { useState, useCallback, useMemo } from "react";
import { POSITIONS, INNINGS, type FieldPosition } from "@/types";

interface Assignment {
  playerId: string;
  playerName: string;
  playerFirstName?: string;
  jerseyNumber?: string | null;
  inning: number;
  position: FieldPosition;
}

interface HeldPosition {
  playerId: string;
  inning: number;
  position: string;
}

interface GameBallData {
  id: string;
  playerId: string;
  playerName: string;
  reason: string;
}

interface Props {
  assignments: Assignment[];
  battingOrder: { playerId: string; playerName: string; jerseyNumber?: string | null; order: number }[];
  opponent: string;
  date: string;
  teamName: string;
  isLocked: boolean;
  onUpdate?: (assignments: Assignment[]) => void;
  onBattingOrderUpdate?: (order: { playerId: string; playerName: string; jerseyNumber?: string | null; order: number }[]) => void;
  pitchingMode?: boolean;
  allPlayers?: { id: string; name: string; firstName?: string; ratings?: { position: string; rating: number }[] }[];
  onPitcherChange?: (inning: number, playerId: string) => void;
  onPositionChange?: (inning: number, position: string, playerId: string) => void;
  onPositionUnassign?: (inning: number, position: string) => void;
  onPitcherUnassign?: (inning: number) => void;
  regenerating?: boolean;
  heldPositions?: HeldPosition[];
  onGameInfoUpdate?: (opponent: string, date: string) => void;
  gameBalls?: GameBallData[];
  onGameBallUpdate?: (playerId: string, reason: string, id?: string) => void;
  onGameBallRemove?: (id: string) => void;
  previousGameBench?: { date: string; opponent: string; players: string[] } | null;
}

const POSITION_COORDS: Record<string, { x: number; y: number }> = {
  P:  { x: 50, y: 58 },
  C:  { x: 50, y: 82 },
  "1B": { x: 72, y: 55 },
  "2B": { x: 62, y: 42 },
  SS: { x: 38, y: 42 },
  "3B": { x: 28, y: 55 },
  LF: { x: 18, y: 25 },
  CF: { x: 50, y: 15 },
  RF: { x: 82, y: 25 },
};

export default function BaseballField({
  assignments,
  battingOrder,
  opponent,
  date,
  teamName,
  isLocked,
  onUpdate,
  onBattingOrderUpdate,
  pitchingMode,
  allPlayers,
  onPitcherChange,
  onPositionChange,
  onPositionUnassign,
  onPitcherUnassign,
  regenerating,
  heldPositions,
  onGameInfoUpdate,
  gameBalls = [],
  onGameBallUpdate,
  onGameBallRemove,
  previousGameBench,
}: Props) {
  const [dragSource, setDragSource] = useState<{ position: string; inning: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [battingDragIndex, setBattingDragIndex] = useState<number | null>(null);
  const [battingDragOverIndex, setBattingDragOverIndex] = useState<number | null>(null);
  const [editingGameInfo, setEditingGameInfo] = useState(false);
  const [editOpponent, setEditOpponent] = useState(opponent);
  const [editDate, setEditDate] = useState(date);
  const [editingGameBallIndex, setEditingGameBallIndex] = useState<number | null>(null);
  const [gameBallPlayerId, setGameBallPlayerId] = useState("");
  const [gameBallReason, setGameBallReason] = useState("");
  const [showSitModal, setShowSitModal] = useState(false);
  const [skippedSwaps, setSkippedSwaps] = useState<Set<string>>(new Set());

  // Players who have not sat (no BENCH assignment) at all in the game
  const notSatPlayers = useMemo(() => {
    const benchedIds = new Set<string>();
    const allIds = new Set<string>();
    const nameMap = new Map<string, string>();
    const firstNameMap = new Map<string, string>();
    for (const a of assignments) {
      allIds.add(a.playerId);
      nameMap.set(a.playerId, a.playerName);
      firstNameMap.set(a.playerId, a.playerFirstName || a.playerName.split(" ")[0]);
      if (a.position === "BENCH") benchedIds.add(a.playerId);
    }
    return Array.from(allIds)
      .filter((id) => !benchedIds.has(id))
      .map((id) => ({ playerId: id, playerName: nameMap.get(id) || "", playerFirstName: firstNameMap.get(id) || "" }));
  }, [assignments]);

  // Rating lookup by playerId -> position -> rating
  const ratingLookup = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const p of allPlayers || []) {
      const r = new Map<string, number>();
      for (const rating of p.ratings || []) r.set(rating.position, rating.rating);
      m.set(p.id, r);
    }
    return m;
  }, [allPlayers]);

  // Bench count per player (how many innings they currently sit)
  const benchCountMap = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of assignments) {
      if (a.position === "BENCH") counts[a.playerId] = (counts[a.playerId] || 0) + 1;
    }
    return counts;
  }, [assignments]);

  // For each not-sat player, suggest the best inning + bench player to swap with.
  // Prefers swapping in a benched player who has sat the most so far (to balance
  // bench distribution) and who can play the position well.
  const sitSuggestions = useMemo(() => {
    type Suggestion = {
      notSatPlayerId: string;
      notSatPlayerName: string;
      inning: number;
      position: string;
      benchPlayerId: string;
      benchPlayerName: string;
      benchCount: number;
      rating: number;
    };
    const suggestions: Suggestion[] = [];
    for (const np of notSatPlayers) {
      const candidates: Suggestion[] = [];
      for (const inning of INNINGS) {
        const npAssignment = assignments.find(
          (a) => a.playerId === np.playerId && a.inning === inning,
        );
        if (!npAssignment || npAssignment.position === "BENCH") continue;
        const pos = npAssignment.position;
        const benched = assignments.filter(
          (a) => a.position === "BENCH" && a.inning === inning,
        );
        for (const b of benched) {
          const rating = ratingLookup.get(b.playerId)?.get(pos);
          if (rating === 0) continue; // DNP for this position
          const key = `${np.playerId}|${inning}|${b.playerId}`;
          if (skippedSwaps.has(key)) continue;
          candidates.push({
            notSatPlayerId: np.playerId,
            notSatPlayerName: np.playerFirstName,
            inning,
            position: pos,
            benchPlayerId: b.playerId,
            benchPlayerName: b.playerFirstName || b.playerName.split(" ")[0],
            benchCount: benchCountMap[b.playerId] || 0,
            rating: rating ?? 5,
          });
        }
      }
      candidates.sort((a, b) => {
        if (b.benchCount !== a.benchCount) return b.benchCount - a.benchCount;
        return b.rating - a.rating;
      });
      if (candidates.length > 0) suggestions.push(candidates[0]);
    }
    return suggestions;
  }, [notSatPlayers, assignments, ratingLookup, benchCountMap, skippedSwaps]);

  const approveSwap = (s: (typeof sitSuggestions)[number]) => {
    if (!onUpdate) return;
    const updated = assignments.map((a) => {
      if (a.playerId === s.notSatPlayerId && a.inning === s.inning && a.position === s.position) {
        return { ...a, position: "BENCH" as FieldPosition };
      }
      if (a.playerId === s.benchPlayerId && a.inning === s.inning && a.position === "BENCH") {
        return { ...a, position: s.position as FieldPosition };
      }
      return a;
    });
    onUpdate(updated);
  };

  const skipSuggestion = (s: (typeof sitSuggestions)[number]) => {
    setSkippedSwaps((prev) => {
      const next = new Set(prev);
      next.add(`${s.notSatPlayerId}|${s.inning}|${s.benchPlayerId}`);
      return next;
    });
  };

  // Build bench color map: players sitting 2 innings get a shared color
  const benchColorMap = (() => {
    const benchCounts: Record<string, number> = {};
    for (const a of assignments) {
      if (a.position === "BENCH") {
        benchCounts[a.playerId] = (benchCounts[a.playerId] || 0) + 1;
      }
    }
    const colors = [
      { bg: "bg-purple-100", border: "border-purple-300", text: "text-purple-700" },
      { bg: "bg-teal-100", border: "border-teal-300", text: "text-teal-700" },
      { bg: "bg-orange-100", border: "border-orange-300", text: "text-orange-700" },
      { bg: "bg-pink-100", border: "border-pink-300", text: "text-pink-700" },
      { bg: "bg-cyan-100", border: "border-cyan-300", text: "text-cyan-700" },
      { bg: "bg-lime-100", border: "border-lime-300", text: "text-lime-700" },
    ];
    const map: Record<string, typeof colors[0]> = {};
    let colorIdx = 0;
    for (const [playerId, count] of Object.entries(benchCounts)) {
      if (count >= 2) {
        map[playerId] = colors[colorIdx % colors.length];
        colorIdx++;
      }
    }
    return map;
  })();

  // Print-view bench color map (name-based, inline styles for print)
  const printBenchColors = (() => {
    const benchCounts: Record<string, number> = {};
    const nameMap: Record<string, string> = {};
    for (const a of assignments) {
      if (a.position === "BENCH") {
        benchCounts[a.playerId] = (benchCounts[a.playerId] || 0) + 1;
        nameMap[a.playerName] = a.playerId;
      }
    }
    const colors = ["#e9d5ff", "#ccfbf1", "#ffedd5", "#fce7f3", "#cffafe", "#ecfccb"];
    const map: Record<string, string> = {};
    let colorIdx = 0;
    for (const [playerId, count] of Object.entries(benchCounts)) {
      if (count >= 2) {
        map[playerId] = colors[colorIdx % colors.length];
        colorIdx++;
      }
    }
    const nameColorMap: Record<string, string> = {};
    for (const [name, id] of Object.entries(nameMap)) {
      if (map[id]) nameColorMap[name] = map[id];
    }
    return nameColorMap;
  })();

  const getPlayersAtPosition = (position: string) => {
    return INNINGS.map((inning) => {
      const a = assignments.find((a) => a.position === position && a.inning === inning);
      return a ? { inning, playerId: a.playerId, name: a.playerFirstName || a.playerName.split(" ")[0] } : null;
    });
  };

  const getBenchByInning = () => {
    return INNINGS.map((inning) => ({
      inning,
      players: assignments
        .filter((a) => a.position === "BENCH" && a.inning === inning)
        .map((a) => ({ playerId: a.playerId, name: a.playerFirstName || a.playerName.split(" ")[0] })),
    }));
  };

  const handleDragStart = (position: string, inning: number) => {
    if (isLocked) return;
    setDragSource({ position, inning });
    setError(null);
  };

  const handleDrop = useCallback(
    (targetPosition: string, targetInning: number) => {
      if (isLocked || !dragSource || !onUpdate) return;

      const source = assignments.find(
        (a) => a.position === dragSource.position && a.inning === dragSource.inning,
      );
      const target = assignments.find(
        (a) => a.position === targetPosition && a.inning === targetInning,
      );

      if (!source) {
        setDragSource(null);
        return;
      }

      // Same spot — ignore
      if (dragSource.position === targetPosition && dragSource.inning === targetInning) {
        setDragSource(null);
        return;
      }

      // Check if the source player is already assigned to a DIFFERENT position in the TARGET inning
      if (dragSource.inning !== targetInning) {
        const playerInTargetInning = assignments.find(
          (a) => a.playerId === source.playerId && a.inning === targetInning,
        );
        if (playerInTargetInning) {
          setError(
            `${source.playerName} is already assigned to ${playerInTargetInning.position} in inning ${targetInning}. Remove them from that position first.`,
          );
          setDragSource(null);
          return;
        }
      }

      // If swapping across innings, also check target player isn't already in source inning
      if (target && dragSource.inning !== targetInning) {
        const targetPlayerInSourceInning = assignments.find(
          (a) => a.playerId === target.playerId && a.inning === dragSource.inning,
        );
        if (targetPlayerInSourceInning) {
          setError(
            `${target.playerName} is already assigned to ${targetPlayerInSourceInning.position} in inning ${dragSource.inning}. Cannot swap across innings.`,
          );
          setDragSource(null);
          return;
        }
      }

      setError(null);

      if (target) {
        // Swap the two players
        const updated = assignments.map((a) => {
          if (a === source) {
            return { ...a, position: targetPosition as FieldPosition, inning: targetInning };
          }
          if (a === target) {
            return { ...a, position: dragSource.position as FieldPosition, inning: dragSource.inning };
          }
          return a;
        });
        onUpdate(updated);
      } else {
        // Move to empty slot
        const updated = assignments.map((a) => {
          if (a === source) {
            return { ...a, position: targetPosition as FieldPosition, inning: targetInning };
          }
          return a;
        });
        onUpdate(updated);
      }

      setDragSource(null);
    },
    [dragSource, assignments, isLocked, onUpdate],
  );

  // Build data for print view
  const getBenchForPrint = () => {
    return INNINGS.map((inning) => ({
      inning,
      players: assignments
        .filter((a) => a.position === "BENCH" && a.inning === inning)
        .map((a) => a.playerFirstName || a.playerName.split(" ")[0]),
    }));
  };

  const getPlayersForPrint = (position: string) => {
    return INNINGS.map((inning) => {
      const a = assignments.find((a) => a.position === position && a.inning === inning);
      return a ? (a.playerFirstName || a.playerName.split(" ")[0]) : "\u2014";
    });
  };

  // Print position coordinates (percentage-based, same layout as screen)
  const PRINT_COORDS: Record<string, { x: number; y: number }> = {
    P:  { x: 50, y: 56 },
    C:  { x: 50, y: 78 },
    "1B": { x: 73, y: 53 },
    "2B": { x: 63, y: 40 },
    SS: { x: 37, y: 40 },
    "3B": { x: 27, y: 53 },
    LF: { x: 16, y: 22 },
    CF: { x: 50, y: 12 },
    RF: { x: 84, y: 22 },
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Print-only field view (full game plan) */}
      <div className="print-only print-full hidden">
        <div style={{ textAlign: "center", marginBottom: "6px" }}>
          <h1 style={{ fontSize: "16px", fontWeight: "bold", margin: 0 }}>
            {teamName} vs. {opponent}
          </h1>
          <p style={{ fontSize: "11px", color: "#555", margin: "2px 0" }}>
            {new Date(date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}
          </p>
        </div>

        {/* Field with position boxes */}
        <div style={{ position: "relative", width: "100%", paddingBottom: "85%", border: "1px solid #ccc", borderRadius: "8px", marginBottom: "8px", overflow: "hidden" }}>
          {/* Field background SVG */}
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox="0 0 100 90">
            {/* Grass */}
            <rect x="0" y="0" width="100" height="90" fill="#e8f5e9" />
            {/* Outfield arc */}
            <path d="M 8 48 Q 8 4, 50 4 Q 92 4, 92 48" fill="none" stroke="#aaa" strokeWidth="0.3" />
            {/* Infield dirt */}
            <polygon points="50,32 70,52 50,72 30,52" fill="#f5e6d3" stroke="#999" strokeWidth="0.2" />
            {/* Base paths */}
            <line x1="50" y1="72" x2="70" y2="52" stroke="#999" strokeWidth="0.2" />
            <line x1="70" y1="52" x2="50" y2="32" stroke="#999" strokeWidth="0.2" />
            <line x1="50" y1="32" x2="30" y2="52" stroke="#999" strokeWidth="0.2" />
            <line x1="30" y1="52" x2="50" y2="72" stroke="#999" strokeWidth="0.2" />
            {/* Bases */}
            <rect x="49" y="71" width="2" height="2" fill="#999" transform="rotate(45 50 72)" />
            <rect x="69" y="51" width="2" height="2" fill="#999" transform="rotate(45 70 52)" />
            <rect x="49" y="31" width="2" height="2" fill="#999" transform="rotate(45 50 32)" />
            <rect x="29" y="51" width="2" height="2" fill="#999" transform="rotate(45 30 52)" />
            <circle cx="50" cy="52" r="1" fill="#d4b896" />
          </svg>

          {/* Position boxes */}
          {POSITIONS.map((pos) => {
            const coord = PRINT_COORDS[pos];
            const players = getPlayersForPrint(pos);
            return (
              <div
                key={pos}
                style={{
                  position: "absolute",
                  left: `${coord.x}%`,
                  top: `${coord.y}%`,
                  transform: "translate(-50%, -50%)",
                  border: "1px solid #333",
                  borderRadius: "3px",
                  backgroundColor: "#fff",
                  minWidth: "70px",
                  fontSize: "8px",
                  lineHeight: "1.3",
                }}
              >
                <div style={{
                  backgroundColor: "#333",
                  color: "#fff",
                  textAlign: "center",
                  fontWeight: "bold",
                  padding: "1px 4px",
                  fontSize: "8px",
                  borderRadius: "2px 2px 0 0",
                }}>
                  {pos}
                </div>
                <div style={{ padding: "1px 3px" }}>
                  {players.map((name, i) => (
                    <div key={i} style={{ display: "flex", gap: "3px", padding: "0.5px 0" }}>
                      <span style={{ fontWeight: "bold", color: "#888", width: "10px", textAlign: "right" }}>{i + 1}.</span>
                      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bench boxes */}
        <div style={{ marginBottom: "8px" }}>
          <div style={{ fontSize: "11px", fontWeight: "bold", marginBottom: "3px" }}>Bench</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "4px" }}>
            {getBenchForPrint().map(({ inning, players }) => (
              <div key={inning} style={{
                border: "1px solid #333",
                borderRadius: "3px",
                padding: "3px 4px",
                minHeight: "40px",
                fontSize: "8px",
              }}>
                <div style={{ fontWeight: "bold", color: "#666", marginBottom: "2px", fontSize: "8px" }}>Inn {inning}</div>
                {players.map((name, i) => {
                  const bgColor = printBenchColors[name];
                  return (
                    <div key={i} style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      backgroundColor: bgColor || "transparent",
                      borderRadius: bgColor ? "2px" : undefined,
                      padding: bgColor ? "0 2px" : undefined,
                    }}>{name}</div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Bench count summary */}
        <div style={{ marginBottom: "8px" }}>
          <div style={{ fontSize: "9px", display: "flex", flexWrap: "wrap", gap: "2px 8px" }}>
            <span style={{ fontWeight: "bold", color: "#555" }}>Bench count:</span>
            {(() => {
              const allPlayerIds = new Set<string>();
              const firstNames = new Map<string, string>();
              for (const a of assignments) {
                allPlayerIds.add(a.playerId);
                if (!firstNames.has(a.playerId)) {
                  firstNames.set(a.playerId, a.playerFirstName || a.playerName.split(" ")[0]);
                }
              }
              return Array.from(allPlayerIds)
                .map((id) => ({ id, name: firstNames.get(id) || "", count: benchCountMap[id] || 0 }))
                .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
                .map((p) => (
                  <span key={p.id} style={{ fontWeight: p.count >= 3 ? "bold" : "normal" }}>
                    {p.name}: {p.count}
                  </span>
                ));
            })()}
          </div>
        </div>

        {/* Batting Order - horizontal to save space */}
        <div>
          <div style={{ fontSize: "11px", fontWeight: "bold", marginBottom: "3px" }}>Batting Order</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 12px", fontSize: "9px" }}>
            {battingOrder.map((b) => (
              <span key={b.playerId}>
                <span style={{ fontWeight: "bold", color: "#666" }}>{b.order}.</span> {b.playerName}{b.jerseyNumber ? ` #${b.jerseyNumber}` : ""}
              </span>
            ))}
          </div>
        </div>

        {/* Game Balls - print */}
        {gameBalls.length > 0 && (
          <div style={{ marginTop: "8px", padding: "6px 8px", border: "1px solid #d4a017", borderRadius: "4px", backgroundColor: "#fef9e7" }}>
            <div style={{ fontSize: "11px", fontWeight: "bold", marginBottom: "2px" }}>{gameBalls.length === 1 ? "Game Ball" : "Game Balls"}</div>
            {gameBalls.map((gb) => (
              <div key={gb.id} style={{ fontSize: "9px", marginBottom: "2px" }}>
                <span style={{ fontWeight: "bold" }}>{gb.playerName}</span> &mdash; {gb.reason}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Print-only batting order view */}
      <div className="print-only print-batting hidden">
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <h1 style={{ fontSize: "20px", fontWeight: "bold", margin: 0 }}>
            {teamName} vs. {opponent}
          </h1>
          <p style={{ fontSize: "13px", color: "#555", margin: "4px 0" }}>
            {new Date(date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}
          </p>
          <p style={{ fontSize: "15px", fontWeight: "bold", marginTop: "12px" }}>Batting Order</p>
        </div>
        <div style={{ maxWidth: "320px", margin: "0 auto" }}>
          {battingOrder.map((b) => (
            <div
              key={b.playerId}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "6px 12px",
                borderBottom: "1px solid #ddd",
                fontSize: "14px",
              }}
            >
              <span style={{ fontWeight: "bold", color: "#666", width: "28px", textAlign: "right", marginRight: "12px" }}>
                {b.order}.
              </span>
              <span>{b.playerName}{b.jerseyNumber ? ` #${b.jerseyNumber}` : ""}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Screen-only content below */}
      {/* Title */}
      <div className="text-center mb-4 no-print">
        {editingGameInfo ? (
          <div className="inline-flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-gray-900">{teamName} vs.</span>
              <input
                type="text"
                value={editOpponent}
                onChange={(e) => setEditOpponent(e.target.value)}
                className="text-2xl font-bold text-gray-900 border-b-2 border-blue-400 bg-transparent outline-none text-center w-48"
                autoFocus
              />
            </div>
            <input
              type="date"
              value={editDate.slice(0, 10)}
              onChange={(e) => setEditDate(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-blue-400"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (editOpponent.trim() && onGameInfoUpdate) {
                    onGameInfoUpdate(editOpponent.trim(), editDate);
                  }
                  setEditingGameInfo(false);
                }}
                className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-500"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditOpponent(opponent);
                  setEditDate(date);
                  setEditingGameInfo(false);
                }}
                className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1 rounded border border-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <h1
              className={`text-2xl font-bold text-gray-900 ${!isLocked && onGameInfoUpdate ? "cursor-pointer hover:text-blue-700 transition-colors" : ""}`}
              onClick={() => {
                if (!isLocked && onGameInfoUpdate) {
                  setEditOpponent(opponent);
                  setEditDate(date);
                  setEditingGameInfo(true);
                }
              }}
              title={!isLocked && onGameInfoUpdate ? "Click to edit" : undefined}
            >
              {teamName} vs. {opponent}
              {!isLocked && onGameInfoUpdate && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 inline-block ml-1 text-gray-400">
                  <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                </svg>
              )}
            </h1>
            <p
              className={`text-gray-500 ${!isLocked && onGameInfoUpdate ? "cursor-pointer hover:text-blue-600 transition-colors" : ""}`}
              onClick={() => {
                if (!isLocked && onGameInfoUpdate) {
                  setEditOpponent(opponent);
                  setEditDate(date);
                  setEditingGameInfo(true);
                }
              }}
            >
              {new Date(date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}
            </p>
          </>
        )}
        {isLocked && (
          <span className="inline-block mt-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
            Locked (Historical)
          </span>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="no-print bg-red-50 border border-red-300 text-red-700 px-4 py-2 rounded-lg mb-4 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold ml-4">&times;</button>
        </div>
      )}

      {!isLocked && (
        <p className="no-print text-xs text-gray-400 mb-2 text-center">Drag players between positions and innings to rearrange</p>
      )}

      <div className="no-print flex gap-6">
        {/* Field */}
        <div className="flex-1">
          <div className="relative bg-green-600 rounded-2xl" style={{ paddingBottom: "100%" }}>
            {/* Infield diamond */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
              {/* Outfield arc */}
              <path d="M 10 50 Q 10 5, 50 5 Q 90 5, 90 50" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
              {/* Infield dirt */}
              <polygon points="50,35 70,55 50,75 30,55" fill="rgba(139,90,43,0.5)" stroke="white" strokeWidth="0.3" />
              {/* Base paths */}
              <line x1="50" y1="75" x2="70" y2="55" stroke="white" strokeWidth="0.3" />
              <line x1="70" y1="55" x2="50" y2="35" stroke="white" strokeWidth="0.3" />
              <line x1="50" y1="35" x2="30" y2="55" stroke="white" strokeWidth="0.3" />
              <line x1="30" y1="55" x2="50" y2="75" stroke="white" strokeWidth="0.3" />
              {/* Bases */}
              <rect x="48.5" y="73.5" width="3" height="3" fill="white" transform="rotate(45 50 75)" />
              <rect x="68.5" y="53.5" width="3" height="3" fill="white" transform="rotate(45 70 55)" />
              <rect x="48.5" y="33.5" width="3" height="3" fill="white" transform="rotate(45 50 35)" />
              <rect x="28.5" y="53.5" width="3" height="3" fill="white" transform="rotate(45 30 55)" />
              {/* Pitcher's mound */}
              <circle cx="50" cy="55" r="1.5" fill="rgba(139,90,43,0.7)" />
            </svg>

            {/* Position boxes */}
            {POSITIONS.map((pos) => {
              const coord = POSITION_COORDS[pos];
              const players = getPlayersAtPosition(pos);
              const isPitcher = pos === "P" && pitchingMode;
              const heldInningsForPos = heldPositions
                ? new Set(heldPositions.filter((h) => h.position === pos).map((h) => h.inning))
                : undefined;
              return (
                <div
                  key={pos}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${coord.x}%`, top: `${coord.y}%`, zIndex: 1 }}
                >
                  {isPitcher ? (
                    <PitcherBox
                      players={players}
                      allPlayers={allPlayers || []}
                      onPitcherChange={onPitcherChange}
                      onPitcherUnassign={onPitcherUnassign}
                      disabled={!!regenerating}
                    />
                  ) : (
                    <PositionBox
                      position={pos}
                      players={players}
                      isLocked={isLocked}
                      onDragStart={handleDragStart}
                      onDrop={handleDrop}
                      isDragging={!!dragSource}
                      allPlayers={allPlayers}
                      onPositionChange={onPositionChange}
                      onPositionUnassign={onPositionUnassign}
                      disabled={regenerating}
                      heldInnings={heldInningsForPos}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Bench */}
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Bench</h3>
            <div className="grid grid-cols-6 gap-2">
              {getBenchByInning().map(({ inning, players }) => {
                const benchHeld = heldPositions?.some((h) => h.position === "BENCH" && h.inning === inning);
                return (
                  <div
                    key={inning}
                    className={`bg-gray-100 border rounded p-2 min-h-[80px] ${benchHeld ? "border-amber-300" : "border-gray-300"}`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop("BENCH", inning)}
                  >
                    <div className="text-xs font-bold text-gray-500 mb-1">Inn {inning}</div>
                    {players.map((p) => {
                      const isPlayerHeld = heldPositions?.some(
                        (h) => h.position === "BENCH" && h.inning === inning && h.playerId === p.playerId,
                      );
                      const benchColor = benchColorMap[p.playerId];
                      return (
                        <div
                          key={p.playerId}
                          className={`text-xs rounded px-1 py-0.5 mb-0.5 border truncate cursor-grab active:cursor-grabbing ${
                            isPlayerHeld
                              ? "bg-amber-50 border-amber-300"
                              : benchColor
                                ? `${benchColor.bg} ${benchColor.border} ${benchColor.text} font-medium`
                                : "bg-white"
                          }`}
                          draggable={!isLocked}
                          onDragStart={() => handleDragStart("BENCH", inning)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => { e.stopPropagation(); handleDrop("BENCH", inning); }}
                        >
                          {isPlayerHeld && <span className="text-amber-500 text-[8px]">&#128274;</span>}
                          {p.name}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            {notSatPlayers.length > 0 && (
              <div className="no-print mt-2 flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-600 font-medium">Not yet benched:</span>
                {notSatPlayers.map((p) => (
                  <span
                    key={p.playerId}
                    className="text-xs bg-yellow-100 text-yellow-800 border border-yellow-200 px-2 py-0.5 rounded"
                  >
                    {p.playerFirstName}
                  </span>
                ))}
                {!isLocked && onUpdate && (
                  <button
                    onClick={() => setShowSitModal(true)}
                    className="text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 px-2 py-1 rounded font-medium transition-colors"
                  >
                    Suggest sit times
                  </button>
                )}
              </div>
            )}
            <div className="no-print mt-2 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-600 font-medium">Bench count:</span>
              {(() => {
                const allPlayerIds = new Set<string>();
                const firstNames = new Map<string, string>();
                for (const a of assignments) {
                  allPlayerIds.add(a.playerId);
                  if (!firstNames.has(a.playerId)) {
                    firstNames.set(a.playerId, a.playerFirstName || a.playerName.split(" ")[0]);
                  }
                }
                return Array.from(allPlayerIds)
                  .map((id) => ({ id, name: firstNames.get(id) || "", count: benchCountMap[id] || 0 }))
                  .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
                  .map((p) => (
                    <span
                      key={p.id}
                      className={`text-xs px-2 py-0.5 rounded border ${
                        p.count === 0
                          ? "bg-yellow-100 text-yellow-800 border-yellow-200"
                          : p.count >= 3
                            ? "bg-red-100 text-red-700 border-red-200 font-bold"
                            : p.count === 2
                              ? "bg-orange-100 text-orange-700 border-orange-200 font-medium"
                              : "bg-gray-100 text-gray-700 border-gray-200"
                      }`}
                    >
                      {p.name}: {p.count}
                    </span>
                  ));
              })()}
            </div>
            {previousGameBench && previousGameBench.players.length > 0 && (
              <div className="no-print mt-2 inline-block bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-900">
                <div className="font-semibold text-amber-800">
                  Last game bench (Inn 1)
                  <span className="font-normal text-amber-700">
                    {" "}— vs {previousGameBench.opponent},{" "}
                    {new Date(previousGameBench.date).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-0.5">{previousGameBench.players.join(", ")}</div>
              </div>
            )}
          </div>

          {/* Game Balls */}
          {gameBalls.map((gb, idx) => (
            <GameBallSection
              key={gb.id}
              gameBall={gb}
              allPlayers={allPlayers}
              editing={editingGameBallIndex === idx}
              selectedPlayerId={gameBallPlayerId}
              reason={gameBallReason}
              label={gameBalls.length === 2 ? `Game Ball #${idx + 1}` : "Game Ball"}
              onStartEdit={() => {
                setGameBallPlayerId(gb.playerId);
                setGameBallReason(gb.reason);
                setEditingGameBallIndex(idx);
              }}
              onCancel={() => setEditingGameBallIndex(null)}
              onPlayerChange={setGameBallPlayerId}
              onReasonChange={setGameBallReason}
              onSave={() => {
                if (gameBallPlayerId && gameBallReason.trim() && onGameBallUpdate) {
                  onGameBallUpdate(gameBallPlayerId, gameBallReason.trim(), gb.id);
                  setEditingGameBallIndex(null);
                }
              }}
              onRemove={() => {
                onGameBallRemove?.(gb.id);
                setEditingGameBallIndex(null);
                setGameBallPlayerId("");
                setGameBallReason("");
              }}
            />
          ))}
          {gameBalls.length < 2 && (
            <GameBallSection
              allPlayers={allPlayers}
              editing={editingGameBallIndex === -1}
              selectedPlayerId={gameBallPlayerId}
              reason={gameBallReason}
              label={gameBalls.length === 1 ? "Game Ball #2" : undefined}
              onStartEdit={() => {
                setGameBallPlayerId("");
                setGameBallReason("");
                setEditingGameBallIndex(-1);
              }}
              onCancel={() => setEditingGameBallIndex(null)}
              onPlayerChange={setGameBallPlayerId}
              onReasonChange={setGameBallReason}
              onSave={() => {
                if (gameBallPlayerId && gameBallReason.trim() && onGameBallUpdate) {
                  onGameBallUpdate(gameBallPlayerId, gameBallReason.trim());
                  setEditingGameBallIndex(null);
                }
              }}
              onRemove={() => {
                setEditingGameBallIndex(null);
                setGameBallPlayerId("");
                setGameBallReason("");
              }}
            />
          )}
        </div>

        {/* Batting Order */}
        <div className="w-48">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Batting Order</h3>
          {!isLocked && onBattingOrderUpdate && (
            <p className="text-xs text-gray-400 mb-1">Drag to reorder</p>
          )}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            {battingOrder.map((b, idx) => (
              <div
                key={b.playerId}
                className={`flex items-center gap-2 px-3 py-2 border-b border-gray-100 last:border-0 transition-colors ${
                  !isLocked && onBattingOrderUpdate ? "cursor-grab active:cursor-grabbing" : ""
                } ${battingDragOverIndex === idx ? "bg-blue-50 border-t-2 border-t-blue-400" : "hover:bg-gray-50"
                } ${battingDragIndex === idx ? "opacity-40" : ""}`}
                draggable={!isLocked && !!onBattingOrderUpdate}
                onDragStart={(e) => {
                  setBattingDragIndex(idx);
                  if (pitchingMode) {
                    e.dataTransfer.setData("text/pitcher-player-id", b.playerId);
                  }
                }}
                onDragOver={(e) => { e.preventDefault(); setBattingDragOverIndex(idx); }}
                onDragLeave={() => setBattingDragOverIndex(null)}
                onDrop={() => {
                  if (battingDragIndex === null || battingDragIndex === idx || !onBattingOrderUpdate) return;
                  const reordered = [...battingOrder];
                  const [moved] = reordered.splice(battingDragIndex, 1);
                  reordered.splice(idx, 0, moved);
                  const renumbered = reordered.map((item, i) => ({ ...item, order: i + 1 }));
                  onBattingOrderUpdate(renumbered);
                  setBattingDragIndex(null);
                  setBattingDragOverIndex(null);
                }}
                onDragEnd={() => { setBattingDragIndex(null); setBattingDragOverIndex(null); }}
              >
                <span className="text-gray-300 text-lg leading-none select-none mr-1">&#8801;</span>
                <span className="text-xs font-bold text-gray-400 w-4">{b.order}</span>
                <span className="text-sm">{b.playerName}{b.jerseyNumber ? <span className="text-xs text-gray-400 ml-1">#{b.jerseyNumber}</span> : null}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showSitModal && (
        <div className="no-print fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-gray-900">Suggested sit times</h3>
              <button
                onClick={() => setShowSitModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Approve each swap to give players who haven&apos;t sat a turn on the bench.
            </p>
            {sitSuggestions.length === 0 ? (
              <p className="text-sm text-gray-600 py-4 text-center">
                {notSatPlayers.length === 0
                  ? "All players have sat at least once."
                  : "No valid swaps available for the remaining players."}
              </p>
            ) : (
              <div className="space-y-3">
                {sitSuggestions.map((s) => (
                  <div
                    key={`${s.notSatPlayerId}-${s.inning}-${s.benchPlayerId}`}
                    className="border border-gray-200 rounded-lg p-3 bg-gray-50"
                  >
                    <div className="text-sm text-gray-800 mb-2">
                      <div className="font-semibold text-gray-900 mb-1">
                        Inning {s.inning}
                      </div>
                      Sit <span className="font-semibold">{s.notSatPlayerName}</span>{" "}
                      <span className="text-gray-500">(currently {s.position})</span>
                      <br />
                      Bring in <span className="font-semibold">{s.benchPlayerName}</span>{" "}
                      <span className="text-gray-500">
                        (sat {s.benchCount}× so far) at {s.position}
                      </span>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => skipSuggestion(s)}
                        className="px-3 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        Skip
                      </button>
                      <button
                        onClick={() => approveSwap(s)}
                        className="px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 font-medium transition-colors"
                      >
                        Approve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setShowSitModal(false)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PitcherBox({
  players,
  allPlayers,
  onPitcherChange,
  onPitcherUnassign,
  disabled,
}: {
  players: ({ inning: number; playerId: string; name: string } | null)[];
  allPlayers: { id: string; name: string; firstName?: string; ratings?: { position: string; rating: number }[] }[];
  onPitcherChange?: (inning: number, playerId: string) => void;
  onPitcherUnassign?: (inning: number) => void;
  disabled: boolean;
}) {
  const [editingInning, setEditingInning] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [dragOverInning, setDragOverInning] = useState<number | null>(null);

  // Filter out players with DNP (rating 0) for pitching
  const eligiblePitchers = allPlayers.filter((p) => {
    const rating = p.ratings?.find((r) => r.position === "P")?.rating;
    return rating === undefined || rating !== 0;
  });

  const filtered = search.trim()
    ? eligiblePitchers.filter((p) => {
        const s = search.toLowerCase();
        return p.name.toLowerCase().includes(s) || (p.firstName || "").toLowerCase().includes(s);
      })
    : eligiblePitchers;

  const selectPlayer = (inning: number, playerId: string) => {
    onPitcherChange?.(inning, playerId);
    setEditingInning(null);
    setSearch("");
  };

  return (
    <div className="bg-red-50 rounded shadow-md border-2 border-red-300 min-w-[110px]">
      <div className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 text-center rounded-t">
        P (Priority)
      </div>
      <div className="p-1">
        {players.map((p, i) => {
          const inning = i + 1;
          const isEditing = editingInning === inning;
          const isDragOver = dragOverInning === inning;

          return (
            <div
              key={i}
              className={`relative text-[10px] px-1 py-0.5 rounded mb-0.5 transition-colors ${
                isDragOver ? "ring-2 ring-red-400 bg-red-100" : p ? "bg-red-50 hover:bg-red-100" : "bg-gray-50"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverInning(inning);
              }}
              onDragLeave={() => setDragOverInning(null)}
              onDrop={(e) => {
                e.stopPropagation();
                // Read player ID from drag data
                const playerId = e.dataTransfer.getData("text/pitcher-player-id");
                if (playerId && onPitcherChange && !disabled) {
                  onPitcherChange(inning, playerId);
                }
                setDragOverInning(null);
              }}
            >
              {isEditing ? (
                <div className="relative">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onBlur={() => setTimeout(() => { setEditingInning(null); setSearch(""); }, 150)}
                    className="w-full text-[10px] px-1 py-0.5 border border-red-300 rounded outline-none"
                    placeholder="Type name..."
                    autoFocus
                  />
                  <div className="absolute top-full left-0 bg-white border border-gray-300 rounded shadow-lg max-h-40 overflow-y-auto mt-0.5 min-w-[120px]" style={{ zIndex: 9999 }}>
                      {filtered.map((pl) => (
                        <button
                          key={pl.id}
                          className="block w-full text-left text-[10px] px-2 py-1 hover:bg-red-50 truncate"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectPlayer(inning, pl.id);
                          }}
                        >
                          {pl.firstName || pl.name}
                        </button>
                      ))}
                      <button
                        className="block w-full text-left text-[10px] px-2 py-1 hover:bg-gray-100 truncate text-gray-400 italic border-t border-gray-200"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onPitcherUnassign?.(inning);
                          setEditingInning(null);
                          setSearch("");
                        }}
                      >
                        — Unassign
                      </button>
                    </div>
                </div>
              ) : (
                <div
                  className="flex items-center gap-1 cursor-pointer"
                  onClick={() => {
                    if (!disabled) {
                      setEditingInning(inning);
                      setSearch("");
                    }
                  }}
                >
                  <span className="font-bold text-gray-400 w-3">{inning}.</span>
                  <span className="truncate">{p?.name || "\u2014"}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {disabled && (
        <div className="text-[8px] text-red-500 text-center py-0.5 animate-pulse">
          Updating...
        </div>
      )}
    </div>
  );
}

function PositionBox({
  position,
  players,
  isLocked,
  onDragStart,
  onDrop,
  isDragging,
  allPlayers,
  onPositionChange,
  onPositionUnassign,
  disabled,
  heldInnings,
}: {
  position: string;
  players: ({ inning: number; playerId: string; name: string } | null)[];
  isLocked: boolean;
  onDragStart: (pos: string, inning: number) => void;
  onDrop: (pos: string, inning: number) => void;
  isDragging: boolean;
  allPlayers?: { id: string; name: string; firstName?: string; ratings?: { position: string; rating: number }[] }[];
  onPositionChange?: (inning: number, position: string, playerId: string) => void;
  onPositionUnassign?: (inning: number, position: string) => void;
  disabled?: boolean;
  heldInnings?: Set<number>;
}) {
  const [editingInning, setEditingInning] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  // Filter out players with DNP (rating 0) for this position
  const eligiblePlayers = (allPlayers || []).filter((p) => {
    const rating = p.ratings?.find((r) => r.position === position)?.rating;
    return rating === undefined || rating !== 0;
  });

  const filtered = search.trim()
    ? eligiblePlayers.filter((p) => {
        const s = search.toLowerCase();
        return p.name.toLowerCase().includes(s) || (p.firstName || "").toLowerCase().includes(s);
      })
    : eligiblePlayers;

  const selectPlayer = (inning: number, playerId: string) => {
    onPositionChange?.(inning, position, playerId);
    setEditingInning(null);
    setSearch("");
  };

  const canEdit = !isLocked && !!allPlayers && !!onPositionChange;

  return (
    <div className="bg-white/95 rounded shadow-md border border-gray-300 min-w-[90px]">
      <div className="bg-gray-800 text-white text-xs font-bold px-2 py-0.5 text-center rounded-t">
        {position}
      </div>
      <div className="p-1">
        {players.map((p, i) => {
          const inning = i + 1;
          const isEditing = editingInning === inning;
          const isHeld = heldInnings?.has(inning);

          return (
            <div
              key={i}
              className={`relative text-[10px] px-1 py-0.5 rounded mb-0.5 transition-colors ${
                isEditing ? "" : p
                  ? `${isHeld ? "bg-amber-50 border border-amber-300" : "bg-blue-50"} hover:bg-blue-100 cursor-pointer`
                  : "bg-gray-50"
              } ${isDragging && !p ? "ring-1 ring-blue-300" : ""}`}
              draggable={!isLocked && !!p && !isEditing}
              onDragStart={() => p && onDragStart(position, p.inning)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.stopPropagation(); onDrop(position, inning); }}
            >
              {isEditing ? (
                <div className="relative">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onBlur={() => setTimeout(() => { setEditingInning(null); setSearch(""); }, 150)}
                    className="w-full text-[10px] px-1 py-0.5 border border-blue-300 rounded outline-none"
                    placeholder="Type name..."
                    autoFocus
                  />
                  <div className="absolute top-full left-0 bg-white border border-gray-300 rounded shadow-lg max-h-40 overflow-y-auto mt-0.5 min-w-[120px]" style={{ zIndex: 9999 }}>
                      {filtered.map((pl) => (
                        <button
                          key={pl.id}
                          className="block w-full text-left text-[10px] px-2 py-1 hover:bg-blue-50 truncate"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectPlayer(inning, pl.id);
                          }}
                        >
                          {pl.firstName || pl.name}
                        </button>
                      ))}
                      <button
                        className="block w-full text-left text-[10px] px-2 py-1 hover:bg-gray-100 truncate text-gray-400 italic border-t border-gray-200"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onPositionUnassign?.(inning, position);
                          setEditingInning(null);
                          setSearch("");
                        }}
                      >
                        — Unassign
                      </button>
                    </div>
                </div>
              ) : (
                <div
                  className="flex items-center gap-1"
                  onClick={() => {
                    if (canEdit && !disabled) {
                      setEditingInning(inning);
                      setSearch("");
                    }
                  }}
                >
                  <span className="font-bold text-gray-400 w-3">{inning}.</span>
                  {isHeld && <span className="text-amber-500 text-[8px]" title="Held">&#128274;</span>}
                  <span className="truncate">{p?.name || "\u2014"}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {disabled && (
        <div className="text-[8px] text-gray-500 text-center py-0.5 animate-pulse">
          Updating...
        </div>
      )}
    </div>
  );
}

function GameBallSection({
  gameBall,
  allPlayers,
  editing,
  selectedPlayerId,
  reason,
  label,
  onStartEdit,
  onCancel,
  onPlayerChange,
  onReasonChange,
  onSave,
  onRemove,
}: {
  gameBall?: { playerId: string; playerName: string; reason: string } | null;
  allPlayers?: { id: string; name: string; firstName?: string }[];
  editing: boolean;
  selectedPlayerId: string;
  reason: string;
  label?: string;
  onStartEdit: () => void;
  onCancel: () => void;
  onPlayerChange: (id: string) => void;
  onReasonChange: (reason: string) => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  if (editing) {
    return (
      <div className="mt-4 bg-yellow-50 border border-yellow-300 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-yellow-800 mb-3">{label || "Game Ball"} Award</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Player</label>
            <select
              value={selectedPlayerId}
              onChange={(e) => onPlayerChange(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-yellow-400"
            >
              <option value="">Select a player...</option>
              {(allPlayers || []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Reason</label>
            <textarea
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="Why did this player earn the game ball?"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-yellow-400 resize-none"
              rows={2}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={onSave}
              disabled={!selectedPlayerId || !reason.trim()}
              className="text-xs bg-yellow-600 text-white px-3 py-1.5 rounded hover:bg-yellow-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save
            </button>
            <button
              onClick={onCancel}
              className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded border border-gray-300"
            >
              Cancel
            </button>
            {gameBall && (
              <button
                onClick={onRemove}
                className="text-xs text-red-500 hover:text-red-700 px-3 py-1.5 rounded border border-red-200 ml-auto"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (gameBall) {
    return (
      <div className="mt-4 bg-yellow-50 border border-yellow-300 rounded-lg p-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-yellow-800 mb-1">{label || "Game Ball"}</h3>
            <p className="text-sm">
              <span className="font-bold">{gameBall.playerName}</span> &mdash; {gameBall.reason}
            </p>
          </div>
          <button
            onClick={onStartEdit}
            className="text-xs text-yellow-700 hover:text-yellow-900 px-2 py-1 rounded border border-yellow-300 hover:bg-yellow-100"
          >
            Edit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <button
        onClick={onStartEdit}
        className="text-xs text-gray-500 hover:text-yellow-700 px-3 py-1.5 rounded border border-dashed border-gray-300 hover:border-yellow-400 transition-colors"
      >
        + Add Game Ball
      </button>
    </div>
  );
}
