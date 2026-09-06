// Ludo -- 3-4 players. Standard rules: roll a 6 to leave the yard, race 4
// tokens around a shared 52-square track then up your own 6-square home
// stretch, capture opponents on non-safe squares, get all 4 tokens home to
// win. Colors/entry offsets follow the classic numbering (red/green/yellow/
// blue entering 13 squares apart) even though the client renders its own
// simplified board layout.

const COLOR_NAMES = ["Red", "Green", "Yellow", "Blue"];
const COLOR_HEX = ["#e74c3c", "#2ecc71", "#f1c40f", "#3498db"];

const TRACK_LENGTH = 52;
const HOME_STRETCH_LENGTH = 6;
const FINISH_STEPS = TRACK_LENGTH - 1 + HOME_STRETCH_LENGTH; // 57
const TOKENS_PER_PLAYER = 4;

// Entry offset onto the shared 52-square track for each color, spaced 13
// apart (classic Ludo numbering).
const ENTRY_OFFSET = [0, 13, 26, 39];

// Entry squares plus one star per quadrant -- tokens can't be captured here.
const SAFE_SQUARES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

function fail(message) {
  throw new Error(message);
}

function playerLabel(seat) {
  return `${COLOR_NAMES[seat]} (Player ${seat + 1})`;
}

function log(state, message) {
  state.log.push(message);
  if (state.log.length > 60) state.log.shift();
}

function globalPos(seat, steps) {
  return (ENTRY_OFFSET[seat] + steps) % TRACK_LENGTH;
}

// Everything a token needs to know about itself, derived from `steps`:
// -1 = in yard, 0..50 = on shared track, 51..56 = in home stretch, 57 = home.
function tokenStatus(steps) {
  if (steps < 0) return "yard";
  if (steps >= FINISH_STEPS) return "home";
  if (steps >= TRACK_LENGTH - 1) return "stretch";
  return "track";
}

function createInitialState(seatCount, rng = Math.random) {
  const startingSeat = Math.floor(rng() * seatCount);
  return {
    players: Array.from({ length: seatCount }, (_, seat) => ({
      seat,
      tokens: Array.from({ length: TOKENS_PER_PLAYER }, () => ({ steps: -1 })),
    })),
    currentSeat: startingSeat,
    lastRoll: null,
    awaitingMove: false,
    consecutiveSixes: 0,
    winner: null,
    log: [`Ludo begins! ${playerLabel(startingSeat)} rolls first -- roll a 6 to leave the yard.`],
    rng,
  };
}

function nextSeat(state, from) {
  return (from + 1) % state.players.length;
}

// Which of this player's tokens can legally move with the given roll.
function legalMoveIndices(state, seat, roll) {
  const player = state.players[seat];

  return player.tokens.reduce((acc, token, index) => {
    if (token.steps === -1) {
      if (roll === 6) acc.push(index);
      return acc;
    }

    if (token.steps + roll <= FINISH_STEPS) acc.push(index);
    return acc;
  }, []);
}

function applyMove(state, seat, tokenIndex, roll) {
  const player = state.players[seat];
  const token = player.tokens[tokenIndex];

  let captured = false;
  let reachedHome = false;

  if (token.steps === -1) {
    token.steps = 0;
    log(state, `${playerLabel(seat)} left the yard.`);
  } else {
    token.steps += roll;

    if (token.steps >= FINISH_STEPS) {
      token.steps = FINISH_STEPS;
      reachedHome = true;
      log(state, `${playerLabel(seat)} brought a token home!`);
    } else {
      log(state, `${playerLabel(seat)} moved a token ${roll} step${roll === 1 ? "" : "s"}.`);
    }
  }

  if (tokenStatus(token.steps) === "track") {
    const landedOn = globalPos(seat, token.steps);

    if (!SAFE_SQUARES.has(landedOn)) {
      for (const other of state.players) {
        if (other.seat === seat) continue;

        for (const otherToken of other.tokens) {
          if (tokenStatus(otherToken.steps) !== "track") continue;
          if (globalPos(other.seat, otherToken.steps) !== landedOn) continue;

          otherToken.steps = -1;
          captured = true;
          log(state, `${playerLabel(seat)} sent ${playerLabel(other.seat)}'s token back to the yard!`);
        }
      }
    }
  }

  if (player.tokens.every((t) => t.steps === FINISH_STEPS)) {
    state.winner = seat;
    log(state, `${playerLabel(seat)} brought all 4 tokens home and wins!`);
  }

  return { captured, reachedHome };
}

