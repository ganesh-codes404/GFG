import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { socket } from "../socket";
import RoundTablePlayers from "../components/RoundTablePlayers";
import ActionNotification from "../components/ActionNotification";
import GameLog from "../components/GameLog";
import PlayerStatus from "../components/PlayerStatus";
import RulesModal from "../components/RulesModal";
import Dice from "../components/Dice";
import { useNotifications } from "../hooks/useNotifications";
import { useGameTransitions } from "../hooks/useGameTransitions";
import { nameFor, logWithNicknames } from "../utils/nicknames";
import "./SnakesAndLadders.css";

const CURRENT_GAME = "Snakes and Ladders";

const PLAYER_COLORS = ["#e74c3c", "#3498db", "#f1c40f", "#2ecc71", "#9b59b6", "#e67e22", "#1abc9c"];

const RULES_SECTIONS = [
  { heading: "Objective", body: "Be the first to reach square 100." },
  { heading: "Rolling", body: "Roll one die on your turn and move that many squares forward." },
  { heading: "Ladders", body: "Land on the bottom of a ladder and climb straight to the top." },
  { heading: "Snakes", body: "Land on a snake's head and slide down to its tail." },
  { heading: "Finishing", body: "You need the exact roll to land on 100 -- an overshoot just passes your turn." },
  { heading: "Board", body: "Every game generates a brand new random layout of 8 snakes and 8 ladders." },
];

// Classic boustrophedon numbering: square 1 bottom-left, alternating
// direction each row going up.
function squareToGrid(square) {
  const idx = square - 1;
  const rowFromBottom = Math.floor(idx / 10);
  const posInRow = idx % 10;
  const col = rowFromBottom % 2 === 0 ? posInRow : 9 - posInRow;
  const row = 9 - rowFromBottom;
  return { row, col };
}

function squareCenterPercent(square) {
  const { row, col } = squareToGrid(square);
  return { x: (col + 0.5) * 10, y: (row + 0.5) * 10 };
}

export default function SnakesAndLadders() {
  const location = useLocation();
  const navigate = useNavigate();
  const code = location.state?.code;
  const room = location.state?.room;

  if (!code) {
    return (
      <div className="snl-screen snl-gate">
        <div className="snl-popup">
          <h2>MULTIPLAYER ONLY</h2>
          <p>Snakes and Ladders needs a real room with 3-7 players.</p>
          <button className="snl-button" onClick={() => navigate("/create-room")}>
            CREATE A ROOM
          </button>
        </div>
      </div>
    );
  }

  return <NetworkedSnakesAndLadders code={code} room={room} />;
}

function NetworkedSnakesAndLadders({ code, room }) {
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
      <div className="snl-screen snl-gate">
        <div className="snl-popup">
          <h2>CAN'T JOIN GAME</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="snl-screen snl-gate">
        <div className="snl-popup">
          <h2>CONNECTING...</h2>
        </div>
      </div>
    );
  }

  return (
    <SnakesAndLaddersGame
      state={state}
      mySeat={seat}
      dispatch={dispatch}
      canControl={canControl}
      nextGame={nextGame}
      onNextGame={requestNextGame}
      onRematch={() => socket.emit("reset-game", { code })}
    />
  );
}

