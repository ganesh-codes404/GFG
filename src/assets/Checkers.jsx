import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { socket } from "../socket";
import { useGameTransitions } from "../hooks/useGameTransitions";
import "./Checkers.css";

const CURRENT_GAME = "Checkers";
const BOARD_SIZE = 8;

export default function Checkers() {
  const location = useLocation();
  const navigate = useNavigate();
  const code = location.state?.code;
  const room = location.state?.room;

  if (!code) {
    return (
      <div className="chk-screen chk-gate">
        <div className="chk-popup">
          <h2>MULTIPLAYER ONLY</h2>
          <p>Checkers needs a real room with exactly 2 players.</p>
          <button className="chk-button" onClick={() => navigate("/create-room")}>
            CREATE A ROOM
          </button>
        </div>
      </div>
    );
  }

  return <NetworkedCheckers code={code} room={room} />;
}

function NetworkedCheckers({ code, room }) {
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

    const handleState = (next) => setState(next);
    socket.on("game-state", handleState);
    return () => socket.off("game-state", handleState);
  }, [code]);

  const dispatch = (action, payload) =>
    new Promise((resolve) => {
      socket.emit("game-action", { code, action, payload }, (response) => resolve(response));
    });

  if (error) {
    return (
      <div className="chk-screen chk-gate">
        <div className="chk-popup">
          <h2>CAN'T JOIN GAME</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="chk-screen chk-gate">
        <div className="chk-popup">
          <h2>CONNECTING...</h2>
        </div>
      </div>
    );
  }

  return (
    <CheckersBoard
      state={state}
      mySeat={seat}
      dispatch={dispatch}
      isHost={isHost}
      nextGame={nextGame}
      onNextGame={requestNextGame}
      onRematch={() => socket.emit("reset-game", { code })}
    />
  );
}

function CheckersBoard({ state, mySeat, dispatch, isHost, nextGame, onNextGame, onRematch }) {
  const [selected, setSelected] = useState(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const myTurn = mySeat === state.currentSeat;

  // If a multi-jump is forced, the only selectable piece is the one that
  // must keep jumping -- lock the selection to it automatically.
  useEffect(() => {
    if (state.mustContinueFrom && myTurn) {
      setSelected(state.mustContinueFrom);
    } else if (!myTurn) {
      setSelected(null);
    }
  }, [state.mustContinueFrom, myTurn, state.currentSeat]);

  const flip = mySeat === 1;
  const toDisplay = (r, c) => (flip ? { row: BOARD_SIZE - 1 - r, col: BOARD_SIZE - 1 - c } : { row: r, col: c });

  const destinationsForSelected = selected
    ? state.legalMoves.filter((m) => m.from.row === selected.row && m.from.col === selected.col)
    : [];
  const destinationSquares = new Set(destinationsForSelected.map((m) => `${m.to.row}-${m.to.col}`));

  const mySelectableSquares = new Set(
    state.legalMoves
      .filter((m) => (state.mustContinueFrom ? m.from.row === state.mustContinueFrom.row && m.from.col === state.mustContinueFrom.col : true))
      .map((m) => `${m.from.row}-${m.from.col}`)
  );

  const handleSquareClick = (row, col) => {
    if (state.finished || !myTurn) return;

    const key = `${row}-${col}`;

    if (selected && destinationSquares.has(key)) {
      dispatch("move", { from: selected, to: { row, col } }).then((response) => {
        if (!response?.success) console.warn("Move rejected:", response?.error);
      });
      setSelected(null);
      return;
    }

    if (state.mustContinueFrom) return; // locked to the forced piece

    const piece = state.board[row][col];
    if (piece?.seat === mySeat && mySelectableSquares.has(key)) {
      setSelected({ row, col });
    } else {
      setSelected(null);
    }
  };

  const resetGame = () => onRematch();

  return (
    <div className="chk-screen">
      <header className="chk-header">
        <h1 className="chk-logo">CHECKERS</h1>
      </header>

      <div className="chk-turn-row">
        {!state.finished && (
          <span className={`chk-turn-tag ${myTurn ? "mine" : ""}`}>
            {myTurn ? "YOUR TURN" : "OPPONENT'S TURN"}
            {state.mustContinueFrom && myTurn ? " -- KEEP JUMPING!" : ""}
          </span>
        )}
      </div>

      <div className={`chk-board ${!myTurn ? "not-my-turn" : ""}`}>
        {Array.from({ length: BOARD_SIZE }, (_, displayR) =>
          Array.from({ length: BOARD_SIZE }, (_, displayC) => {
            const { row, col } = toDisplay(displayR, displayC);
            const dark = (row + col) % 2 === 1;
            const piece = state.board[row][col];
            const key = `${row}-${col}`;
            const isSelected = selected && selected.row === row && selected.col === col;
            const isDestination = destinationSquares.has(key);
            const isSelectable = dark && myTurn && !state.finished && mySelectableSquares.has(key) && piece?.seat === mySeat;

            return (
              <button
                key={key}
                type="button"
                className={`chk-square ${dark ? "dark" : "light"} ${isSelected ? "selected" : ""} ${isDestination ? "destination" : ""}`}
                disabled={!dark || state.finished}
                onClick={() => dark && handleSquareClick(row, col)}
              >
                {piece && (
                  <span
                    className={`chk-piece seat-${piece.seat} ${piece.king ? "king" : ""} ${isSelectable ? "selectable" : ""}`}
                  />
                )}
                {isDestination && <span className="chk-destination-dot" />}
              </button>
            );
          })
        )}
      </div>

      <button className="chk-reset-button" onClick={() => setConfirmingReset(true)}>
        RESTART GAME
      </button>

      {confirmingReset && (
        <div className="chk-overlay">
          <div className="chk-popup">
            <h2>RESTART GAME?</h2>
            <p>This will end the current game for both players and start over.</p>
            <div className="chk-confirm-grid">
              <button
                className="chk-confirm-yes"
                onClick={() => {
                  setConfirmingReset(false);
                  resetGame();
                }}
              >
                YES, RESTART
              </button>
              <button className="chk-confirm-no" onClick={() => setConfirmingReset(false)}>
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {state.finished && (
        <div className="chk-overlay">
          <div className="chk-popup chk-victory">
            <div className="chk-trophy">🏆</div>
            <h1>Player {state.finished.winner + 1} Wins!</h1>

            {isHost ? (
              <div className="chk-postgame-actions">
                <button className="chk-button" onClick={onRematch}>
                  REMATCH
                </button>
                {nextGame && (
                  <button className="chk-button next" onClick={onNextGame}>
                    NEXT GAME: {nextGame.toUpperCase()}
                  </button>
                )}
              </div>
            ) : (
              <p className="chk-waiting-host">Waiting for the host to choose what's next...</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
