// Games with a playable page, and the route to launch them at.
export const GAME_ROUTES = {
  "Battle Royale": "/battle-royale",
  "Secret Agent": "/secret-agent",
  "Chess": "/chess",
  "Connect 4": "/connect-4",
  "Catan": "/catan",
};

// Games that only work with an exact headcount (no more, no less).
export const GAME_EXACT_PLAYERS = {
  "Battle Royale": 7,
  "Secret Agent": 7,
  "Chess": 2,
  "Connect 4": 2,
};

// Games with a server-authoritative session (server/games/*) -- their state
// lives on the server and syncs to every device. Games not listed here still
// start together (everyone gets routed to the page at once), but each
// browser runs its own local simulation until they're ported too.
export const NETWORKED_GAMES = new Set(["Chess", "Connect 4"]);
