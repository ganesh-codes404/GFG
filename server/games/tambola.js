// Standard 90-ball Tambola/Housie. Works for any group size -- there's no
// structural pairing or role split like the social-deduction games, every
// player just races their own ticket against the same shared call stream --
// so this supports the app's full 2-7 range.
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 7;

// Numbers are called automatically on a shared clock (same generic
// nextDeadline/advanceTime timer infrastructure Andhra Business and
// Pictionary use) -- long enough to actually look at your ticket and tap a
// claim, brisk enough to keep a big group's attention.
const CALL_INTERVAL_MS = 4500;

const COLUMN_RANGES = [
  [1, 9],
  [10, 19],
  [20, 29],
  [30, 39],
  [40, 49],
  [50, 59],
  [60, 69],
  [70, 79],
  [80, 90],
];

// Every check runs against the CLAIMING PLAYER'S OWN marked set, not just
// which numbers have been called -- a prize only counts numbers that
// player actually struck off their ticket themselves.
const PRIZES = [
  { id: "early-five", label: "Early Five", check: (ticket, markedSet) => countMarked(ticket, markedSet) >= 5 },
  { id: "top-line", label: "Top Line", check: (ticket, markedSet) => lineComplete(ticket[0], markedSet) },
  { id: "middle-line", label: "Middle Line", check: (ticket, markedSet) => lineComplete(ticket[1], markedSet) },
  { id: "bottom-line", label: "Bottom Line", check: (ticket, markedSet) => lineComplete(ticket[2], markedSet) },
  { id: "full-house", label: "Full House", check: (ticket, markedSet) => allMarked(ticket, markedSet) },
];

function fail(message) {
  throw new Error(message);
}

function playerLabel(seat) {
  return `Player ${seat + 1}`;
}

function log(state, message) {
  state.log.push(message);
  if (state.log.length > 100) state.log.shift();
}

function shuffle(array, rng) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Every column gets 1-3 numbers, summing to 15 across the 9 columns.
function generateColumnCounts(rng) {
  const counts = new Array(9).fill(1);
  let remaining = 15 - 9;
  while (remaining > 0) {
    const col = Math.floor(rng() * 9);
    if (counts[col] < 3) {
      counts[col]++;
      remaining--;
    }
  }
  return counts;
}

// Decides WHICH of the 3 rows each column's number(s) land in, so every row
// ends up with exactly 5 filled cells. Greedy degree-constrained placement
// (process the most-constrained columns -- the 3s -- first, always filling
// whichever rows still have the most room left): this is the standard
// construction for a bipartite degree sequence and always succeeds here
// since column degrees never exceed the row count (3).
function generateCellLayout(counts, rng) {
  const rowRemaining = [5, 5, 5];
  const cells = [new Array(9).fill(false), new Array(9).fill(false), new Array(9).fill(false)];

  const colOrder = shuffle(
    counts.map((_, i) => i),
    rng
  ).sort((a, b) => counts[b] - counts[a]);

  for (const col of colOrder) {
    const need = counts[col];
    const rowsByAvailability = shuffle([0, 1, 2], rng).sort((a, b) => rowRemaining[b] - rowRemaining[a]);
    const chosen = rowsByAvailability.slice(0, need);
    for (const r of chosen) {
      cells[r][col] = true;
      rowRemaining[r]--;
    }
  }

  return cells;
}

// A ticket is a 3x9 grid; each cell is a number or null (blank). Each row
// has exactly 5 numbers, each column's numbers come from its own 1-9/
// 10-19/.../80-90 range and read top-to-bottom in ascending order.
function generateTicket(rng) {
  const counts = generateColumnCounts(rng);
  const cells = generateCellLayout(counts, rng);
  const grid = [new Array(9).fill(null), new Array(9).fill(null), new Array(9).fill(null)];

  for (let col = 0; col < 9; col++) {
    const need = counts[col];
    const [lo, hi] = COLUMN_RANGES[col];
    const pool = [];
    for (let n = lo; n <= hi; n++) pool.push(n);
    const picked = shuffle(pool, rng).slice(0, need).sort((a, b) => a - b);

    const filledRows = [0, 1, 2].filter((r) => cells[r][col]);
    filledRows.forEach((row, idx) => {
      grid[row][col] = picked[idx];
    });
  }

  return grid;
}

function ticketNumbers(ticket) {
  return ticket.flat().filter((n) => n !== null);
}

function countMarked(ticket, calledSet) {
  return ticketNumbers(ticket).filter((n) => calledSet.has(n)).length;
}

function lineComplete(row, calledSet) {
  return row.filter((n) => n !== null).every((n) => calledSet.has(n));
}

function allMarked(ticket, calledSet) {
  return ticketNumbers(ticket).every((n) => calledSet.has(n));
}

