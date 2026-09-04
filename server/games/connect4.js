const ROWS = 6;
const COLS = 7;
const WIN_LENGTH = 4;

// Each pair is the two opposite directions to scan for one axis.
const DIRECTION_PAIRS = [
  [
    [0, 1],
    [0, -1],
  ],
  [
    [1, 0],
    [-1, 0],
  ],
  [
    [1, 1],
    [-1, -1],
  ],
  [
    [1, -1],
    [-1, 1],
  ],
];

function findWinningLine(board, row, col, player) {
  for (const [dirA, dirB] of DIRECTION_PAIRS) {
    const line = [[row, col]];

    for (const [dr, dc] of [dirA, dirB]) {
      let r = row + dr;
      let c = col + dc;

      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === player) {
        line.push([r, c]);
        r += dr;
        c += dc;
      }
    }

    if (line.length >= WIN_LENGTH) return line;
  }

  return null;
}

module.exports = {
  requiredPlayers: 2,

  createInitialState() {
    return {
      board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
      currentPlayer: 0,
      winLine: null,
      finished: null,
    };
  },

  applyAction(state, seatIndex, action, payload) {
    if (state.finished) {
      throw new Error("The game is already over.");
    }

    if (action !== "drop") {
      throw new Error(`Unknown action: ${action}`);
    }

    if (seatIndex !== state.currentPlayer) {
      throw new Error("It's not your turn.");
    }

    const col = payload?.col;

    if (typeof col !== "number" || col < 0 || col >= COLS) {
      throw new Error("Invalid column.");
    }

    let targetRow = -1;

    for (let row = ROWS - 1; row >= 0; row--) {
      if (state.board[row][col] === null) {
        targetRow = row;
        break;
      }
    }

    if (targetRow === -1) {
      throw new Error("That column is full.");
    }

    state.board[targetRow][col] = seatIndex;

    const line = findWinningLine(state.board, targetRow, col, seatIndex);

    if (line) {
      state.winLine = line;
      state.finished = { winnerIndex: seatIndex };
      return state;
    }

    const isFull = state.board.every((row) => row.every((cell) => cell !== null));

    if (isFull) {
      state.finished = { winnerIndex: null };
      return state;
    }

    state.currentPlayer = seatIndex === 0 ? 1 : 0;

    return state;
  },

  // No hidden information in Connect 4 -- every seat sees the same board.
  viewFor(state) {
    return state;
  },
};
