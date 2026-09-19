import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { socket } from "../socket";
import { useGameTransitions } from "../hooks/useGameTransitions";
import "./TicTacToe.css";

const CURRENT_GAME = "Tic Tac Toe";

const MARKS = ["X", "O"];
const MARK_COLORS = ["#ff6b6b", "#ffcf5c"];

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

export default function TicTacToe() {
  const location = useLocation();
  const code = location.state?.code;
  const room = location.state?.room;

  if (code) {
    return <NetworkedTicTacToe code={code} room={room} />;
  }

  const names = room
    ? room.players.map((player) => player.nickname)
    : ["Player 1", "Player 2"];

  return <TicTacToeBoard names={names} />;
}

/* ---------- networked (server-authoritative) mode ---------- */

function NetworkedTicTacToe({ code, room }) {
  const [seat, setSeat] = useState(null);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);

  const { nextGame, requestNextGame, canControl } = useGameTransitions({
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
      <div className="ttt-screen ttt-gate">
        <div className="ttt-popup">
          <h2>CAN'T JOIN GAME</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="ttt-screen ttt-gate">
        <div className="ttt-popup">
          <h2>CONNECTING...</h2>
        </div>
      </div>
    );
  }

  const names =
    state.seatNicknames ||
    (room ? room.players.map((player) => player.nickname) : ["Player 1", "Player 2"]);

  const markSquare = (index) => {
    socket.emit(
      "game-action",
      { code, action: "mark", payload: { index } },
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
    <TicTacToeBoard
      names={names}
      networkState={state}
      mySeat={seat}
      onMark={markSquare}
      onReset={resetGame}
      isNetworkedRoom={Boolean(room)}
      canControl={canControl}
      nextGame={nextGame}
      onNextGame={requestNextGame}
    />
  );
}

/* ---------- shared board UI (local hot-seat or server-driven) ---------- */

function TicTacToeBoard({
  names,
  networkState,
  mySeat,
  onMark,
  onReset,
  isNetworkedRoom,
  canControl,
  nextGame,
  onNextGame,
}) {
  const isNetworked = Boolean(networkState);

  const [localBoard, setLocalBoard] = useState(() => Array(9).fill(null));
  const [localCurrentPlayer, setLocalCurrentPlayer] = useState(0);
  const [localWinLine, setLocalWinLine] = useState(null);
  const [localFinished, setLocalFinished] = useState(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  let board, currentPlayer, winLine, finished;

  if (isNetworked) {
    ({ board, currentPlayer, winLine, finished } = networkState);
  } else {
    board = localBoard;
    currentPlayer = localCurrentPlayer;
    winLine = localWinLine;
    finished = localFinished;
  }

  const myTurn = isNetworked ? currentPlayer === mySeat : true;

  const winningCells = new Set(winLine || []);

  const markSquare = (index) => {
    if (finished || !myTurn || board[index] !== null) return;

    if (isNetworked) {
      onMark(index);
      return;
    }

    const nextBoard = [...localBoard];
    nextBoard[index] = localCurrentPlayer;
    setLocalBoard(nextBoard);

    const line = findWinningLine(nextBoard, localCurrentPlayer);

    if (line) {
      setLocalWinLine(line);
      setLocalFinished({ winnerIndex: localCurrentPlayer });
      return;
    }

    const isFull = nextBoard.every((cell) => cell !== null);

    if (isFull) {
      setLocalFinished({ winnerIndex: null });
      return;
    }

    setLocalCurrentPlayer((player) => (player === 0 ? 1 : 0));
  };

  const resetGame = () => {
    if (isNetworked) {
      onReset();
      return;
    }

    setLocalBoard(Array(9).fill(null));
    setLocalCurrentPlayer(0);
    setLocalWinLine(null);
    setLocalFinished(null);
  };

  return (
    <div className="ttt-screen">
      <div className="ttt-sun" />
      <div className="ttt-cloud cloud-a" />
      <div className="ttt-cloud cloud-b" />

      <header className="ttt-header">
        <div>
          <h1 className="ttt-logo">TIC TAC TOE</h1>
          <p className="ttt-subtitle">
            GAMES FOR GROUPS
            {isNetworked && mySeat !== null && <> · YOU ARE {names[mySeat]}</>}
          </p>
        </div>
      </header>

      <main className="ttt-layout">
        <div className="ttt-players-row">
          {names.map((name, index) => (
            <div
              key={index}
              className={`ttt-player-tag ${currentPlayer === index && !finished ? "active" : ""}`}
            >
              <span className="ttt-player-mark" style={{ color: MARK_COLORS[index] }}>
                {MARKS[index]}
              </span>
              {name}
            </div>
          ))}
        </div>

        <div className={`ttt-board ${isNetworked && !myTurn ? "not-my-turn" : ""}`}>
          {board.map((cell, index) => {
            const isWinning = winningCells.has(index);

            return (
              <button
                key={index}
                className={`ttt-cell ${isWinning ? "winning" : ""}`}
                disabled={Boolean(finished) || !myTurn || cell !== null}
                onClick={() => markSquare(index)}
              >
                {cell !== null && (
                  <span className="ttt-mark" style={{ color: MARK_COLORS[cell] }}>
                    {MARKS[cell]}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {isNetworked && !myTurn && !finished && (
          <p className="ttt-waiting">WAITING FOR OPPONENT...</p>
        )}

        <button className="ttt-reset-button" onClick={() => setConfirmingReset(true)}>
          RESTART GAME
        </button>
      </main>

      {confirmingReset && (
        <div className="ttt-overlay">
          <div className="ttt-popup">
            <h2>RESTART GAME?</h2>
            <p>
              This will end the current game
              {isNetworked ? " for both players" : ""} and start over.
            </p>

            <div className="ttt-confirm-grid">
              <button
                className="ttt-confirm-yes"
                onClick={() => {
                  setConfirmingReset(false);
                  resetGame();
                }}
              >
                YES, RESTART
              </button>

              <button className="ttt-confirm-no" onClick={() => setConfirmingReset(false)}>
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {finished && (
        <div className="ttt-overlay">
          <div className="ttt-winner-popup">
            <div
              className="ttt-winner-mark"
              style={{ color: finished.winnerIndex !== null ? MARK_COLORS[finished.winnerIndex] : "#a7a1ff" }}
            >
              {finished.winnerIndex !== null ? MARKS[finished.winnerIndex] : "—"}
            </div>

            <h1>
              {finished.winnerIndex !== null ? `${names[finished.winnerIndex]} WINS!` : "IT'S A DRAW!"}
            </h1>

            <p>
              {finished.winnerIndex !== null
                ? "Three in a row!"
                : "The board filled up with no winner."}
            </p>

            {isNetworkedRoom ? (
              canControl ? (
                <div className="ttt-postgame-actions">
                  <button className="ttt-restart-winning" onClick={resetGame}>
                    REMATCH
                  </button>
                  {nextGame && (
                    <button className="ttt-restart-winning next" onClick={onNextGame}>
                      NEXT GAME: {nextGame.toUpperCase()}
                    </button>
                  )}
                </div>
              ) : (
                <p className="ttt-waiting-host">Waiting for the host to choose what's next...</p>
              )
            ) : (
              <button className="ttt-restart-winning" onClick={resetGame}>
                PLAY AGAIN
              </button>
            )}
          </div>
        </div>
      )}

      <div className="ttt-grass" />
    </div>
  );
}
