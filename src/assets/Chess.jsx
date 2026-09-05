import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Chess as ChessEngine } from "chess.js";
import { socket } from "../socket";
import { useGameTransitions } from "../hooks/useGameTransitions";
import "./Chess.css";

const CURRENT_GAME = "Chess";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

const PIECE_GLYPHS = {
  w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
  b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" },
};

const PROMOTION_PIECES = [
  { type: "q", label: "QUEEN", glyph: "♛" },
  { type: "r", label: "ROOK", glyph: "♜" },
  { type: "b", label: "BISHOP", glyph: "♝" },
  { type: "n", label: "KNIGHT", glyph: "♞" },
];

function pieceAt(board, square) {
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1], 10);
  return board[8 - rank][file];
}

function findKingSquare(board, color) {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const cell = board[row][col];
      if (cell && cell.type === "k" && cell.color === color) {
        return `${FILES[col]}${8 - row}`;
      }
    }
  }
  return null;
}

export default function Chess() {
  const location = useLocation();
  const code = location.state?.code;
  const room = location.state?.room;

  if (code) {
    return <NetworkedChess code={code} room={room} />;
  }

  const names = room
    ? room.players.map((player) => player.nickname)
    : ["Player 1", "Player 2"];

  return <ChessBoard names={names} />;
}

/* ---------- networked (server-authoritative) mode ---------- */

function NetworkedChess({ code, room }) {
  const [seat, setSeat] = useState(null);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);

  const { nextGame, requestNextGame, isHost } = useGameTransitions({
    code,
    room,
    currentGame: CURRENT_GAME,
  });

  useEffect(() => {
    socket.emit("join-game", { code }, (response) => {
      if (!response.success) {
        setError(response.error);
        return;
      }

      setSeat(response.seat);
      setState(response.state);
    });

    const handleState = (nextState) => setState(nextState);
    socket.on("game-state", handleState);

    return () => socket.off("game-state", handleState);
  }, [code]);

  if (error) {
    return (
      <div className="chess-screen chess-gate">
        <div className="chess-popup">
          <h2>CAN'T JOIN GAME</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="chess-screen chess-gate">
        <div className="chess-popup">
          <h2>CONNECTING...</h2>
        </div>
      </div>
    );
  }

  const names = room
    ? room.players.map((player) => player.nickname)
    : ["White", "Black"];

  const sendMove = (from, to, promotion) => {
    socket.emit(
      "game-action",
      { code, action: "move", payload: { from, to, promotion } },
      (response) => {
        if (!response?.success) {
          console.warn("Move rejected:", response?.error);
        }
      }
    );
  };

  const resetGame = () => {
    socket.emit("reset-game", { code });
  };

  return (
    <ChessBoard
      names={names}
      networkState={state}
      mySeat={seat}
      onMove={sendMove}
      onReset={resetGame}
      isNetworkedRoom={Boolean(room)}
      isHost={isHost}
      nextGame={nextGame}
      onNextGame={requestNextGame}
    />
  );
}

/* ---------- shared board UI (local hot-seat or server-driven) ---------- */

