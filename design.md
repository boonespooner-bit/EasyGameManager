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
- **TeamMember** — links a User to a Team with a role (`head_coach`, `assistant_coach`, or `viewer`). Max 7 members per team (1 head coach + 6 assistants/viewers).
- **Player** — belongs to a team, has `firstName`, `lastName`, `jerseyNumber` (optional), a computed `name` (`firstName + lastName`), a batting order, and an optional pool player flag
- **PlayerRating** — per-position skill rating (1–9) or DNP (0) per player
- **Game** — an opponent matchup on a date, can be locked (finalized). Stores `heldPositions` as JSON for persisting coach-pinned assignments across page refreshes and lock/unlock cycles.
- **InningAssignment** — the core output: which player plays which position in which inning
- **GameExclusion** — marks a player as absent for a specific game
- **GameBattingOrder** — per-game batting order override (vs. team default)
- **GameBall** — post-game awards given to players

### Relationships

- A Team has many TeamMembers (coaches) and Players and Games
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

### Suggest Positions

The "Suggest Positions" feature generates a recommended lineup based on historical coaching patterns from all previous locked games. Unlike regular generation (which promotes variety), suggestions mirror the coach's actual historical decisions.

**How it works:**

1. The suggest endpoint (`POST /api/teams/[teamId]/games/[gameId]/suggest`) queries all locked games
2. It builds **per-player, per-position, per-inning frequency maps** — e.g., "Teddy caught in inning 1 across 5 games"
3. It passes this `historicalFrequency` data to `generateGamePlan()` alongside season history
4. Suggestions are returned without saving to the database

**Suggest mode scoring (field positions):**

When `historicalFrequency` is provided, the scoring formula changes:

```
score = rating × inningImportance
      + inningFreq × 3.0        (strong boost for this player at this position in this inning)
      + anyInningFreq × 0.5     (mild boost for this player at this position across all innings)
      - gameCount × 3           (still avoid repeats within this game)
```

This replaces the normal mode's `-seasonCount × 0.3` penalty with positive boosts from historical frequency, so players are suggested for positions where the coach has consistently placed them.

**Suggest mode pitching/catching:**

- Pitchers are ranked by total historical pitching frequency (`+totalPitchInnings × 1.5`) instead of the normal "hasn't pitched" bonus
- For each inning pair, candidates are re-sorted by their specific inning frequency — if Teddy pitched innings 1-2 most often, he'll be suggested there
- Catching uses the same approach: historical catching frequency boosts (`+totalCatchInnings × 1.5`) replace the season penalty, with per-inning re-ranking

**UI flow:**

1. Coach clicks "Suggest Positions" (only available when game is unlocked)
2. A preview overlay shows the suggested lineup in a positions-by-innings grid with bench assignments
3. "Accept" applies the suggestions to the game and clears all held positions
4. "Dismiss" closes the overlay with no changes

## UI Architecture

### Pages

- `/` — Landing/dashboard
- `/login` — Sign in / sign up (credentials or Google OAuth)
- `/team/[teamId]/roster` — Player management, game ball tracker, coach management
- `/team/[teamId]/games` — Game list with create/manage
- `/team/[teamId]/games/[gameId]` — Game plan view (the main UI)

### Game Plan Page Features

- **Baseball field visualization** — Diamond layout showing all 9 positions per inning. Field positions display first names only (both screen and print). Batting order printout shows full names with jersey numbers.
- **Inning navigation** — View/edit each of the 6 innings
- **Drag-and-drop** — Reorder batting lineup
- **Position dropdowns** — Change any player's position (filters out DNP options). Dropdowns show first names and filter by first name.
- **Pitching mode** — Toggle to prioritize pitcher selection; changes trigger full regeneration
- **Hold positions** — Pin specific player-position assignments, then regenerate around them. Held positions persist to the database (as JSON on the Game model) so they survive page refreshes and lock/unlock cycles.
- **Swap dialog** — When a coach selects a player who is already locked at another position in the same inning, a dialog appears showing the conflict and offering to swap positions with confirm/cancel. If the player is on the bench, the swap proposes moving the displaced player to the bench.
- **Suggest positions** — Analyzes coaching patterns from all previous locked games and generates a suggested lineup using the same algorithm. Shows a preview overlay with a positions-by-innings grid (including bench). Coach can "Accept" to apply the suggestions or "Dismiss" to close without changes. Only available when the game is unlocked.
- **Lock/unlock** — Finalize a game plan (locked games feed into season history). When unlocking, all positions and held/locked status are preserved exactly as they were before locking.
- **Previous game bench display** — Shows which players were benched in inning 1 of the most recent game, informing the cross-game bench rotation rule.
- **Bench color coding** — 2-inning bench players get shared colors across their bench slots for visual clarity
- **Bench count summary** — Color-coded chips below the bench grid showing how many times each player is benched in this game (screen and print). Colors: yellow (0), green (1), orange (2), red (3+).
- **Print view** — Print-friendly layout with bench colors, bench count summary, and batting order with jersey numbers preserved
- **Game ball awards** — Post-game recognition for players
- **Absent players** — Exclude players from a game via the roster management panel
- **Pool players** — Add temporary players for a single game with custom position ratings

