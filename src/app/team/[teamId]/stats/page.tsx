"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

const INFIELD = ["1B", "2B", "3B", "SS"] as const;
const OUTFIELD = ["LF", "CF", "RF"] as const;
const BATTERY = ["P", "C"] as const;
const ALL_POSITIONS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"] as const;

interface Player {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  jerseyNumber: string | null;
}

interface StatsData {
  players: Player[];
  gameCount: number;
  stats: Record<string, Record<string, number>>;
}

export default function StatsPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const teamId = params.teamId as string;

  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    const res = await fetch(`/api/teams/${teamId}/stats`);
    if (res.ok) {
      const stats = await res.json();
      setData(stats);
    }
    setLoading(false);
  }, [teamId]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated") fetchStats();
  }, [status, router, fetchStats]);

  if (loading || !data) {
    return <div className="flex items-center justify-center py-20 text-gray-400">Loading...</div>;
  }

  const getPlayerSummary = (playerId: string) => {
    const counts = data.stats[playerId] || {};
    const infield = INFIELD.reduce((sum, pos) => sum + (counts[pos] || 0), 0);
    const outfield = OUTFIELD.reduce((sum, pos) => sum + (counts[pos] || 0), 0);
    const pitcher = counts["P"] || 0;
    const catcher = counts["C"] || 0;
    const bench = counts["BENCH"] || 0;
    const fieldInnings = infield + outfield + pitcher + catcher;
    const totalInnings = fieldInnings + bench;
    return { infield, outfield, pitcher, catcher, bench, fieldInnings, totalInnings, counts };
  };

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Player Stats</h1>
          <p className="text-sm text-gray-500">
            Based on {data.gameCount} locked {data.gameCount === 1 ? "game" : "games"}
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href={`/team/${teamId}/roster`}
            className="no-print text-sm text-green-700 hover:underline self-center"
          >
            &larr; Back to Roster
          </Link>
          <button
            onClick={() => window.print()}
            className="no-print text-sm px-3 py-1.5 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
          >
            Print Stats
          </button>
        </div>
      </div>

      {data.gameCount === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
          <p className="text-amber-800 font-medium">No locked games yet</p>
          <p className="text-sm text-amber-700 mt-1">
            Lock a game to start tracking player stats.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.players.map((player) => {
            const s = getPlayerSummary(player.id);
            const infieldPct = pct(s.infield, s.fieldInnings);
            const outfieldPct = pct(s.outfield, s.fieldInnings);
            const batteryPct = pct(s.pitcher + s.catcher, s.fieldInnings);
            const benchPct = pct(s.bench, s.totalInnings);

            return (
              <div key={player.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm" style={{ breakInside: "avoid" }}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {player.name}
                      {player.jerseyNumber && (
                        <span className="text-sm text-gray-400 ml-2">#{player.jerseyNumber}</span>
                      )}
                    </h3>
                    <p className="text-xs text-gray-500">
                      {s.fieldInnings} field {s.fieldInnings === 1 ? "inning" : "innings"} &middot; {s.bench} on bench
                    </p>
                  </div>
                </div>

                {/* Field time breakdown */}
                <div className="mb-3">
                  <div className="flex items-center text-xs text-gray-600 mb-1">
                    <span className="font-medium">Field time breakdown</span>
                  </div>
                  <div className="flex h-6 rounded-md overflow-hidden border border-gray-200">
                    {s.fieldInnings === 0 ? (
                      <div className="w-full bg-gray-100 flex items-center justify-center text-xs text-gray-400">
                        No field time yet
                      </div>
                    ) : (
                      <>
                        {infieldPct > 0 && (
                          <div
                            className="bg-blue-500 text-white text-xs flex items-center justify-center"
                            style={{ width: `${infieldPct}%`, backgroundColor: "#3b82f6", color: "#fff" }}
                            title={`Infield: ${s.infield} innings`}
                          >
                            {infieldPct >= 8 ? `${infieldPct}%` : ""}
                          </div>
                        )}
                        {outfieldPct > 0 && (
                          <div
                            className="bg-green-500 text-white text-xs flex items-center justify-center"
                            style={{ width: `${outfieldPct}%`, backgroundColor: "#22c55e", color: "#fff" }}
                            title={`Outfield: ${s.outfield} innings`}
                          >
                            {outfieldPct >= 8 ? `${outfieldPct}%` : ""}
                          </div>
                        )}
                        {batteryPct > 0 && (
                          <div
                            className="bg-amber-500 text-white text-xs flex items-center justify-center"
                            style={{ width: `${batteryPct}%`, backgroundColor: "#f59e0b", color: "#fff" }}
                            title={`Pitcher/Catcher: ${s.pitcher + s.catcher} innings`}
                          >
                            {batteryPct >= 8 ? `${batteryPct}%` : ""}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex gap-4 mt-2 text-xs">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 bg-blue-500 rounded-sm" style={{ backgroundColor: "#3b82f6" }} />
                      Infield: <span className="font-semibold">{infieldPct}%</span> ({s.infield})
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 bg-green-500 rounded-sm" style={{ backgroundColor: "#22c55e" }} />
                      Outfield: <span className="font-semibold">{outfieldPct}%</span> ({s.outfield})
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 bg-amber-500 rounded-sm" style={{ backgroundColor: "#f59e0b" }} />
                      P/C: <span className="font-semibold">{batteryPct}%</span> ({s.pitcher + s.catcher})
                    </span>
                    <span className="flex items-center gap-1 text-gray-500 ml-auto">
                      Bench: <span className="font-semibold">{benchPct}%</span> ({s.bench})
                    </span>
                  </div>
                </div>

                {/* Per-position grid */}
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-1">Innings by position</div>
                  <div className="grid grid-cols-9 gap-1">
                    {ALL_POSITIONS.map((pos) => {
                      const count = s.counts[pos] || 0;
                      const isInfield = (INFIELD as readonly string[]).includes(pos);
                      const isOutfield = (OUTFIELD as readonly string[]).includes(pos);
                      const isBattery = (BATTERY as readonly string[]).includes(pos);
                      const neverPlayed = count === 0;
                      const accent = isInfield
                        ? "bg-blue-50 border-blue-200 text-blue-700"
                        : isOutfield
                          ? "bg-green-50 border-green-200 text-green-700"
                          : isBattery
                            ? "bg-amber-50 border-amber-200 text-amber-700"
                            : "bg-gray-50 border-gray-200 text-gray-600";
                      const printStyle = neverPlayed
                        ? { backgroundColor: "#fef2f2", borderColor: "#fecaca", color: "#f87171" }
                        : isInfield
                          ? { backgroundColor: "#eff6ff", borderColor: "#bfdbfe", color: "#1d4ed8" }
                          : isOutfield
                            ? { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0", color: "#15803d" }
                            : isBattery
                              ? { backgroundColor: "#fffbeb", borderColor: "#fde68a", color: "#b45309" }
                              : { backgroundColor: "#f9fafb", borderColor: "#e5e7eb", color: "#4b5563" };
                      return (
                        <div
                          key={pos}
                          className={`border rounded-md px-2 py-1.5 text-center ${
                            neverPlayed
                              ? "bg-red-50 border-red-200 text-red-400"
                              : accent
                          }`}
                          style={printStyle}
                          title={neverPlayed ? `Never played ${pos}` : `${count} innings at ${pos}`}
                        >
                          <div className="text-[10px] font-semibold uppercase tracking-wide">{pos}</div>
                          <div className={`text-sm font-bold ${neverPlayed ? "" : ""}`}>
                            {neverPlayed ? "—" : count}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