function ChessBoard({
  names,
  networkState,
  mySeat,
  onMove,
  onReset,
  isNetworkedRoom,
  isHost,
  nextGame,
  onNextGame,
}) {
  const isNetworked = Boolean(networkState);

  const localRef = useRef(null);
  if (!isNetworked && !localRef.current) localRef.current = new ChessEngine();

  const [, setTick] = useState(0);
  const refresh = () => setTick((value) => value + 1);

  const [selected, setSelected] = useState(null);
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [localFinished, setLocalFinished] = useState(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const playerNames = { w: names[0], b: names[1] };

  // Normalize local vs. networked state into one shape the render below uses.
  let board, turn, isCheck, history, legalMovesForTurn, finished;

  if (isNetworked) {
    ({ board, turn, isCheck, history, moves: legalMovesForTurn, finished } = networkState);
  } else {
    const game = localRef.current;
    board = game.board();
    turn = game.turn();
    isCheck = game.isCheck();
    history = game.history();
    legalMovesForTurn = localFinished ? [] : game.moves({ verbose: true });
    finished = localFinished;
  }

  const mySeatColor = mySeat === 0 ? "w" : mySeat === 1 ? "b" : null;
  const myTurn = isNetworked ? turn === mySeatColor : true;

  const clearSelection = () => {
    setSelected(null);
    setPendingPromotion(null);
  };

  const checkLocalGameEnd = (game) => {
    if (game.isCheckmate()) {
      const winnerColor = game.turn() === "w" ? "b" : "w";
      setLocalFinished({ winnerColor, reason: "CHECKMATE" });
    } else if (game.isStalemate()) {
      setLocalFinished({ winnerColor: null, reason: "STALEMATE — DRAW" });
    } else if (game.isThreefoldRepetition()) {
      setLocalFinished({ winnerColor: null, reason: "THREEFOLD REPETITION — DRAW" });
    } else if (game.isInsufficientMaterial()) {
      setLocalFinished({ winnerColor: null, reason: "INSUFFICIENT MATERIAL — DRAW" });
    } else if (game.isDraw()) {
      setLocalFinished({ winnerColor: null, reason: "DRAW" });
    }
  };

  const makeMove = (from, to, promotion) => {
    if (isNetworked) {
      onMove(from, to, promotion);
      clearSelection();
      return;
    }

    const game = localRef.current;
    game.move({ from, to, promotion });
    clearSelection();
    refresh();
    checkLocalGameEnd(game);
  };

  const legalTargets = selected
    ? legalMovesForTurn.filter((move) => move.from === selected)
    : [];

  const handleSquareClick = (square) => {
    if (finished || !myTurn) return;

    const piece = pieceAt(board, square);

    if (selected) {
      if (square === selected) {
        clearSelection();
        return;
      }

      const matches = legalTargets.filter((move) => move.to === square);

      if (matches.length > 0) {
        if (matches.length > 1) {
          setPendingPromotion({ from: selected, to: square });
        } else {
          makeMove(selected, square, matches[0].promotion);
        }
        return;
      }

      if (piece && piece.color === turn) {
        setSelected(square);
        return;
      }

      clearSelection();
      return;
    }

    if (piece && piece.color === turn) {
      setSelected(square);
    }
  };

  const resetGame = () => {
    if (isNetworked) {
      onReset();
      return;
    }

    localRef.current = new ChessEngine();
    clearSelection();
    setLocalFinished(null);
    refresh();
  };

  const displayFiles = flipped ? [...FILES].reverse() : FILES;
  const displayRows = flipped ? [...board].reverse() : board;

  const kingSquare = isCheck && findKingSquare(board, turn);

  return (
    <div className="chess-screen">
      <div className="chess-sun" />
      <div className="chess-cloud cloud-a" />
      <div className="chess-cloud cloud-b" />

      <header className="chess-header">
        <div>
          <h1 className="chess-logo">CHESS</h1>
          <p className="chess-subtitle">
            GAMES FOR GROUPS
            {isNetworked && mySeatColor && (
              <> · YOU ARE {mySeatColor === "w" ? "WHITE" : "BLACK"}</>
            )}
          </p>
        </div>

        <div className="chess-turn-box">
          <span>TO MOVE</span>
          <strong>{playerNames[turn]}</strong>
        </div>
      </header>

      <main className="chess-layout">
        <section className="chess-board-panel">
          <div className="chess-players-row">
            <div className={`chess-player-tag ${turn === "w" ? "active" : ""}`}>
              ♔ {playerNames.w}
            </div>
            <div className={`chess-player-tag ${turn === "b" ? "active" : ""}`}>
              ♚ {playerNames.b}
            </div>
          </div>

          <div className={`chess-board ${isNetworked && !myTurn ? "not-my-turn" : ""}`}>
            {displayRows.map((row, rowIndex) => {
              const displayRow = flipped ? [...row].reverse() : row;

              return (
                <div className="chess-row" key={rowIndex}>
                  {displayRow.map((cell, colIndex) => {
                    const square = `${displayFiles[colIndex]}${
                      flipped ? rowIndex + 1 : 8 - rowIndex
                    }`;

                    const isLight = (rowIndex + colIndex) % 2 === 0;
                    const isSelected = selected === square;
                    const isTarget = legalTargets.some((m) => m.to === square);
                    const isCheckSquare = kingSquare === square;

                    return (
                      <button
                        key={square}
                        className={`chess-square ${isLight ? "light" : "dark"} ${
                          isSelected ? "selected" : ""
                        } ${isTarget ? "target" : ""} ${
                          isCheckSquare ? "in-check" : ""
                        }`}
                        onClick={() => handleSquareClick(square)}
                      >
                        {cell && (
                          <span className={`chess-piece ${cell.color}`}>
                            {PIECE_GLYPHS[cell.color][cell.type]}
                          </span>
                        )}
                        {isTarget && !cell && <span className="chess-dot" />}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {isCheck && !finished && <div className="chess-check-banner">CHECK!</div>}

          {isNetworked && !myTurn && !finished && (
            <div className="chess-check-banner">WAITING FOR OPPONENT...</div>
          )}

          <div className="chess-controls-row">
            <button className="chess-flip-button" onClick={() => setFlipped((v) => !v)}>
              ⟲ FLIP BOARD
            </button>

            <button
              className="chess-reset-button"
              onClick={() => setConfirmingReset(true)}
            >
              RESTART GAME
            </button>
          </div>
        </section>

        <aside className="chess-side-panel">
          <div className="chess-section-title">MOVE HISTORY</div>

          <div className="chess-history">
            {history.length === 0 && (
              <div className="chess-history-empty">No moves yet.</div>
            )}

            {Array.from({ length: Math.ceil(history.length / 2) }).map(
              (_, pairIndex) => (
                <div className="chess-history-row" key={pairIndex}>
                  <span className="chess-history-number">{pairIndex + 1}.</span>
                  <span>{history[pairIndex * 2]}</span>
                  <span>{history[pairIndex * 2 + 1] || ""}</span>
                </div>
              )
            )}
          </div>
        </aside>
      </main>

      {confirmingReset && (
        <div className="chess-overlay">
          <div className="chess-popup">
            <h2>RESTART GAME?</h2>
            <p>
              This will end the current game
              {isNetworked ? " for both players" : ""} and start over.
            </p>

            <div className="chess-promotion-grid">
              <button
                className="chess-promotion-button confirm-yes"
                onClick={() => {
                  setConfirmingReset(false);
                  resetGame();
                }}
              >
                YES, RESTART
              </button>

              <button
                className="chess-promotion-button confirm-no"
                onClick={() => setConfirmingReset(false)}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingPromotion && (
        <div className="chess-overlay">
          <div className="chess-popup">
            <h2>PROMOTE PAWN</h2>
            <p>Choose a piece for your pawn.</p>

            <div className="chess-promotion-grid">
              {PROMOTION_PIECES.map((piece) => (
                <button
                  key={piece.type}
                  className="chess-promotion-button"
                  onClick={() =>
                    makeMove(pendingPromotion.from, pendingPromotion.to, piece.type)
                  }
                >
                  <span>{piece.glyph}</span>
                  {piece.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {finished && (
        <div className="chess-overlay">
          <div className="chess-winner-popup">
            <div className="chess-winner-icon">{finished.winnerColor ? "♛" : "🤝"}</div>

            <div className="chess-ending-label">{finished.reason}</div>

            <h1>
              {finished.winnerColor
                ? `${playerNames[finished.winnerColor]} WINS!`
                : "IT'S A DRAW!"}
            </h1>

            {isNetworkedRoom ? (
              isHost ? (
                <div className="chess-postgame-actions">
                  <button className="chess-restart-winning" onClick={resetGame}>
                    REMATCH
                  </button>
                  {nextGame && (
                    <button className="chess-restart-winning next" onClick={onNextGame}>
                      NEXT GAME: {nextGame.toUpperCase()}
                    </button>
                  )}
                </div>
              ) : (
                <p className="chess-waiting-host">Waiting for the host to choose what's next...</p>
              )
            ) : (
              <button className="chess-restart-winning" onClick={resetGame}>
                PLAY AGAIN
              </button>
            )}
          </div>
        </div>
      )}

      <div className="chess-grass" />
    </div>
  );
}