### Roster Page Features

- **Player form** — 4-column layout: first name, last name, jersey number, batting order. The `name` field is computed from `firstName + lastName`.
- **Position ratings grid** — Per-position skill ratings (1–9) or DNP (0) for each player
- **Pitching tracker** — Shows pitching history across games
- **Game ball tracker** — Two sections: "Needs a game ball" (orange, players who haven't received one) and "Has received" (yellow with count badge). Helps coaches track recognition fairness.
- **Coach management** (head coach only):
  - **Invite** — Add assistant coaches or viewers by email
  - **Role toggle** — Switch between assistant_coach (edit access) and viewer (read-only) via a green/gray toggle
  - **Remove** — Remove a coach from the team with confirmation dialog

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
| `/api/teams/[teamId]` | GET, DELETE | Team details; delete team (head coach only) |
| `/api/teams/[teamId]/players` | GET, POST | List/create players |
| `/api/teams/[teamId]/players/[playerId]` | PUT, DELETE | Update/delete player (triggers future game regeneration) |
| `/api/teams/[teamId]/games` | GET, POST | List/create games (POST generates lineup) |
| `/api/teams/[teamId]/games/[gameId]` | GET, PUT, DELETE | Game details, lock/unlock, update info, delete game |
| `/api/teams/[teamId]/games/[gameId]/assignments` | PUT | Direct assignment updates |
| `/api/teams/[teamId]/games/[gameId]/regenerate` | POST | Regenerate with locked positions |
| `/api/teams/[teamId]/games/[gameId]/roster` | POST | Manage game roster (exclude/include players, add/remove pool players) |
| `/api/teams/[teamId]/games/[gameId]/suggest` | POST | Generate suggested positions from historical coaching patterns |
| `/api/teams/[teamId]/games/[gameId]/batting-order` | PUT | Per-game batting order |
| `/api/teams/[teamId]/games/[gameId]/game-ball` | PUT, DELETE | Game ball awards |
| `/api/teams/[teamId]/coaches` | POST, PATCH, DELETE | Invite coach by email, toggle role, remove coach |

## Authentication & Permissions

### Auth Flow

- **Credentials provider** — Email + password sign-in and sign-up via NextAuth.js
- **Google OAuth** — Optional, enabled when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set
- **JWT sessions** — Token-based sessions with `userId` stored in the JWT

### Coach Invite Flow

1. Head coach invites by email via POST to `/api/teams/[teamId]/coaches`
2. If the email doesn't exist in the system, a User record is created without a password
3. The invited person signs up at `/login` with that email and sets a password
4. The credentials provider detects the existing passwordless account and updates it with the hashed password
5. The user is now authenticated and can access the team based on their role

### Role-Based Access Control

- **head_coach** — Full access: manage roster, create/edit/delete games, manage coaches, lock/unlock games
- **assistant_coach** — Edit access: manage roster, create/edit games, but cannot manage coaches or delete the team
- **viewer** — Read-only access: can view games and roster but cannot make changes. Every mutation API endpoint checks for `viewer` role and returns 403.

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

7. **Name display strategy** — Field positions and bench show first names only for readability. Batting order printouts show full names with jersey numbers (`#XX`). The `name` field is kept as a computed value (`firstName + lastName`) for backward compatibility. Pool players set `firstName = name` since they're created with just a name.
