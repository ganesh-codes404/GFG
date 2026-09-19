const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function findWinningLine(board, player) {
  for (const line of WIN_LINES) {
    if (line.every((i) => board[i] === player)) return line;
  }
  return null;
}

module.exports = {
  requiredPlayers: 2,

  createInitialState(seatCount, rng = Math.random) {
    return {
      board: Array(9).fill(null),
      currentPlayer: Math.floor(rng() * 2),
      winLine: null,
      finished: null,
    };
  },

  applyAction(state, seatIndex, action, payload) {
    if (state.finished) {
      throw new Error("The game is already over.");
    }

    if (action !== "mark") {
      throw new Error(`Unknown action: ${action}`);
    }

    if (seatIndex !== state.currentPlayer) {
      throw new Error("It's not your turn.");
    }

    const index = payload?.index;

    if (typeof index !== "number" || index < 0 || index > 8) {
      throw new Error("Invalid square.");
    }

    if (state.board[index] !== null) {
      throw new Error("That square is taken.");
    }

    state.board[index] = seatIndex;

    const line = findWinningLine(state.board, seatIndex);

    if (line) {
      state.winLine = line;
      state.finished = { winnerIndex: seatIndex };
      return state;
    }

    const isFull = state.board.every((cell) => cell !== null);

    if (isFull) {
      state.finished = { winnerIndex: null };
      return state;
    }

    state.currentPlayer = seatIndex === 0 ? 1 : 0;

    return state;
  },

  // No hidden information in Tic Tac Toe -- every seat sees the same board.
  viewFor(state) {
    return state;
  },
};
