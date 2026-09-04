const { Chess } = require("chess.js");

function seatColor(seatIndex) {
  return seatIndex === 0 ? "w" : "b";
}

function determineEnding(engine) {
  if (engine.isCheckmate()) {
    const winnerColor = engine.turn() === "w" ? "b" : "w";
    return { winnerColor, reason: "CHECKMATE" };
  }

  if (engine.isStalemate()) {
    return { winnerColor: null, reason: "STALEMATE — DRAW" };
  }

  if (engine.isThreefoldRepetition()) {
    return { winnerColor: null, reason: "THREEFOLD REPETITION — DRAW" };
  }

  if (engine.isInsufficientMaterial()) {
    return { winnerColor: null, reason: "INSUFFICIENT MATERIAL — DRAW" };
  }

  if (engine.isDraw()) {
    return { winnerColor: null, reason: "DRAW" };
  }

  return null;
}

module.exports = {
  requiredPlayers: 2,

  createInitialState() {
    return {
      engine: new Chess(),
      finished: null,
    };
  },

  applyAction(state, seatIndex, action, payload) {
    if (state.finished) {
      throw new Error("The game is already over.");
    }

    if (action !== "move") {
      throw new Error(`Unknown action: ${action}`);
    }

    if (state.engine.turn() !== seatColor(seatIndex)) {
      throw new Error("It's not your turn.");
    }

    const { from, to, promotion } = payload || {};

    try {
      state.engine.move({ from, to, promotion });
    } catch {
      throw new Error("Illegal move.");
    }

    state.finished = determineEnding(state.engine);

    return state;
  },

  // Chess has no hidden information -- every seat sees the same board.
  viewFor(state) {
    return {
      board: state.engine.board(),
      turn: state.engine.turn(),
      isCheck: state.engine.isCheck(),
      history: state.engine.history(),
      moves: state.finished ? [] : state.engine.moves({ verbose: true }),
      finished: state.finished,
    };
  },
};
