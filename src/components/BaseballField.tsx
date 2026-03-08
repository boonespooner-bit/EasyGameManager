"use client";

import { useState, useCallback } from "react";
import { POSITIONS, INNINGS, type FieldPosition } from "@/types";

interface Assignment {
  playerId: string;
  playerName: string;
  inning: number;
  position: FieldPosition;
}

interface Props {
  assignments: Assignment[];
  battingOrder: { playerId: string; playerName: string; order: number }[];
  opponent: string;
  date: string;
  teamName: string;
  isLocked: boolean;
  onUpdate?: (assignments: Assignment[]) => void;
  onBattingOrderUpdate?: (order: { playerId: string; playerName: string; order: number }[]) => void;
  pitchingMode?: boolean;
  allPlayers?: { id: string; name: string }[];
  onPitcherChange?: (inning: number, playerId: string) => void;
  regenerating?: boolean;
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
  regenerating,
}: Props) {
  const [dragSource, setDragSource] = useState<{ position: string; inning: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [battingDragIndex, setBattingDragIndex] = useState<number | null>(null);
  const [battingDragOverIndex, setBattingDragOverIndex] = useState<number | null>(null);

  const getPlayersAtPosition = (position: string) => {
    return INNINGS.map((inning) => {
      const a = assignments.find((a) => a.position === position && a.inning === inning);
      return a ? { inning, playerId: a.playerId, name: a.playerName } : null;
    });
  };

  const getBenchByInning = () => {
    return INNINGS.map((inning) => ({
      inning,
      players: assignments
        .filter((a) => a.position === "BENCH" && a.inning === inning)
        .map((a) => ({ playerId: a.playerId, name: a.playerName })),
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

  return (
    <div className="max-w-6xl mx-auto">
      {/* Title */}
      <div className="text-center mb-4">
        <h1 className="text-2xl font-bold text-gray-900">
          {teamName} vs. {opponent}
        </h1>
        <p className="text-gray-500">{new Date(date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
        {isLocked && (
          <span className="inline-block mt-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
            Locked (Historical)
          </span>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-2 rounded-lg mb-4 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold ml-4">&times;</button>
        </div>
      )}

      {!isLocked && (
        <p className="text-xs text-gray-400 mb-2 text-center">Drag players between positions and innings to rearrange</p>
      )}

      <div className="flex gap-6">
        {/* Field */}
        <div className="flex-1">
          <div className="relative bg-green-600 rounded-2xl overflow-hidden" style={{ paddingBottom: "100%" }}>
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
              return (
                <div
                  key={pos}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${coord.x}%`, top: `${coord.y}%` }}
                >
                  {isPitcher ? (
                    <PitcherBox
                      players={players}
                      allPlayers={allPlayers || []}
                      onPitcherChange={onPitcherChange}
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
              {getBenchByInning().map(({ inning, players }) => (
                <div
                  key={inning}
                  className="bg-gray-100 border border-gray-300 rounded p-2 min-h-[80px]"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop("BENCH", inning)}
                >
                  <div className="text-xs font-bold text-gray-500 mb-1">Inn {inning}</div>
                  {players.map((p) => (
                    <div
                      key={p.playerId}
                      className="text-xs bg-white rounded px-1 py-0.5 mb-0.5 border truncate cursor-grab active:cursor-grabbing"
                      draggable={!isLocked}
                      onDragStart={() => handleDragStart("BENCH", inning)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.stopPropagation(); handleDrop("BENCH", inning); }}
                    >
                      {p.name}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
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
                <span className="text-sm">{b.playerName}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PitcherBox({
  players,
  allPlayers,
  onPitcherChange,
  disabled,
}: {
  players: ({ inning: number; playerId: string; name: string } | null)[];
  allPlayers: { id: string; name: string }[];
  onPitcherChange?: (inning: number, playerId: string) => void;
  disabled: boolean;
}) {
  const [editingInning, setEditingInning] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [dragOverInning, setDragOverInning] = useState<number | null>(null);

  const filtered = search.trim()
    ? allPlayers.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()),
      )
    : allPlayers;

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
                  {filtered.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded shadow-lg z-50 max-h-32 overflow-y-auto mt-0.5">
                      {filtered.map((pl) => (
                        <button
                          key={pl.id}
                          className="block w-full text-left text-[10px] px-2 py-1 hover:bg-red-50 truncate"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectPlayer(inning, pl.id);
                          }}
                        >
                          {pl.name}
                        </button>
                      ))}
                    </div>
                  )}
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
}: {
  position: string;
  players: ({ inning: number; playerId: string; name: string } | null)[];
  isLocked: boolean;
  onDragStart: (pos: string, inning: number) => void;
  onDrop: (pos: string, inning: number) => void;
  isDragging: boolean;
}) {
  return (
    <div className="bg-white/95 rounded shadow-md border border-gray-300 min-w-[90px]">
      <div className="bg-gray-800 text-white text-xs font-bold px-2 py-0.5 text-center rounded-t">
        {position}
      </div>
      <div className="p-1">
        {players.map((p, i) => (
          <div
            key={i}
            className={`flex items-center gap-1 text-[10px] px-1 py-0.5 rounded mb-0.5 transition-colors ${
              p ? "bg-blue-50 hover:bg-blue-100 cursor-grab active:cursor-grabbing" : "bg-gray-50"
            } ${isDragging && !p ? "ring-1 ring-blue-300" : ""}`}
            draggable={!isLocked && !!p}
            onDragStart={() => p && onDragStart(position, p.inning)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.stopPropagation(); onDrop(position, i + 1); }}
          >
            <span className="font-bold text-gray-400 w-3">{i + 1}.</span>
            <span className="truncate">{p?.name || "\u2014"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
