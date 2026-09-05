import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { socket } from "../socket";
import "./Connect4.css";

const ROWS = 6;
const COLS = 7;
const WIN_LENGTH = 4;

const DISC_COLORS = ["#ff6b6b", "#ffcf5c"];

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

function makeEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

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

export default function Connect4() {
  const location = useLocation();
  const code = location.state?.code;
  const room = location.state?.room;

  if (code) {
    return <NetworkedConnect4 code={code} room={room} />;
  }

  const names = room
    ? room.players.map((player) => player.nickname)
    : ["Player 1", "Player 2"];

  return <Connect4Board names={names} />;
}

/* ---------- networked (server-authoritative) mode ---------- */

function NetworkedConnect4({ code, room }) {
  const [seat, setSeat] = useState(null);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);

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
      <div className="c4-screen c4-gate">
        <div className="c4-popup">
          <h2>CAN'T JOIN GAME</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="c4-screen c4-gate">
        <div className="c4-popup">
          <h2>CONNECTING...</h2>
        </div>
      </div>
    );
  }

  const names = room
    ? room.players.map((player) => player.nickname)
    : ["Player 1", "Player 2"];

  const dropDisc = (col) => {
    socket.emit(
      "game-action",
      { code, action: "drop", payload: { col } },
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
    <Connect4Board
      names={names}
      networkState={state}
      mySeat={seat}
      onDrop={dropDisc}
      onReset={resetGame}
    />
  );
}

/* ---------- shared board UI (local hot-seat or server-driven) ---------- */

function Connect4Board({ names, networkState, mySeat, onDrop, onReset }) {
  const isNetworked = Boolean(networkState);

  const [localBoard, setLocalBoard] = useState(makeEmptyBoard);
  const [localCurrentPlayer, setLocalCurrentPlayer] = useState(0);
  const [localWinLine, setLocalWinLine] = useState(null);
  const [localFinished, setLocalFinished] = useState(null);
  const [hoverCol, setHoverCol] = useState(null);
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

  const winningCells = new Set((winLine || []).map(([r, c]) => `${r}-${c}`));

  const dropDisc = (col) => {
    if (finished || !myTurn) return;

    if (isNetworked) {
      onDrop(col);
      return;
    }

    let targetRow = -1;

    for (let row = ROWS - 1; row >= 0; row--) {
      if (localBoard[row][col] === null) {
        targetRow = row;
        break;
      }
    }

    if (targetRow === -1) return;

    const nextBoard = localBoard.map((row) => [...row]);
    nextBoard[targetRow][col] = localCurrentPlayer;
    setLocalBoard(nextBoard);

    const line = findWinningLine(nextBoard, targetRow, col, localCurrentPlayer);

    if (line) {
      setLocalWinLine(line);
      setLocalFinished({ winnerIndex: localCurrentPlayer });
      return;
    }

    const isFull = nextBoard.every((row) => row.every((cell) => cell !== null));

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

    setLocalBoard(makeEmptyBoard());
    setLocalCurrentPlayer(0);
    setLocalWinLine(null);
    setLocalFinished(null);
    setHoverCol(null);
  };

  return (
    <div className="c4-screen">
      <div className="c4-sun" />
      <div className="c4-cloud cloud-a" />
      <div className="c4-cloud cloud-b" />

      <header className="c4-header">
        <div>
          <h1 className="c4-logo">CONNECT 4</h1>
          <p className="c4-subtitle">
            GAMES FOR GROUPS
            {isNetworked && mySeat !== null && (
              <> · YOU ARE {names[mySeat]}</>
            )}
          </p>
        </div>
      </header>

      <main className="c4-layout">
        <div className="c4-players-row">
          {names.map((name, index) => (
            <div
              key={index}
              className={`c4-player-tag ${
                currentPlayer === index && !finished ? "active" : ""
              }`}
            >
              <span
                className="c4-player-disc"
                style={{ background: DISC_COLORS[index] }}
              />
              {name}
            </div>
          ))}
        </div>

        <div className={`c4-board ${isNetworked && !myTurn ? "not-my-turn" : ""}`}>
          {Array.from({ length: COLS }).map((_, col) => (
            <button
              key={col}
              className={`c4-column ${hoverCol === col ? "hover" : ""}`}
              disabled={Boolean(finished) || !myTurn || board[0][col] !== null}
              onMouseEnter={() => setHoverCol(col)}
              onMouseLeave={() => setHoverCol(null)}
              onClick={() => dropDisc(col)}
            >
              {Array.from({ length: ROWS }).map((__, row) => {
                const cell = board[row][col];
                const isWinning = winningCells.has(`${row}-${col}`);

                return (
                  <span key={row} className="c4-cell">
                    {cell !== null && (
                      <span
                        className={`c4-disc ${isWinning ? "winning" : ""}`}
                        style={{ background: DISC_COLORS[cell] }}
                      />
                    )}
                  </span>
                );
              })}
            </button>
          ))}
        </div>

        {isNetworked && !myTurn && !finished && (
          <p className="c4-waiting">WAITING FOR OPPONENT...</p>
        )}

        <button
          className="c4-reset-button"
          onClick={() => setConfirmingReset(true)}
        >
          RESTART GAME
        </button>
      </main>

      {confirmingReset && (
        <div className="c4-overlay">
          <div className="c4-popup">
            <h2>RESTART GAME?</h2>
            <p>
              This will end the current game
              {isNetworked ? " for both players" : ""} and start over.
            </p>

            <div className="c4-confirm-grid">
              <button
                className="c4-confirm-yes"
                onClick={() => {
                  setConfirmingReset(false);
                  resetGame();
                }}
              >
                YES, RESTART
              </button>

              <button
                className="c4-confirm-no"
                onClick={() => setConfirmingReset(false)}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {finished && (
        <div className="c4-overlay">
          <div className="c4-winner-popup">
            <div
              className="c4-winner-disc"
              style={{
                background:
                  finished.winnerIndex !== null
                    ? DISC_COLORS[finished.winnerIndex]
                    : "linear-gradient(180deg, #a7a1ff, #7168d8)",
              }}
            />

            <h1>
              {finished.winnerIndex !== null
                ? `${names[finished.winnerIndex]} WINS!`
                : "IT'S A DRAW!"}
            </h1>

            <p>
              {finished.winnerIndex !== null
                ? "Four in a row!"
                : "The board filled up with no winner."}
            </p>

            <button className="c4-restart-winning" onClick={resetGame}>
              PLAY AGAIN
            </button>
          </div>
        </div>
      )}

      <div className="c4-grass" />
    </div>
  );
}
