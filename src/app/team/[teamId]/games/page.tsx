"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Game {
  id: string;
  opponent: string;
  date: string;
  isLocked: boolean;
  _count: { innings: number };
}

interface Team {
  id: string;
  name: string;
  players: { id: string }[];
}

export default function GamesPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const teamId = params.teamId as string;

  const [games, setGames] = useState<Game[]>([]);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated") {
      Promise.all([
        fetch(`/api/teams/${teamId}`).then((r) => r.json()),
        fetch(`/api/teams/${teamId}/games`).then((r) => r.json()),
      ]).then(([teamData, gamesData]) => {
        setTeam(teamData);
        setGames(gamesData);
        setLoading(false);
      });
    }
  }, [status, router, teamId]);

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-gray-400">Loading...</div>;
  }

  const canCreateGame = team && team.players.length === 12;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{team?.name} Games</h1>
          <Link href={`/team/${teamId}/roster`} className="text-sm text-green-700 hover:underline">
            Back to Roster
          </Link>
        </div>
        {canCreateGame ? (
          <Link
            href={`/team/${teamId}/games/new`}
            className="bg-green-700 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-600 transition-colors text-sm"
          >
            + New Game
          </Link>
        ) : (
          <span className="text-sm text-gray-400">Need 12 players to create games</span>
        )}
      </div>

      {games.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl shadow-sm">
          <div className="text-5xl mb-4">&#9918;</div>
          <h2 className="text-xl font-semibold text-gray-700">No games yet</h2>
          <p className="text-gray-500 mt-1">Create your first game to see the lineup!</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {games.map((game) => (
            <Link
              key={game.id}
              href={`/team/${teamId}/games/${game.id}`}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow flex items-center justify-between"
            >
              <div>
                <h3 className="font-semibold text-gray-900">
                  {team?.name} vs. {game.opponent}
                </h3>
                <p className="text-sm text-gray-500">
                  {new Date(game.date).toLocaleDateString("en-US", {
                    weekday: "short",
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {game.isLocked && (
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Locked</span>
                )}
                <span className="text-gray-400 text-lg">&rarr;</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
