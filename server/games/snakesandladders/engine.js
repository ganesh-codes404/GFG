// Snakes and Ladders -- 3-7 players, a freshly randomized set of snakes and
// ladders every game, generated server-side so no client can see or
// influence the layout before it's dealt.

const BOARD_SIZE = 100;
const LADDER_COUNT = 8;
const SNAKE_COUNT = 8;
const MIN_GAP = 5;

function generateBoard(rng) {
  const used = new Set();

  function pickSquare() {
    let square;
    do {
      square = 2 + Math.floor(rng() * (BOARD_SIZE - 2)); // 2..99
    } while (used.has(square));
    used.add(square);
    return square;
  }

  const ladders = [];
  for (let i = 0; i < LADDER_COUNT; i++) {
    let a = pickSquare();
    let b;
    do {
      b = pickSquare();
    } while (Math.abs(b - a) < MIN_GAP);
    const from = Math.min(a, b);
    const to = Math.max(a, b);
    ladders.push({ from, to });
  }

  const snakes = [];
  for (let i = 0; i < SNAKE_COUNT; i++) {
    let a = pickSquare();
    let b;
    do {
      b = pickSquare();
    } while (Math.abs(b - a) < MIN_GAP);
    const from = Math.max(a, b);
    const to = Math.min(a, b);
    snakes.push({ from, to });
  }

  return { ladders, snakes };
}

function fail(message) {
  throw new Error(message);
}

function playerLabel(seat) {
  return `Player ${seat + 1}`;
}

function log(state, message) {
  state.log.push(message);
  if (state.log.length > 60) state.log.shift();
}

function findJump(state, square) {
  const ladder = state.board.ladders.find((l) => l.from === square);
  if (ladder) return { type: "ladder", ...ladder };

  const snake = state.board.snakes.find((s) => s.from === square);
  if (snake) return { type: "snake", ...snake };

  return null;
}

function createInitialState(seatCount, rng = Math.random) {
  return {
    board: generateBoard(rng),
    players: Array.from({ length: seatCount }, (_, seat) => ({ seat, position: 0 })),
    currentSeat: 0,
    lastRoll: null,
    winner: null,
    log: ["Snakes and Ladders begins! Roll to move."],
    rng,
  };
}

function nextSeat(state, from) {
  return (from + 1) % state.players.length;
}

function handleRollDice(state, seat) {
  if (state.winner !== null) fail("The game is already over.");
  if (seat !== state.currentSeat) fail("It's not your turn.");

  const roll = 1 + Math.floor(state.rng() * 6);
  state.lastRoll = roll;

  const player = state.players[seat];
  const target = player.position + roll;

  if (target > BOARD_SIZE) {
    log(state, `${playerLabel(seat)} rolled ${roll} but needs an exact roll to finish.`);
    state.currentSeat = nextSeat(state, seat);
    return;
  }

  player.position = target;
  log(state, `${playerLabel(seat)} rolled ${roll} and moved to ${target}.`);

  const jump = findJump(state, target);
  if (jump) {
    player.position = jump.to;
    log(
      state,
      jump.type === "ladder"
        ? `${playerLabel(seat)} climbed a ladder to ${jump.to}!`
        : `${playerLabel(seat)} was bitten by a snake down to ${jump.to}!`
    );
  }

  if (player.position === BOARD_SIZE) {
    state.winner = seat;
    log(state, `${playerLabel(seat)} reached 100 and wins!`);
    return;
  }

  state.currentSeat = nextSeat(state, seat);
}

const ACTION_HANDLERS = {
  "roll-dice": (state, seat) => handleRollDice(state, seat),
};

function applyAction(state, seat, action, payload) {
  if (state.winner !== null) fail("The game is already over.");

  const handler = ACTION_HANDLERS[action];
  if (!handler) fail(`Unknown action: ${action}`);

  handler(state, seat, payload || {});
  return state;
}

function viewFor(state) {
  return {
    board: state.board,
    players: state.players,
    currentSeat: state.currentSeat,
    lastRoll: state.lastRoll,
    winner: state.winner,
    finished: state.winner !== null ? { winner: state.winner } : null,
    log: state.log,
    boardSize: BOARD_SIZE,
  };
}

module.exports = {
  minPlayers: 3,
  maxPlayers: 7,
  createInitialState,
  applyAction,
  viewFor,
  _internals: { generateBoard, findJump, BOARD_SIZE },
};
