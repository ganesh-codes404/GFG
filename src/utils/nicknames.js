// Every game engine only knows seats, not nicknames -- server.js attaches
// `seatNicknames` (an array indexed by seat) to every state broadcast
// generically, so this is the one place each game's client turns that back
// into "show the real name instead of Player 3".

export function nameFor(state, seat) {
  if (seat === null || seat === undefined) return "";
  return state?.seatNicknames?.[seat] || `Player ${seat + 1}`;
}

// Server-generated log/event text still says "Player 3" (engines don't know
// nicknames), so swap it in after the fact for display.
export function withNicknames(text, state) {
  if (!state?.seatNicknames || typeof text !== "string") return text;
  return text.replace(/Player (\d+)/g, (match, num) => {
    const seat = Number(num) - 1;
    return state.seatNicknames[seat] || match;
  });
}

export function logWithNicknames(log, state) {
  if (!state?.seatNicknames || !Array.isArray(log)) return log;
  return log.map((line) => withNicknames(line, state));
}
