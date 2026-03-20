# EasyGameManager — Design Document

## Overview

EasyGameManager is a youth baseball team management app that automatically generates fair, balanced game lineups. It assigns 9 field positions across 6 innings for a roster of 10+ players, rotating bench time and positions to ensure every kid gets meaningful playing time.

## Tech Stack

- **Framework**: Next.js 15.2 (App Router) with React 19
- **Styling**: Tailwind CSS 4
- **Database**: PostgreSQL via Prisma ORM 6.19
- **Auth**: NextAuth.js (credentials + OAuth)
- **Deployment**: Render

## Data Model

### Core Entities

- **Team** — a baseball team with coaches and players
- **Player** — belongs to a team, has a batting order, optional pool player flag
- **PlayerRating** — per-position skill rating (1–9) or DNP (0) per player
- **Game** — an opponent matchup on a date, can be locked (finalized)
- **InningAssignment** — the core output: which player plays which position in which inning
- **GameExclusion** — marks a player as absent for a specific game
- **GameBattingOrder** — per-game batting order override (vs. team default)
- **GameBall** — post-game awards given to players

### Relationships

- A Team has many Players and Games
- A Game has 6 innings × 9+ players = many InningAssignments
- Players can be "pool players" borrowed for a single game
- Games can have exclusions (absent players) and per-game batting orders

## Algorithm Design

The lineup algorithm lives in `src/lib/algorithm.ts`. It generates all InningAssignments for a game in one pass.

### Input

- `players`: all active players with their ratings
- `seasonHistory`: aggregated stats from all prior locked games
- `lockedPitchers` (optional): user-pinned pitcher assignments
- `lockedPositions` (optional): user-pinned position assignments ("holds")

### Phases (in order)

1. **Bench Scheduling** — Determine who sits each inning (when roster > 9)
2. **Pitching Schedule** — Assign pitchers across 6 innings (2-inning consecutive blocks preferred)
3. **Catching Schedule** — Assign catchers across 6 innings (2-inning blocks, avoiding pitcher conflicts)
4. **Field Position Assignment** — Fill remaining 7 positions per inning using greedy scoring
5. **Post-Processing** — Swap to fix DNP violations and guarantee infield time

### Algorithm Rules (Priority Order)

These rules are listed in strict priority order. Higher rules override lower ones when conflicts arise.

1. **No blank positions** — Every position in every inning must be filled by a player. This is an absolute constraint.

2. **Cross-game bench rotation** — A player who starts on the bench (inning 1) in one game must start in the field the next game. Prevents any player from being benched at the start of consecutive games.

3. **Max 2 bench innings per game** — No player sits more than 2 innings in a single game.

4. **No consecutive bench innings** — A player cannot sit innings N and N+1. Bench innings must be separated by at least one playing inning.

5. **DNP (Do Not Play) enforcement** — A player with a 0 rating for a position must never be assigned there. The algorithm respects this at every stage:
   - Greedy assignment skips DNP positions
   - Post-assignment swap fixes any violations
   - Safety fallback respects DNP
   - Only as an absolute last resort (all remaining players have DNP for all remaining positions) will DNP be overridden to satisfy rule #1

6. **Rating-based bench targeting** — Lower-rated players (by average across all positions) sit 2 innings; higher-rated players sit 1 inning (or 0 if roster allows). This means the best players get the most field time.

7. **Bench distribution & mixing** — Bench scheduling uses a 3-phase approach:
   - Phase 1: Place 2-inning bench players in non-consecutive pairs, spread across the game
   - Phase 2: Place 1-inning bench players, preferring innings that already have 2-inning players (mixing)
   - Phase 3: Fill remaining gaps with fallback logic
   - Goal: avoid clustering all 1-inning (best) players on the bench at the same time

8. **Infield guarantee** — Every player must play an infield position (3B, SS, 2B, 1B) at least once per game. Enforced via:
   - Scoring boost (+2) for players without infield time during greedy assignment
   - Post-processing swap: players stuck in outfield all game get swapped with infielders who have spare infield innings

9. **Position variety** — The scoring system penalizes repeat positions (both within a game and across the season) to naturally rotate players through different positions.

10. **Inning importance weighting** — Innings 1–2 and 5–6 are weighted 1.5× (face best hitters); innings 3–4 weighted 0.8× (face weaker hitters). Higher-rated players are preferred in important innings.

### Scoring Formula (Field Position Assignment)

For each unfilled position in each inning, every available player gets a score:

```
score = rating × inningImportance
      - 8 if rating ≤ 2        (strong penalty for weak positions)
      - 3 if rating ≤ 3        (moderate penalty)
      - seasonCount × 0.3      (reduce repeats across season)
      - gameCount × 3          (strongly reduce repeats within game)
      + 1 if low-importance inning and rating < 5  (give weaker players easier innings)
      + 2 if infield position and player has no infield yet this game
```

