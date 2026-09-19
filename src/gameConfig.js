// Which games are offered for selection at each room size -- shared by the
// initial create-room picker and the lobby's "pick more games" flow so the
// two never drift apart.
export const GAMES_BY_PLAYERS = {
  2: ["Chess", "Connect 4", "One and Only", "Word Rush", "Tic Tac Toe", "Checkers", "Guess Who", "Tambola"],
  3: ["Ludo", "One and Only", "Word Rush", "Snakes and Ladders", "Catan", "Guess Who", "Tambola"],
  4: ["Andhra Business", "Ludo", "Word Rush", "Snakes and Ladders", "Catan", "One and Only", "Guess Who", "Tambola"],
  5: ["Snakes and Ladders", "Imposter", "One and Only", "Catan", "Andhra Business", "Word Rush", "Pictionary", "Tambola"],
  6: ["Andhra Business", "Snakes and Ladders", "Word Rush", "Imposter", "Pictionary", "Battle Royale", "Secret Agent", "Tambola"],
  7: ["Battle Royale", "Secret Agent", "Andhra Business", "Snakes and Ladders", "Word Rush", "Imposter", "Pictionary", "Tambola"],
};

export const MAX_GAMES = 4;

// Games with a playable page, and the route to launch them at.
export const GAME_ROUTES = {
  "Battle Royale": "/battle-royale",
  "Secret Agent": "/secret-agent",
  "Chess": "/chess",
  "Connect 4": "/connect-4",
  "Tic Tac Toe": "/tic-tac-toe",
  "Catan": "/catan",
  "One and Only": "/one-and-only",
  "Andhra Business": "/andhra-business",
  "Snakes and Ladders": "/snakes-and-ladders",
  "Ludo": "/ludo",
  "Word Rush": "/word-rush",
  "Imposter": "/imposter",
  "Pictionary": "/pictionary",
  "Checkers": "/checkers",
  "Guess Who": "/guess-who",
  "Tambola": "/tambola",
};

// Games that only work with an exact headcount (no more, no less).
export const GAME_EXACT_PLAYERS = {
  "Chess": 2,
  "Connect 4": 2,
  "Checkers": 2,
  "Tic Tac Toe": 2,
};

// Games that work across a range of headcounts (min/max inclusive).
export const GAME_PLAYER_RANGE = {
  "Battle Royale": { min: 6, max: 7 },
  "Secret Agent": { min: 6, max: 7 },
  "Catan": { min: 3, max: 5 },
  "One and Only": { min: 2, max: 5 },
  "Andhra Business": { min: 4, max: 7 },
  "Snakes and Ladders": { min: 3, max: 7 },
  "Ludo": { min: 3, max: 4 },
  "Word Rush": { min: 2, max: 7 },
  "Imposter": { min: 5, max: 7 },
  "Pictionary": { min: 5, max: 7 },
  "Guess Who": { min: 2, max: 4 },
  "Tambola": { min: 2, max: 7 },
};

// Games with a server-authoritative session (server/games/*) -- their state
// lives on the server and syncs to every device. Games not listed here still
// start together (everyone gets routed to the page at once), but each
// browser runs its own local simulation until they're ported too.
export const NETWORKED_GAMES = new Set([
  "Chess",
  "Connect 4",
  "Tic Tac Toe",
  "Catan",
  "One and Only",
  "Andhra Business",
  "Snakes and Ladders",
  "Ludo",
  "Word Rush",
  "Imposter",
  "Pictionary",
  "Checkers",
  "Guess Who",
  "Tambola",
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
