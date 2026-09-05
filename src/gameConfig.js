// Games with a playable page, and the route to launch them at.
export const GAME_ROUTES = {
  "Battle Royale": "/battle-royale",
  "Secret Agent": "/secret-agent",
  "Chess": "/chess",
  "Connect 4": "/connect-4",
  "Catan": "/catan",
  "One and Only": "/one-and-only",
  "Andhra Business": "/andhra-business",
  "Snakes and Ladders": "/snakes-and-ladders",
};

// Games that only work with an exact headcount (no more, no less).
export const GAME_EXACT_PLAYERS = {
  "Battle Royale": 7,
  "Secret Agent": 7,
  "Chess": 2,
  "Connect 4": 2,
};

// Games that work across a range of headcounts (min/max inclusive).
export const GAME_PLAYER_RANGE = {
  "Catan": { min: 3, max: 5 },
  "One and Only": { min: 2, max: 5 },
  "Andhra Business": { min: 4, max: 7 },
  "Snakes and Ladders": { min: 3, max: 7 },
};

// Games with a server-authoritative session (server/games/*) -- their state
// lives on the server and syncs to every device. Games not listed here still
// start together (everyone gets routed to the page at once), but each
// browser runs its own local simulation until they're ported too.
export const NETWORKED_GAMES = new Set([
  "Chess",
  "Connect 4",
  "Catan",
  "One and Only",
  "Andhra Business",
  "Snakes and Ladders",
]);

export function playerCountRequirementLabel(game) {
  if (GAME_EXACT_PLAYERS[game] !== undefined) {
    return `NEEDS ${GAME_EXACT_PLAYERS[game]} PLAYERS`;
  }

  const range = GAME_PLAYER_RANGE[game];
  if (range) return `NEEDS ${range.min}-${range.max} PLAYERS`;

  return "WAITING FOR PLAYERS";
}

export function playerCountSatisfied(game, playerCount, maxPlayers) {
  if (GAME_EXACT_PLAYERS[game] !== undefined) {
    return playerCount === GAME_EXACT_PLAYERS[game];
  }

  const range = GAME_PLAYER_RANGE[game];
  if (range) return playerCount >= range.min && playerCount <= range.max;

  return playerCount === maxPlayers;
}
