// Checkers -- 2 players, standard American rules: captures are mandatory
// whenever available, a capturing piece must keep jumping if another
// capture is immediately available from its new square (unless it just
// got crowned, which always ends the turn), and a player who cannot move
// on their turn loses (not a draw).

const BOARD_SIZE = 8;

function inBounds(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function playerLabel(seat) {
  return `Player ${seat + 1}`;
}

function log(state, message) {
  state.log.push(message);
  if (state.log.length > 60) state.log.shift();
}

function createBoard() {
  const board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if ((row + col) % 2 === 1) board[row][col] = { seat: 1, king: false };
    }
  }

  for (let row = 5; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if ((row + col) % 2 === 1) board[row][col] = { seat: 0, king: false };
    }
  }

  return board;
}

function directionsFor(piece) {
  if (piece.king) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  return piece.seat === 0 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
}

function pieceMoves(board, row, col) {
  const piece = board[row][col];
  const simple = [];
  const captures = [];
  if (!piece) return { simple, captures };

  for (const [dr, dc] of directionsFor(piece)) {
    const r1 = row + dr;
    const c1 = col + dc;
    if (!inBounds(r1, c1)) continue;

    if (!board[r1][c1]) {
      simple.push({ from: { row, col }, to: { row: r1, col: c1 }, isCapture: false });
      continue;
    }

    if (board[r1][c1].seat === piece.seat) continue;

    const r2 = row + 2 * dr;
    const c2 = col + 2 * dc;
    if (inBounds(r2, c2) && !board[r2][c2]) {
      captures.push({
        from: { row, col },
        to: { row: r2, col: c2 },
        isCapture: true,
        capturedSquare: { row: r1, col: c1 },
      });
    }
  }

  return { simple, captures };
}

function allMovesFor(state, seat) {
  const { board, mustContinueFrom } = state;

  if (mustContinueFrom) {
    const { row, col } = mustContinueFrom;
    const piece = board[row][col];
    if (!piece || piece.seat !== seat) return [];
    return pieceMoves(board, row, col).captures;
  }

  const simples = [];
  const captures = [];

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = board[row][col];
      if (!piece || piece.seat !== seat) continue;
      const moves = pieceMoves(board, row, col);
      simples.push(...moves.simple);
      captures.push(...moves.captures);
    }
  }

  // Mandatory capture: if any capture exists, simple moves are illegal.
  return captures.length > 0 ? captures : simples;
}

function checkWin(state) {
  const seat0HasPieces = state.board.some((row) => row.some((c) => c && c.seat === 0));
  const seat1HasPieces = state.board.some((row) => row.some((c) => c && c.seat === 1));

  if (!seat0HasPieces) {
    state.winner = 1;
    log(state, `${playerLabel(0)} has no pieces left -- ${playerLabel(1)} wins!`);
    return;
  }

  if (!seat1HasPieces) {
    state.winner = 0;
    log(state, `${playerLabel(1)} has no pieces left -- ${playerLabel(0)} wins!`);
    return;
  }

  if (allMovesFor(state, state.currentSeat).length === 0) {
    state.winner = state.currentSeat === 0 ? 1 : 0;
    log(state, `${playerLabel(state.currentSeat)} has no legal moves -- ${playerLabel(state.winner)} wins!`);
  }
}

function createInitialState() {
  return {
    board: createBoard(),
    currentSeat: 0,
    mustContinueFrom: null,
    winner: null,
    log: ["Checkers begins! Player 1 moves first."],
  };
}

function handleMove(state, seat, { from, to }) {
  if (state.winner !== null) throw new Error("The game is already over.");
  if (seat !== state.currentSeat) throw new Error("It's not your turn.");
  if (!from || !to) throw new Error("Invalid move.");

  const legal = allMovesFor(state, seat);
  const match = legal.find(
    (m) => m.from.row === from.row && m.from.col === from.col && m.to.row === to.row && m.to.col === to.col
  );
  if (!match) throw new Error("Illegal move.");

  const piece = state.board[from.row][from.col];
  state.board[from.row][from.col] = null;
  state.board[to.row][to.col] = piece;

  if (match.isCapture) {
    state.board[match.capturedSquare.row][match.capturedSquare.col] = null;
  }

  const promotionRow = piece.seat === 0 ? 0 : BOARD_SIZE - 1;
  let justCrowned = false;
  if (!piece.king && to.row === promotionRow) {
    piece.king = true;
    justCrowned = true;
    log(state, `${playerLabel(seat)}'s piece was crowned king!`);
  }

  if (match.isCapture && !justCrowned) {
    const further = pieceMoves(state.board, to.row, to.col).captures;
    if (further.length > 0) {
      state.mustContinueFrom = { row: to.row, col: to.col };
      log(state, `${playerLabel(seat)} must continue jumping!`);
      return state;
    }
  }

  state.mustContinueFrom = null;
  state.currentSeat = seat === 0 ? 1 : 0;
  checkWin(state);
  return state;
}

const ACTION_HANDLERS = {
  move: (state, seat, payload) => handleMove(state, seat, payload),
};

function applyAction(state, seat, action, payload) {
  if (state.winner !== null) throw new Error("The game is already over.");

  const handler = ACTION_HANDLERS[action];
  if (!handler) throw new Error(`Unknown action: ${action}`);

  handler(state, seat, payload || {});
  return state;
}

// No hidden information -- every seat sees the same board and move list.
function viewFor(state) {
  return {
    board: state.board,
    currentSeat: state.currentSeat,
    legalMoves: state.winner === null ? allMovesFor(state, state.currentSeat) : [],
    mustContinueFrom: state.mustContinueFrom,
    winner: state.winner,
    finished: state.winner !== null ? { winner: state.winner } : null,
    log: state.log,
  };
}

module.exports = {
  requiredPlayers: 2,
  createInitialState,
  applyAction,
  viewFor,
  _internals: { allMovesFor, pieceMoves, createBoard, BOARD_SIZE },
};