### Constrained Position Ordering

Positions are not filled in a fixed order. Instead, for each inning, positions are sorted by the number of eligible (non-DNP) players — most constrained positions first. This prevents the greedy algorithm from "using up" the only eligible player for a more constrained position.

### Pitching Rules

- Each pitcher throws 1 or 2 innings
- 2-inning blocks must be consecutive
- Algorithm prefers 3 pitchers × 2 innings
- Players who haven't pitched this season get a +2 bonus
- DNP for pitcher (rating 0) is respected

### Catching Rules

- Same structure as pitching: 1 or 2 consecutive inning blocks
- Catcher cannot be the same player pitching that inning
- Season history reduces repeat catching assignments

## UI Architecture

### Pages

- `/` — Landing/dashboard
- `/team/[teamId]/roster` — Player management (names, batting order, ratings including DNP)
- `/team/[teamId]/games` — Game list with create/manage
- `/team/[teamId]/games/[gameId]` — Game plan view (the main UI)

### Game Plan Page Features

- **Baseball field visualization** — Diamond layout showing all 9 positions per inning
- **Inning navigation** — View/edit each of the 6 innings
- **Drag-and-drop** — Reorder batting lineup
- **Position dropdowns** — Change any player's position (filters out DNP options)
- **Pitching mode** — Toggle to prioritize pitcher selection; changes trigger full regeneration
- **Hold positions** — Pin specific player-position assignments, then regenerate around them
- **Lock/unlock** — Finalize a game plan (locked games feed into season history)
- **Bench color coding** — 2-inning bench players get shared colors across their bench slots for visual clarity
- **Print view** — Print-friendly layout with bench colors preserved
- **Game ball awards** — Post-game recognition for players
- **Absent players** — Exclude players from a game
- **Pool players** — Add temporary players for a single game

### Regeneration Flow

When a user changes a pitcher or position via dropdown:
1. The held/locked assignments are sent to the API
2. The API calls `generateGamePlan()` with `lockedPitchers` and `lockedPositions`
3. The algorithm respects all locks while optimizing everything else
4. The full lineup is regenerated and saved
5. The UI refreshes with the new assignments

## API Routes

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/teams` | GET, POST | List/create teams |
| `/api/teams/[teamId]` | GET, PUT | Team details, update |
| `/api/teams/[teamId]/players` | GET, POST | List/create players |
| `/api/teams/[teamId]/players/[playerId]` | PUT, DELETE | Update/delete player (triggers future game regeneration) |
| `/api/teams/[teamId]/games` | GET, POST | List/create games (POST generates lineup) |
| `/api/teams/[teamId]/games/[gameId]` | GET, PUT | Game details, lock/unlock, update info |
| `/api/teams/[teamId]/games/[gameId]/assignments` | PUT | Direct assignment updates |
| `/api/teams/[teamId]/games/[gameId]/regenerate` | POST | Regenerate with locked positions |
| `/api/teams/[teamId]/games/[gameId]/batting-order` | PUT | Per-game batting order |
| `/api/teams/[teamId]/games/[gameId]/game-ball` | PUT, DELETE | Game ball awards |
| `/api/teams/[teamId]/coaches` | GET, POST | Manage team coaches |

## Season History

`buildSeasonHistory()` aggregates data from all locked games to inform future game generation:

- **positionCounts** — How many times each player has played each position
- **totalBenchInnings** — Total bench innings across the season
- **hasPitched** — Whether the player has ever pitched
- **startedOnBenchLastGame** — Whether the player was benched in inning 1 of the most recent game (for cross-game rotation rule)

When a player's ratings are updated, all future (unlocked) games are automatically regenerated to reflect the changes.

## Design Principles

1. **Fairness first** — The algorithm's primary job is making sure every kid gets fair, balanced playing time. No player should feel stuck at one position or always benched.

2. **Constraint satisfaction over optimization** — Hard constraints (no blanks, DNP, cross-game bench rotation) are never violated except as an absolute last resort. Soft constraints (variety, distribution) are pursued via scoring.

3. **Graceful degradation** — When constraints conflict, the algorithm relaxes lower-priority rules first. The fallback chain is: try ideal → relax bench mixing → relax consecutive bench → allow over-target → override DNP (absolute last resort).

4. **Coach control** — The algorithm generates a starting point, but coaches can override any assignment. Holds and locks let coaches pin decisions while the algorithm optimizes everything else.

5. **Season awareness** — Every game considers the full season history so that position rotation and bench fairness accumulate correctly over time.

6. **Simple UI, complex engine** — The interface should feel intuitive (click to change, drag to reorder) while the algorithm handles the hard combinatorics underneath.