function resolveTurnEnd(state, seat, roll, moveResult) {
  if (state.winner !== null) return;

  const extraTurn = roll === 6 || moveResult.captured || moveResult.reachedHome;

  if (extraTurn) {
    log(state, `${playerLabel(seat)} goes again.`);
  } else {
    state.currentSeat = nextSeat(state, seat);
  }
}

function handleRollDice(state, seat) {
  if (state.winner !== null) fail("The game is already over.");
  if (seat !== state.currentSeat) fail("It's not your turn.");
  if (state.awaitingMove) fail("Resolve your current move first.");

  const roll = 1 + Math.floor(state.rng() * 6);
  state.lastRoll = roll;

  const moves = legalMoveIndices(state, seat, roll);

  if (moves.length === 0) {
    log(state, `${playerLabel(seat)} rolled ${roll} but has no legal move.`);
    state.currentSeat = nextSeat(state, seat);
    return;
  }

  if (moves.length === 1) {
    const result = applyMove(state, seat, moves[0], roll);
    resolveTurnEnd(state, seat, roll, result);
    return;
  }

  state.awaitingMove = true;
}

function handleMoveToken(state, seat, { tokenIndex }) {
  if (state.winner !== null) fail("The game is already over.");
  if (seat !== state.currentSeat) fail("It's not your turn.");
  if (!state.awaitingMove) fail("Roll the dice first.");

  const roll = state.lastRoll;
  const moves = legalMoveIndices(state, seat, roll);

  if (!moves.includes(tokenIndex)) fail("That token can't make that move.");

  state.awaitingMove = false;
  const result = applyMove(state, seat, tokenIndex, roll);
  resolveTurnEnd(state, seat, roll, result);
}

const ACTION_HANDLERS = {
  "roll-dice": (state, seat) => handleRollDice(state, seat),
  "move-token": (state, seat, payload) => handleMoveToken(state, seat, payload),
};

function applyAction(state, seat, action, payload) {
  if (state.winner !== null) fail("The game is already over.");

  const handler = ACTION_HANDLERS[action];
  if (!handler) fail(`Unknown action: ${action}`);

  handler(state, seat, payload || {});
  return state;
}

function viewFor(state, seat) {
  const legalMoves =
    state.awaitingMove && state.currentSeat === seat
      ? legalMoveIndices(state, seat, state.lastRoll)
      : [];

  return {
    players: state.players.map((player) => ({
      seat: player.seat,
      color: COLOR_NAMES[player.seat],
      tokens: player.tokens.map((token) => ({
        steps: token.steps,
        status: tokenStatus(token.steps),
        globalPos: tokenStatus(token.steps) === "track" ? globalPos(player.seat, token.steps) : null,
        homeIndex:
          tokenStatus(token.steps) === "stretch" ? token.steps - (TRACK_LENGTH - 1) : null,
      })),
    })),
    currentSeat: state.currentSeat,
    lastRoll: state.lastRoll,
    awaitingMove: state.awaitingMove,
    legalMoves,
    winner: state.winner,
    finished: state.winner !== null ? { winner: state.winner } : null,
    log: state.log,
    trackLength: TRACK_LENGTH,
    homeStretchLength: HOME_STRETCH_LENGTH,
    safeSquares: Array.from(SAFE_SQUARES),
    colorNames: COLOR_NAMES,
    colorHex: COLOR_HEX,
  };
}

module.exports = {
  minPlayers: 3,
  maxPlayers: 4,
  createInitialState,
  applyAction,
  viewFor,
  _internals: {
    TRACK_LENGTH,
    HOME_STRETCH_LENGTH,
    FINISH_STEPS,
    ENTRY_OFFSET,
    SAFE_SQUARES,
    tokenStatus,
    globalPos,
    legalMoveIndices,
  },
};
