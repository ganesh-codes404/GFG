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
import "./Ludo.css";

const CURRENT_GAME = "Ludo";

const GRID_SIZE = 14;
// Rotates the server's 0-51 track numbering so each color's entry square
// lands on the board edge next to that color's own yard.
const RING_SHIFT = 20;

const YARD_LAYOUT = [
  { rowStart: 1, colStart: 1 }, // red -- top-left
  { rowStart: 1, colStart: 7 }, // green -- top-right
  { rowStart: 7, colStart: 7 }, // yellow -- bottom-right
  { rowStart: 7, colStart: 1 }, // blue -- bottom-left
];

const RULES_SECTIONS = [
  { heading: "Objective", body: "Get all 4 of your tokens home before anyone else." },
  { heading: "Leaving the yard", body: "Roll a 6 to bring a token out onto the board." },
  { heading: "Moving", body: "Move a token forward by the number you rolled." },
  { heading: "Capturing", body: "Land exactly on an opponent's token (on a non-safe square) to send it back to their yard." },
  { heading: "Safe squares", body: "Marked with a star -- no captures happen there." },
  { heading: "Home stretch", body: "After looping the board, enter your own colored home lane. You need an exact roll to reach the center." },
  { heading: "Extra turns", body: "Roll a 6, capture a token, or bring one home, and you roll again." },
];

function ringCell(serverPos) {
  const pos = (serverPos + RING_SHIFT) % 52;
  const N = GRID_SIZE;

  if (pos <= 13) return { row: N - 1, col: N - 1 - pos };
  if (pos <= 26) return { row: N - 1 - (pos - 13), col: 0 };
  if (pos <= 39) return { row: 0, col: pos - 26 };
  return { row: pos - 39, col: N - 1 };
}

export default function Ludo() {
  const location = useLocation();
  const navigate = useNavigate();
  const code = location.state?.code;
  const room = location.state?.room;

  if (!code) {
    return (
      <div className="ldo-screen ldo-gate">
        <div className="ldo-popup">
          <h2>MULTIPLAYER ONLY</h2>
          <p>Ludo needs a real room with 3-4 players.</p>
          <button className="ldo-button" onClick={() => navigate("/create-room")}>
            CREATE A ROOM
          </button>
        </div>
      </div>
    );
  }

  return <NetworkedLudo code={code} room={room} />;
}