function createInitialState(seatCount, rng = Math.random) {
  const players = Array.from({ length: seatCount }, (_, seat) => ({
    seat,
    ticket: generateTicket(rng),
    // Numbers this player has struck off their OWN ticket -- separate from
    // calledNumbers, since marking is now a manual tap, not automatic.
    marked: new Set(),
  }));

  const pool = shuffle(
    Array.from({ length: 90 }, (_, i) => i + 1),
    rng
  );

  return {
    players,
    pool,
    calledNumbers: [],
    nextCallAt: Date.now() + CALL_INTERVAL_MS,
    claims: {
      "early-five": null,
      "top-line": null,
      "middle-line": null,
      "bottom-line": null,
      "full-house": null,
    },
    phase: "playing",
    winner: null,
    log: ["Tambola begins! Numbers are called automatically -- claim a prize the moment you complete it."],
    rng,
  };
}

function handleClaimPrize(state, seat, prizeId) {
  if (state.phase !== "playing") fail("The game is already over.");

  const prize = PRIZES.find((p) => p.id === prizeId);
  if (!prize) fail("Unknown prize.");
  if (state.claims[prizeId] !== null) fail("That prize has already been claimed.");

  const player = state.players[seat];
  if (!player) fail("Invalid player.");

  if (!prize.check(player.ticket, player.marked)) fail(`You haven't completed ${prize.label} yet.`);

  state.claims[prizeId] = seat;
  log(state, `${playerLabel(seat)} claims ${prize.label}!`);

  if (prizeId === "full-house") {
    state.phase = "finished";
    state.winner = seat;
    log(state, `${playerLabel(seat)} wins Tambola with Full House!`);
  }
}

// Toggling lets a misclick be undone; the gates (must be called, must
// actually be on this player's ticket) make it impossible to mark
// something that wouldn't be a legitimate strike anyway.
function handleMarkNumber(state, seat, number) {
  if (state.phase !== "playing") fail("The game is already over.");

  const player = state.players[seat];
  if (!player) fail("Invalid player.");
  if (typeof number !== "number") fail("Invalid number.");
  if (!ticketNumbers(player.ticket).includes(number)) fail("That number isn't on your ticket.");
  if (!state.calledNumbers.includes(number)) fail("That number hasn't been called yet.");

  if (player.marked.has(number)) player.marked.delete(number);
  else player.marked.add(number);
}

const ACTION_HANDLERS = {
  "claim-prize": (state, seat, payload) => handleClaimPrize(state, seat, payload.prizeId),
  "mark-number": (state, seat, payload) => handleMarkNumber(state, seat, payload.number),
};

function applyAction(state, seat, action, payload) {
  if (state.phase === "finished") fail("The game is already over.");

  const handler = ACTION_HANDLERS[action];
  if (!handler) fail(`Unknown action: ${action}`);

  handler(state, seat, payload || {});
  return state;
}

// Numbers call themselves on a wall-clock schedule, no player action
// needed -- same generic timer hook Andhra Business/Pictionary use.
function nextDeadline(state) {
  if (state.phase !== "playing") return null;
  if (state.pool.length === 0) return null;
  return state.nextCallAt;
}

function advanceTime(state) {
  const now = Date.now();
  if (state.phase !== "playing") return state;
  if (state.nextCallAt === null || now < state.nextCallAt) return state;
  if (state.pool.length === 0) return state;

  const number = state.pool.shift();
  state.calledNumbers.push(number);
  log(state, `Number called: ${number}`);

  if (state.pool.length === 0) {
    state.nextCallAt = null;
    log(state, "All 90 numbers have been called.");
  } else {
    state.nextCallAt = now + CALL_INTERVAL_MS;
  }

  return state;
}

function viewFor(state, seat) {
  return {
    mySeat: seat,
    // Nobody sees anyone else's ticket -- just who's in the game, same as
    // every other player-facing list in this app.
    players: state.players.map((p) => ({ seat: p.seat })),
    myTicket: state.players[seat]?.ticket ?? null,
    myMarked: state.players[seat] ? [...state.players[seat].marked] : [],
    calledNumbers: state.calledNumbers,
    lastCalled: state.calledNumbers[state.calledNumbers.length - 1] ?? null,
    nextCallAt: state.nextCallAt,
    claims: state.claims,
    prizes: PRIZES.map((p) => ({ id: p.id, label: p.label })),
    phase: state.phase,
    winner: state.winner,
    log: state.log,
    finished: state.phase === "finished" ? { winner: state.winner } : null,
  };
}

module.exports = {
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  createInitialState,
  applyAction,
  viewFor,
  nextDeadline,
  advanceTime,
  _internals: { generateTicket, PRIZES, COLUMN_RANGES, countMarked, lineComplete, allMarked },
};