function SnakesAndLaddersGame({ state, mySeat, dispatch, canControl, nextGame, onNextGame, onRematch }) {
  const [showRules, setShowRules] = useState(false);
  const [rolling, setRolling] = useState(false);
  const { notifications, push } = useNotifications();
  const lastLogLength = useRef(0);

  useEffect(() => {
    const newLines = state.log.slice(lastLogLength.current);
    lastLogLength.current = state.log.length;

    for (const line of newLines) {
      const match = line.match(/^Player (\d+)/);
      const seat = match ? Number(match[1]) - 1 : null;

      if (/climbed a ladder/i.test(line)) push("LADDER!", { tone: "good", seat });
      else if (/bitten by a snake/i.test(line)) push("SNAKE!", { tone: "danger", seat });
      else if (/exact roll/i.test(line)) push("NEED EXACT ROLL", { tone: "info", seat });
    }
  }, [state.log, push]);

  const isMyTurn = state.currentSeat === mySeat;

  const handleRoll = async () => {
    setRolling(true);
    await dispatch("roll-dice", {});
    setTimeout(() => setRolling(false), 500);
  };

  if (state.finished) {
    return (
      <VictoryScreen
        state={state}
        mySeat={mySeat}
        canControl={canControl}
        nextGame={nextGame}
        onNextGame={onNextGame}
        onRematch={onRematch}
      />
    );
  }

  const players = state.players.map((p) => ({ ...p, seat: p.seat }));

  const notificationsBySeat = (seat) => notifications.filter((n) => n.seat === seat);

  return (
    <div className="snl-screen">
      <header className="snl-header">
        <h1 className="snl-logo">SNAKES &amp; LADDERS</h1>
        <button className="snl-info-button" onClick={() => setShowRules(true)}>
          ⓘ
        </button>
      </header>

      <RoundTablePlayers
        className="snl-table"
        players={players}
        center={<Board state={state} />}
        renderPlayer={(player) => (
          <div
            className={`snl-seat ${player.seat === mySeat ? "self" : ""}`}
            style={{ "--player-color": PLAYER_COLORS[player.seat] }}
          >
            <div className="snl-seat-name">
              <span className="snl-seat-swatch" />
              {nameFor(state, player.seat)}
              {player.seat === mySeat ? " (you)" : ""}
            </div>
            <div className="snl-seat-position">Square {player.position}</div>
            <PlayerStatus isActive={state.currentSeat === player.seat} />
            <ActionNotification notifications={notificationsBySeat(player.seat)} />
          </div>
        )}
      />

      <div className="snl-controls">
        {state.lastRoll && <Dice values={[state.lastRoll]} rolling={rolling} />}
        <button className="snl-action-button roll" disabled={!isMyTurn} onClick={handleRoll}>
          🎲 ROLL DICE
        </button>
      </div>

      <GameLog entries={logWithNicknames(state.log, state)} title="EVENTS" />

      {showRules && (
        <RulesModal title="HOW TO PLAY" sections={RULES_SECTIONS} onClose={() => setShowRules(false)} />
      )}
    </div>
  );
}

function Board({ state }) {
  const { ladders, snakes } = state.board;

  return (
    <div className="snl-board">
      <svg className="snl-board-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
        {ladders.map((l, i) => {
          const from = squareCenterPercent(l.from);
          const to = squareCenterPercent(l.to);
          return (
            <line
              key={`ladder-${i}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="#3fb968"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          );
        })}
        {snakes.map((s, i) => {
          const from = squareCenterPercent(s.from);
          const to = squareCenterPercent(s.to);
          return (
            <line
              key={`snake-${i}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="#d94457"
              strokeWidth="1.4"
              strokeDasharray="2 1.5"
              strokeLinecap="round"
            />
          );
        })}
      </svg>

      <div className="snl-grid">
        {Array.from({ length: 100 }, (_, i) => i + 1).map((square) => {
          const { row, col } = squareToGrid(square);
          const occupants = state.players.filter((p) => p.position === square);

          return (
            <div
              key={square}
              className="snl-cell"
              style={{ gridRow: row + 1, gridColumn: col + 1 }}
            >
              <span className="snl-cell-number">{square}</span>
              <div className="snl-cell-tokens">
                {occupants.map((p) => (
                  <span key={p.seat} className="snl-token" style={{ background: PLAYER_COLORS[p.seat] }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VictoryScreen({ state, mySeat, canControl, nextGame, onNextGame, onRematch }) {
  return (
    <div className="snl-screen snl-gate">
      <div className="snl-popup snl-victory">
        <div className="snl-trophy">🎉</div>
        <h1>{nameFor(state, state.winner)} Wins!</h1>
        <div className="snl-final-stats">
          {state.players.map((p) => (
            <div key={p.seat} className="snl-final-row" style={{ "--player-color": PLAYER_COLORS[p.seat] }}>
              <span>
                {nameFor(state, p.seat)}
                {p.seat === mySeat ? " (you)" : ""}
              </span>
              <strong>Square {p.position}</strong>
            </div>
          ))}
        </div>

        {canControl ? (
          <div className="snl-postgame-actions">
            <button className="snl-button" onClick={onRematch}>
              REMATCH
            </button>
            {nextGame && (
              <button className="snl-button next" onClick={onNextGame}>
                NEXT GAME: {nextGame.toUpperCase()}
              </button>
            )}
          </div>
        ) : (
          <p className="snl-waiting-host">Waiting for the host to choose what's next...</p>
        )}
      </div>
    </div>
  );
}