function NetworkedLudo({ code, room }) {
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
      <div className="ldo-screen ldo-gate">
        <div className="ldo-popup">
          <h2>CAN'T JOIN GAME</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="ldo-screen ldo-gate">
        <div className="ldo-popup">
          <h2>CONNECTING...</h2>
        </div>
      </div>
    );
  }

  return (
    <LudoGame
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

function LudoGame({ state, mySeat, dispatch, isHost, nextGame, onNextGame, onRematch }) {
  const [showRules, setShowRules] = useState(false);
  const [rolling, setRolling] = useState(false);
  const { notifications, push } = useNotifications();
  const lastLogLength = useRef(0);

  useEffect(() => {
    const newLines = state.log.slice(lastLogLength.current);
    lastLogLength.current = state.log.length;

    for (const line of newLines) {
      const match = line.match(/^(\w+) \(Player (\d+)\)/);
      const seat = match ? Number(match[2]) - 1 : null;

      if (/sent .* back to the yard/i.test(line)) push("CAPTURED!", { tone: "danger", seat });
      else if (/brought all 4 tokens home/i.test(line)) push("WINNER!", { tone: "good", seat });
      else if (/brought a token home/i.test(line)) push("HOME!", { tone: "good", seat });
      else if (/goes again/i.test(line)) push("GOES AGAIN", { tone: "info", seat });
    }
  }, [state.log, push]);

  const isMyTurn = state.currentSeat === mySeat;

  const handleRoll = async () => {
    setRolling(true);
    await dispatch("roll-dice", {});
    setTimeout(() => setRolling(false), 500);
  };

  const handleMoveToken = async (tokenIndex) => {
    await dispatch("move-token", { tokenIndex });
  };

  if (state.finished) {
    return (
      <VictoryScreen
        state={state}
        mySeat={mySeat}
        isHost={isHost}
        nextGame={nextGame}
        onNextGame={onNextGame}
        onRematch={onRematch}
      />
    );
  }

  const notificationsBySeat = (seat) => notifications.filter((n) => n.seat === seat);

  return (
    <div className="ldo-screen">
      <header className="ldo-header">
        <h1 className="ldo-logo">LUDO</h1>
        <button className="ldo-info-button" onClick={() => setShowRules(true)}>
          ⓘ
        </button>
      </header>

      <RoundTablePlayers
        className="ldo-table"
        players={state.players}
        center={<Board state={state} />}
        renderPlayer={(player) => (
          <div
            className={`ldo-seat ${player.seat === mySeat ? "self" : ""}`}
            style={{ "--player-color": state.colorHex[player.seat] }}
          >
            <div className="ldo-seat-name">
              <span className="ldo-seat-swatch" />
              {state.colorNames[player.seat]}
              {player.seat === mySeat ? " (you)" : ""}
            </div>
            <TokenPips tokens={player.tokens} />
            <PlayerStatus isActive={state.currentSeat === player.seat} />
            <ActionNotification notifications={notificationsBySeat(player.seat)} />
          </div>
        )}
      />

      <div className="ldo-controls">
        {state.lastRoll && <Dice values={[state.lastRoll]} rolling={rolling} />}

        {isMyTurn && !state.awaitingMove && (
          <button className="ldo-action-button roll" onClick={handleRoll}>
            🎲 ROLL DICE
          </button>
        )}

        {isMyTurn && state.awaitingMove && (
          <div className="ldo-token-picker">
            <p>Choose a token to move</p>
            <div className="ldo-token-buttons">
              {state.players[mySeat].tokens.map((token, index) => (
                <button
                  key={index}
                  className="ldo-token-button"
                  disabled={!state.legalMoves.includes(index)}
                  onClick={() => handleMoveToken(index)}
                  style={{ "--player-color": state.colorHex[mySeat] }}
                >
                  Token {index + 1}
                  <small>{tokenStatusLabel(token)}</small>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <GameLog entries={state.log} title="EVENTS" />

      {showRules && (
        <RulesModal title="HOW TO PLAY" sections={RULES_SECTIONS} onClose={() => setShowRules(false)} />
      )}
    </div>
  );
}

function tokenStatusLabel(token) {
  if (token.status === "yard") return "In yard";
  if (token.status === "home") return "Home!";
  if (token.status === "stretch") return `Home lane ${token.homeIndex + 1}/6`;
  return `Square ${token.globalPos}`;
}

function TokenPips({ tokens }) {
  return (
    <div className="ldo-token-pips">
      {tokens.map((token, index) => (
        <span key={index} className={`ldo-pip ldo-pip-${token.status}`} title={tokenStatusLabel(token)}>
          {token.status === "home" ? "★" : token.status === "stretch" ? token.homeIndex + 1 : ""}
        </span>
      ))}
    </div>
  );
}

function Board({ state }) {
  const cells = Array.from({ length: 52 }, (_, pos) => pos);

  return (
    <div className="ldo-board">
      {YARD_LAYOUT.map((yard, seat) => (
        <div
          key={seat}
          className={`ldo-yard ${seat >= state.players.length ? "unused" : ""}`}
          style={{
            gridRow: `${yard.rowStart + 1} / span 6`,
            gridColumn: `${yard.colStart + 1} / span 6`,
            "--player-color": state.colorHex[seat],
          }}
        >
          {seat < state.players.length && (
            <div className="ldo-yard-tokens">
              {state.players[seat].tokens.map((token, index) =>
                token.status === "yard" ? <span key={index} className="ldo-yard-token" /> : null
              )}
            </div>
          )}
        </div>
      ))}

      {cells.map((pos) => {
        const { row, col } = ringCell(pos);
        const isSafe = state.safeSquares.includes(pos);
        const occupants = [];

        state.players.forEach((player) => {
          player.tokens.forEach((token) => {
            if (token.status === "track" && token.globalPos === pos) {
              occupants.push({ seat: player.seat });
            }
          });
        });

        return (
          <div
            key={pos}
            className={`ldo-cell ${isSafe ? "safe" : ""}`}
            style={{ gridRow: row + 1, gridColumn: col + 1 }}
          >
            {isSafe && <span className="ldo-star">★</span>}
            <div className="ldo-cell-tokens">
              {occupants.map((o, i) => (
                <span key={i} className="ldo-token" style={{ background: state.colorHex[o.seat] }} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VictoryScreen({ state, mySeat, isHost, nextGame, onNextGame, onRematch }) {
  return (
    <div className="ldo-screen ldo-gate">
      <div className="ldo-popup ldo-victory">
        <div className="ldo-trophy">🎉</div>
        <h1 style={{ color: state.colorHex[state.winner] }}>
          {state.colorNames[state.winner]} Wins!
        </h1>
        <div className="ldo-final-stats">
          {state.players.map((p) => (
            <div key={p.seat} className="ldo-final-row" style={{ "--player-color": state.colorHex[p.seat] }}>
              <span>
                {state.colorNames[p.seat]}
                {p.seat === mySeat ? " (you)" : ""}
              </span>
              <strong>{p.tokens.filter((t) => t.status === "home").length}/4 home</strong>
            </div>
          ))}
        </div>

        {isHost ? (
          <div className="ldo-postgame-actions">
            <button className="ldo-button" onClick={onRematch}>
              REMATCH
            </button>
            {nextGame && (
              <button className="ldo-button next" onClick={onNextGame}>
                NEXT GAME: {nextGame.toUpperCase()}
              </button>
            )}
          </div>
        ) : (
          <p className="ldo-waiting-host">Waiting for the host to choose what's next...</p>
        )}
      </div>
    </div>
  );
}
